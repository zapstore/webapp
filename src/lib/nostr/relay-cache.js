/**
 * In-Memory Relay Cache — Server-side Nostr event cache
 *
 * Single server-side source of truth. Fed by a reconnectable pool that
 * maintains persistent subscriptions to upstream relays.
 *
 * On cold start, pulls recent events from upstream relays to warm up.
 * Provides NIP-01 filter query interface for REST API endpoints and prerendering.
 *
 * Server-only module — never import from client code.
 */
import { SimplePool } from 'nostr-tools';
import {
	DEFAULT_CATALOG_RELAYS,
	DEFAULT_SOCIAL_RELAYS,
	PROFILE_RELAYS,
	EVENT_KINDS,
	PLATFORM_FILTER
} from '$lib/config';

const EOSE_GRACE_MS = 300;
const QUERY_TIMEOUT_MS = 5000;
const WARMUP_TIMEOUT_MS = 8000;

// ============================================================================
// In-Memory Event Store
// ============================================================================

/** @type {Map<string, import('nostr-tools').Event>} */
const eventsById = new Map();

/** @type {Map<string, string>} replaceableKey -> event id (for dedup) */
const replaceableIndex = new Map();

/** @type {Map<number, Set<string>>} kind -> event ids */
const kindIndex = new Map();

/** @type {Map<string, Set<string>>} pubkey -> event ids */
const pubkeyIndex = new Map();

let warmedUp = false;

function isReplaceable(kind) {
	return (kind >= 10000 && kind < 20000) || kind >= 30000;
}

function getReplaceableKey(event) {
	const dTag = event.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
	return `${event.kind}:${event.pubkey}:${dTag}`;
}

function addToIndex(index, key, eventId) {
	let set = index.get(key);
	if (!set) {
		set = new Set();
		index.set(key, set);
	}
	set.add(eventId);
}

function removeFromIndex(index, key, eventId) {
	const set = index.get(key);
	if (set) {
		set.delete(eventId);
		if (set.size === 0) index.delete(key);
	}
}

/**
 * Add an event to the in-memory store.
 * Handles replaceable event deduplication.
 */
function addEvent(event) {
	if (!event?.id || typeof event.kind !== 'number') return;

	if (isReplaceable(event.kind)) {
		const key = getReplaceableKey(event);
		const existingId = replaceableIndex.get(key);
		if (existingId) {
			const existing = eventsById.get(existingId);
			if (existing && existing.created_at >= event.created_at) return; // Keep newer
			// Remove old version
			eventsById.delete(existingId);
			removeFromIndex(kindIndex, existing.kind, existingId);
			removeFromIndex(pubkeyIndex, existing.pubkey, existingId);
		}
		replaceableIndex.set(key, event.id);
	}

	eventsById.set(event.id, event);
	addToIndex(kindIndex, event.kind, event.id);
	addToIndex(pubkeyIndex, event.pubkey, event.id);
}

/**
 * Check if event matches tag filters in a NIP-01 filter.
 */
function matchesTags(event, filter) {
	for (const [key, values] of Object.entries(filter)) {
		if (!key.startsWith('#') || !Array.isArray(values) || values.length === 0) continue;
		const tagName = key.slice(1);
		const valueSet = new Set(values);
		const hasMatch = event.tags?.some((t) => t[0] === tagName && t[1] && valueSet.has(t[1]));
		if (!hasMatch) return false;
	}
	return true;
}

/**
 * Query the in-memory store with a NIP-01 filter.
 *
 * @param {object} filter
 * @returns {import('nostr-tools').Event[]}
 */
