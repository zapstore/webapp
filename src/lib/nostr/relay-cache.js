/**
 * In-Memory Relay Cache — Server-side Nostr event store
 *
 * Single server-side source of truth for seed data.
 *
 * Polling intervals:
 *   - Every 60s: top 50 apps (kind 32267) + top 50 stacks (kind 30267)
 *     from relay.zapstore.dev only
 *   - Every 60min: profiles (kind 0) for all cached pubkeys,
 *     from relay.vertexlab.io only
 *
 * On cold start, a full warm-up pull populates the cache. Then polling
 * intervals keep it fresh using `since` to fetch only new events.
 *
 * Server-only module — never import from client code.
 */
import { SimplePool } from 'nostr-tools';
import { building } from '$app/environment';
import {
	EVENT_KINDS,
	PLATFORM_FILTER,
	POLL_INTERVAL_MS
} from '$lib/config';

const EOSE_GRACE_MS = 300;
const QUERY_TIMEOUT_MS = 5000;
const WARMUP_TIMEOUT_MS = 8000;
const PROFILE_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Server-side relay sources (distinct from client-side [CATALOG_RELAY])
const CATALOG_RELAY = 'wss://relay.zapstore.dev';
const PROFILE_RELAY = 'wss://relay.vertexlab.io';

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

let started = false;
let lastCatalogPollTime = 0;
let catalogPollTimer = null;
let profilePollTimer = null;

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

	// Discard encrypted app stacks (non-empty content means encrypted)
	if (event.kind === EVENT_KINDS.APP_STACK && event.content) return;

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
// Relay Pool (polling, not persistent subscriptions)
// ============================================================================

const pool = new SimplePool();

/**
 * Query upstream relays and add results to cache. Returns collected events.
 * Note: SimplePool.subscribeMany expects a single filter object (not an array).
 */