export function queryCache(filter) {
	// Start with the most selective index
	let candidateIds;

	if (filter.ids?.length > 0) {
		candidateIds = new Set(filter.ids.filter((id) => eventsById.has(id)));
	} else if (filter.kinds?.length === 1 && filter.authors?.length === 1) {
		// Intersect kind and pubkey indices
		const byKind = kindIndex.get(filter.kinds[0]);
		const byPubkey = pubkeyIndex.get(filter.authors[0]);
		if (!byKind || !byPubkey) return [];
		candidateIds = new Set([...byKind].filter((id) => byPubkey.has(id)));
	} else if (filter.kinds?.length > 0) {
		candidateIds = new Set();
		for (const kind of filter.kinds) {
			const ids = kindIndex.get(kind);
			if (ids) for (const id of ids) candidateIds.add(id);
		}
	} else if (filter.authors?.length > 0) {
		candidateIds = new Set();
		for (const author of filter.authors) {
			const ids = pubkeyIndex.get(author);
			if (ids) for (const id of ids) candidateIds.add(id);
		}
	} else {
		candidateIds = new Set(eventsById.keys());
	}

	let results = [];

	for (const id of candidateIds) {
		const event = eventsById.get(id);
		if (!event) continue;

		// Apply filters not handled by index
		if (filter.kinds && filter.kinds.length > 1 && !filter.kinds.includes(event.kind)) continue;
		if (
			filter.authors &&
			filter.authors.length > 0 &&
			!(filter.kinds?.length === 1 && filter.authors.length === 1) &&
			!filter.authors.includes(event.pubkey)
		)
			continue;
		if (filter.since !== undefined && event.created_at < filter.since) continue;
		if (filter.until !== undefined && event.created_at > filter.until) continue;

		if (!matchesTags(event, filter)) continue;

		results.push(event);
	}

	// Sort by created_at descending
	results.sort((a, b) => {
		const byTime = b.created_at - a.created_at;
		if (byTime !== 0) return byTime;
		return (a.id ?? '').localeCompare(b.id ?? '');
	});

	if (filter.limit && filter.limit > 0) {
		results = results.slice(0, filter.limit);
	}

	return results;
}

// ============================================================================
// Relay Pool (persistent subscriptions)
// ============================================================================

const pool = new SimplePool();

/** Active subscription closers for cleanup */
const activeSubscriptions = [];

/**
 * Query upstream relays and add results to cache. Returns collected events.
 */
function queryRelaysRaw(relayUrls, filter, timeoutMs = QUERY_TIMEOUT_MS) {
	return new Promise((resolve) => {
		const events = [];
		let settled = false;
		let eoseTimer = null;
		let timeoutTimer = null;

		const filterDesc = `kinds=${JSON.stringify(filter.kinds)} limit=${filter.limit}`;
		console.log(`[RelayCache] queryRelaysRaw: ${filterDesc} from ${relayUrls.join(', ')}`);

		const finish = (reason) => {
			if (settled) return;
			settled = true;
			if (eoseTimer) clearTimeout(eoseTimer);
			if (timeoutTimer) clearTimeout(timeoutTimer);
			try {
				sub?.close();
			} catch {
				/* noop */
			}
			// Add all events to cache
			for (const event of events) {
				addEvent(event);
			}
			console.log(`[RelayCache] queryRelaysRaw finished (${reason}): ${events.length} events for ${filterDesc}`);
			resolve(events);
		};

		const sub = pool.subscribeMany(relayUrls, filter, {
			onevent(event) {
				if (event?.id) events.push(event);
			},
			oneose() {
				// Wait a grace period after EOSE for late events
				if (!eoseTimer) {
					eoseTimer = setTimeout(() => finish('eose+grace'), EOSE_GRACE_MS);
				}
			},
			onclose(reasons) {
				console.log(`[RelayCache] onclose for ${filterDesc}:`, reasons);
				if (!settled) finish('closed');
			}
		});

		timeoutTimer = setTimeout(() => finish('timeout'), timeoutMs);
	});
}

/**
 * Warm up the cache by fetching recent catalog data from upstream relays.
 * Called on server start.
 */
export async function warmUp() {
	if (warmedUp) return;

	console.log('[RelayCache] Warming up from upstream relays...');
	const start = Date.now();

	try {
		// Fetch catalog data in parallel
		await Promise.allSettled([
			// Recent releases (for app discovery)
			queryRelaysRaw(DEFAULT_CATALOG_RELAYS, {
				kinds: [EVENT_KINDS.RELEASE],
				limit: 500
			}, WARMUP_TIMEOUT_MS),

			// Apps
			queryRelaysRaw(DEFAULT_CATALOG_RELAYS, {
				kinds: [EVENT_KINDS.APP],
				...PLATFORM_FILTER,
				limit: 500
			}, WARMUP_TIMEOUT_MS),

			// Stacks
			queryRelaysRaw([...DEFAULT_CATALOG_RELAYS, ...DEFAULT_SOCIAL_RELAYS], {
				kinds: [EVENT_KINDS.APP_STACK],
				...PLATFORM_FILTER,
				limit: 200
			}, WARMUP_TIMEOUT_MS),

			// Profiles for catalog authors (fetched separately on demand)
		]);

		warmedUp = true;
		const elapsed = Date.now() - start;
		console.log(
			`[RelayCache] Warm-up complete in ${elapsed}ms. ` +
				`${eventsById.size} events cached.`
		);
	} catch (err) {
		console.error('[RelayCache] Warm-up failed:', err);
		warmedUp = true; // Don't retry, serve what we have
	}
}

/**
 * Fetch profiles from upstream relays and add to cache.
 * Returns a map of pubkey -> profile event.
 *
 * @param {string[]} pubkeys
 * @param {{ timeout?: number }} options
 * @returns {Promise<Map<string, import('nostr-tools').Event>>}
 */
export async function fetchProfiles(pubkeys, options = {}) {
	const { timeout = QUERY_TIMEOUT_MS } = options;
	const results = new Map();
	if (!pubkeys || pubkeys.length === 0) return results;

	const normalized = [
		...new Set(
			pubkeys
				.map((pk) => String(pk).trim().toLowerCase())
				.filter((pk) => /^[a-f0-9]{64}$/.test(pk))
		)
	];

	// Check cache first
	const missing = [];
	for (const pk of normalized) {
		const cached = queryCache({ kinds: [EVENT_KINDS.PROFILE], authors: [pk], limit: 1 });
		if (cached.length > 0) {
			results.set(pk, cached[0]);
		} else {
			missing.push(pk);
		}
	}

	// Fetch missing from relays
	if (missing.length > 0) {
		const events = await queryRelaysRaw(
			PROFILE_RELAYS,
			{ kinds: [EVENT_KINDS.PROFILE], authors: missing, limit: missing.length * 2 },
			timeout
		);

		// Pick latest profile per pubkey
		const latestByPubkey = new Map();
		for (const event of events) {
			const pk = event.pubkey?.toLowerCase();
			if (!pk) continue;
			const existing = latestByPubkey.get(pk);
			if (!existing || event.created_at > existing.created_at) {
				latestByPubkey.set(pk, event);
			}
		}

		for (const pk of missing) {
			const event = latestByPubkey.get(pk) ?? null;
			if (event) results.set(pk, event);
		}
	}

	return results;
}

/**
 * Query upstream relays on demand (for data not covered by warm-up).
 * Events are added to cache automatically.
 *
 * @param {string[]} relayUrls
 * @param {object} filter
 * @param {{ timeout?: number }} options
 * @returns {Promise<import('nostr-tools').Event[]>}
 */
export async function queryRelays(relayUrls, filter, options = {}) {
	return queryRelaysRaw(relayUrls, filter, options.timeout ?? QUERY_TIMEOUT_MS);
}

/**
 * Check if the cache has been warmed up.
 */
export function isWarmedUp() {
	return warmedUp;
}

/**
 * Get cache stats for debugging.
 */
export function getCacheStats() {
	return {
		totalEvents: eventsById.size,
		kinds: Object.fromEntries(
			[...kindIndex.entries()].map(([k, v]) => [k, v.size])
		),
		warmedUp
	};
}