function queryRelaysRaw(relayUrls, filter, timeoutMs = QUERY_TIMEOUT_MS) {
	return new Promise((resolve) => {
		const events = [];
		let settled = false;
		let eoseTimer = null;
		let timeoutTimer = null;

		const filterDesc = `kinds=${JSON.stringify(filter.kinds)} limit=${filter.limit ?? 'none'}`;
		console.log(`[RelayCache] poll: ${filterDesc} from ${relayUrls.join(', ')}`);

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
			for (const event of events) {
				addEvent(event);
			}
			console.log(`[RelayCache] poll finished (${reason}): ${events.length} events for ${filterDesc}`);
			resolve(events);
		};

		const sub = pool.subscribeMany(relayUrls, filter, {
			onevent(event) {
				if (event?.id) events.push(event);
			},
			oneose() {
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
 * Collect all unique pubkeys from cached apps and stacks.
 */
function collectCachedPubkeys() {
	const pubkeys = new Set();
	const appIds = kindIndex.get(EVENT_KINDS.APP);
	const stackIds = kindIndex.get(EVENT_KINDS.APP_STACK);
	if (appIds) {
		for (const id of appIds) {
			const event = eventsById.get(id);
			if (event) pubkeys.add(event.pubkey);
		}
	}
	if (stackIds) {
		for (const id of stackIds) {
			const event = eventsById.get(id);
			if (event) pubkeys.add(event.pubkey);
		}
	}
	return [...pubkeys];
}

/**
 * Extract app references from stack events' `a` tags.
 * Returns { authors: string[], identifiers: string[] } for the batch query.
 */
function extractAppRefsFromStacks(stackEvents) {
	const authors = new Set();
	const identifiers = new Set();
	for (const event of stackEvents) {
		if (!event.tags) continue;
		for (const tag of event.tags) {
			if (tag[0] !== 'a' || !tag[1]) continue;
			// a tag format: "kind:pubkey:d-tag"
			const parts = tag[1].split(':');
			if (parts.length < 3) continue;
			const kind = parseInt(parts[0], 10);
			if (kind !== EVENT_KINDS.APP) continue;
			const pubkey = parts[1];
			const identifier = parts.slice(2).join(':'); // d-tag may contain colons
			if (pubkey && identifier) {
				authors.add(pubkey);
				identifiers.add(identifier);
			}
		}
	}
	return { authors: [...authors], identifiers: [...identifiers] };
}

/**
 * Fetch apps referenced by stack events.
 * Deduplication is handled by addEvent (replaceable event logic).
 */
async function fetchStackReferencedApps(stackEvents, timeoutMs = QUERY_TIMEOUT_MS) {
	const { authors, identifiers } = extractAppRefsFromStacks(stackEvents);
	if (authors.length === 0 || identifiers.length === 0) return;

	console.log(`[RelayCache] Fetching ${identifiers.length} apps referenced by stacks...`);
	await queryRelaysRaw([CATALOG_RELAY], {
		kinds: [EVENT_KINDS.APP],
		authors,
		'#d': identifiers,
		...PLATFORM_FILTER
	}, timeoutMs);
}

/**
 * Initial warm-up: fetch catalog data from relay.zapstore.dev.
 * 1. Top 50 apps + top 30 stacks in parallel
 * 2. Then fetch apps referenced by stacks (deduplicates with step 1)
 */
async function warmUp() {
	console.log('[RelayCache] Warming up...');
	const start = Date.now();

	try {
		const [, stackResult] = await Promise.allSettled([
			// Top 50 apps
			queryRelaysRaw([CATALOG_RELAY], {
				kinds: [EVENT_KINDS.APP],
				...PLATFORM_FILTER,
				limit: 50
			}, WARMUP_TIMEOUT_MS),

			// Top 30 stacks
			queryRelaysRaw([CATALOG_RELAY], {
				kinds: [EVENT_KINDS.APP_STACK],
				...PLATFORM_FILTER,
				limit: 30
			}, WARMUP_TIMEOUT_MS),
		]);

		// Fetch apps referenced by stacks (addEvent deduplicates)
		if (stackResult.status === 'fulfilled' && stackResult.value.length > 0) {
			await fetchStackReferencedApps(stackResult.value, WARMUP_TIMEOUT_MS);
		}

		const elapsed = Date.now() - start;
		console.log(
			`[RelayCache] Warm-up complete in ${elapsed}ms. ` +
				`${eventsById.size} events cached.`
		);
	} catch (err) {
		console.error('[RelayCache] Warm-up failed:', err);
	}
}

/**
 * Poll relay.zapstore.dev for new catalog events since last poll.
 * 1. Top 50 apps + top 30 stacks
 * 2. Then fetch apps referenced by any new stacks
 */
async function pollCatalog() {
	const since = lastCatalogPollTime;
	lastCatalogPollTime = Math.floor(Date.now() / 1000);

	console.log(`[RelayCache] Polling catalog since ${since}...`);

	try {
		const [, stackResult] = await Promise.allSettled([
			queryRelaysRaw([CATALOG_RELAY], {
				kinds: [EVENT_KINDS.APP],
				...PLATFORM_FILTER,
				since,
				limit: 50
			}),
			queryRelaysRaw([CATALOG_RELAY], {
				kinds: [EVENT_KINDS.APP_STACK],
				...PLATFORM_FILTER,
				since,
				limit: 30
			}),
		]);

		// Fetch apps referenced by new stacks
		if (stackResult.status === 'fulfilled' && stackResult.value.length > 0) {
			await fetchStackReferencedApps(stackResult.value);
		}
	} catch (err) {
		console.error('[RelayCache] Catalog poll failed:', err);
	}
}

/**
 * Poll profiles for all cached pubkeys from vertexlab relay.
 * Called every hour — profiles change infrequently.
 */
async function pollProfiles() {
	const pubkeys = collectCachedPubkeys();
	if (pubkeys.length === 0) return;

	console.log(`[RelayCache] Polling ${pubkeys.length} profiles from ${PROFILE_RELAY}...`);

	try {
		await queryRelaysRaw([PROFILE_RELAY], {
			kinds: [EVENT_KINDS.PROFILE],
			authors: pubkeys,
			limit: pubkeys.length
		});
	} catch (err) {
		console.error('[RelayCache] Profile poll failed:', err);
	}
}

/**
 * Start the relay cache: initial warm-up + periodic polling.
 * Called on server boot via hooks.server.js. Idempotent.
 *
 * Skipped entirely during build — no data pages are prerendered,
 * so the cache is not needed at build time.
 */
export async function startPolling() {
	if (started) return;
	if (building) {
		console.log('[RelayCache] Build mode — skipping relay cache entirely');
		return;
	}
	started = true;

	await warmUp();
	lastCatalogPollTime = Math.floor(Date.now() / 1000);

	// Fetch initial profiles after catalog warm-up
	await pollProfiles();

	// Start periodic catalog polling (every 60s).
	// unref() so timers don't prevent process exit on shutdown.
	catalogPollTimer = setInterval(() => pollCatalog(), POLL_INTERVAL_MS);
	catalogPollTimer.unref();
	console.log(`[RelayCache] Catalog polling started (every ${POLL_INTERVAL_MS / 1000}s)`);

	// Start periodic profile polling (every 6h)
	profilePollTimer = setInterval(() => pollProfiles(), PROFILE_POLL_INTERVAL_MS);
	profilePollTimer.unref();
	console.log(`[RelayCache] Profile polling started (every ${PROFILE_POLL_INTERVAL_MS / 60000}min)`);
}

/**
 * Stop polling and close relay connections for graceful shutdown.
 */
export function stopPolling() {
	if (catalogPollTimer) {
		clearInterval(catalogPollTimer);
		catalogPollTimer = null;
	}
	if (profilePollTimer) {
		clearInterval(profilePollTimer);
		profilePollTimer = null;
	}
	try {
		pool.close([CATALOG_RELAY, PROFILE_RELAY]);
	} catch {
		/* already closed */
	}
	started = false;
	console.log('[RelayCache] Stopped polling and closed relay connections');
}

/**
 * Check if the cache has been started (warmed up + polling).
 */
export function isStarted() {
	return started;
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
		started
	};
}
