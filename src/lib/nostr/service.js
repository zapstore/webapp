/**
 * Nostr Service Layer — Client-side
 *
 * Two modes of relay interaction:
 *   1. Persistent subscriptions — live event updates, kept open after EOSE
 *   2. One-shot queries — search, load-more, social features (close after EOSE)
 *
 * ALL events from ALL sources are written to Dexie via putEvents().
 * liveQuery handles reactivity — no manual notification needed.
 */
import { SimplePool, utils } from 'nostr-tools';
import {
	ZAPSTORE_RELAY,
	DEFAULT_CATALOG_RELAYS,
	DEFAULT_SOCIAL_RELAYS,
	COMMENT_AND_ZAP_READ_RELAYS,
	COMMENT_PUBLISH_RELAYS,
	commentZapRelayReadSince,
	commentZapNakReadSince,
	PLATFORM_FILTER,
	EVENT_KINDS,
	SUB_PREFIX,
	ZAPSTORE_COMMUNITY_PUBKEY
} from '$lib/config';

const subId = (feature) => `${SUB_PREFIX}${feature}-${Math.floor(Math.random() * 1e9)}`;
import { APPS_POLL_LIMIT, STACKS_POLL_LIMIT } from '$lib/constants';
import { db, putEvents, queryEvents, queryEvent } from './dexie';

/** Set `localStorage.setItem('zapstore_debug','1')` + reload for relay/Dexie logs and `window.__zapstore`. */
function isNostrDebug() {
	try {
		return typeof localStorage !== 'undefined' && localStorage.getItem('zapstore_debug') === '1';
	} catch {
		return false;
	}
}

function nostrDebug(...args) {
	if (isNostrDebug()) console.log('[Zapstore]', ...args);
}

/**
 * When `zapstore_debug=1`, exposes `queryEvents`, `fetchComments`, Dexie counts, etc. on `window.__zapstore`.
 * Call once after `startLiveSubscriptions()` (e.g. from root layout).
 */
export function installZapstoreDebugHooks() {
	if (typeof globalThis === 'undefined' || !isNostrDebug()) return;
	globalThis.__zapstore = {
		queryEvents,
		putEvents,
		db,
		fetchComments,
		fetchFromRelays,
		commentZapRelayReadSince,
		commentZapNakReadSince,
		COMMENT_AND_ZAP_READ_RELAYS,
		/** @param {number} k */
		countByKind: (k) => db.events.where('kind').equals(Number(k)).count(),
		/** @param {number} [n] */
		sampleKind: (k, n = 8) => db.events.where('kind').equals(Number(k)).limit(n).toArray()
	};
	console.info(
		'[Zapstore] Debug: use globalThis.__zapstore — e.g. await globalThis.__zapstore.countByKind(1111)'
	);
}

// ============================================================================
// Relay Pool
// ============================================================================

let pool = null;

function getPool() {
	if (!pool) {
		pool = new SimplePool();
		for (const url of COMMENT_AND_ZAP_READ_RELAYS) {
			try {
				pool.trustedRelayURLs.add(utils.normalizeURL(url));
			} catch {
				/* noop */
			}
		}
	}
	return pool;
}

/**
 * Publish a signed event to the given relays.
 * @throws {Error} If all relays reject (so callers can surface "not published" to the user).
 */
export async function publishToRelays(relayUrls, signedEvent) {
	if (!relayUrls?.length) throw new Error('No relays to publish to');
	const p = getPool();
	const promises = p.publish(relayUrls, signedEvent);
	const results = await Promise.allSettled(promises);
	const rejected = results.filter((r) => r.status === 'rejected');
	if (rejected.length === results.length) {
		// Log so user can see which relay was used and why it failed (e.g. wrong relay if override not set)
		const errors = results.map((r, i) => {
			const url = relayUrls[i] ?? '?';
			const reason = r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : 'ok';
			return `${url} → ${reason}`;
		});
		console.error('[publishToRelays] All relays rejected. Relays tried:', relayUrls, 'Errors:', errors);
		const firstReason = rejected[0]?.reason;
		const msg = firstReason instanceof Error ? firstReason.message : String(firstReason ?? 'relay rejected');
		throw new Error(`Failed to publish to any relay: ${msg}`);
	}
}

const EOSE_GRACE_MS = 300;

// ============================================================================
// Persistent Relay Subscriptions (live updates)
// ============================================================================

/** @type {Array<{ close: () => void }>} */
let activeSubscriptions = [];

/** Batched event buffer for persistent subscriptions */
let pendingEvents = [];
let flushTimer = null;
const FLUSH_INTERVAL_MS = 100;

/**
 * Buffer an incoming relay event for batched write to Dexie.
 * Events are flushed every 100ms to avoid per-event transaction overhead.
 */
function bufferEvent(event) {
	if (!event?.id) return;
	pendingEvents.push(event);
	if (!flushTimer) {
		flushTimer = setTimeout(flushEvents, FLUSH_INTERVAL_MS);
	}
}

/**
 * Flush buffered events to Dexie.
 */
async function flushEvents() {
	flushTimer = null;
	const batch = pendingEvents;
	pendingEvents = [];
	if (batch.length > 0) {
		if (isNostrDebug()) {
			const byKind = {};
			for (const e of batch) {
				const k = Number(e?.kind);
				if (Number.isFinite(k)) byKind[k] = (byKind[k] ?? 0) + 1;
			}
			nostrDebug('live sub flush → putEvents', batch.length, 'byKind', byKind);
		}
		await putEvents(batch).catch((err) =>
			console.error('[Service] Failed to flush events to Dexie:', err)
		);
	}
}

/**
 * Start persistent relay subscriptions for live catalog updates.
 * Events stream directly into Dexie via the batched buffer.
 * Subscriptions stay open after EOSE — they receive new events as published.
 *
 * All subscriptions use `limit` to cap the initial backfill.
 * Progressive loading (load-more, pagination) handles deeper data.
 *
 * Call on app mount. Idempotent — subsequent calls are no-ops.
 */
export function startLiveSubscriptions() {
	if (activeSubscriptions.length > 0) return; // already started

	const p = getPool();
	const subParams = {
		onevent(event) {
			bufferEvent(event);
		},
		oneose() {
			// Don't close — keep connection open for live updates
		},
		onclose(reasons) {
			if (!isNostrDebug() || !reasons?.length) return;
			const ignorable = reasons.every((r) => r === 'closed by caller');
			if (!ignorable) console.warn('[Zapstore] Persistent subscription closed', reasons);
		}
	};

	// Separate subscriptions per filter (subscribeMany takes a single filter)
	// Limits = POLL_LIMIT (3 × page size) — load-more handles deeper data
	activeSubscriptions.push(
		p.subscribeMany([ZAPSTORE_RELAY], { kinds: [EVENT_KINDS.APP], ...PLATFORM_FILTER, limit: APPS_POLL_LIMIT }, { ...subParams, id: subId('apps') })
	);
	// Releases: needed for app detail pages + liveQuery reactivity
	// since:now — live sub only needs future events; also raises relay specificity score to 3
	activeSubscriptions.push(
		p.subscribeMany([ZAPSTORE_RELAY], { kinds: [EVENT_KINDS.RELEASE], since: Math.floor(Date.now() / 1000), limit: 50 }, { ...subParams, id: subId('releases') })
	);
	// Stacks
	activeSubscriptions.push(
		p.subscribeMany([ZAPSTORE_RELAY], { kinds: [EVENT_KINDS.APP_STACK], ...PLATFORM_FILTER, limit: STACKS_POLL_LIMIT }, { ...subParams, id: subId('stacks') })
	);
	// NIP-09 deletions for apps and stacks — live updates only (past deletions handled by syncDeletions)
	activeSubscriptions.push(
		p.subscribeMany([ZAPSTORE_RELAY], { kinds: [EVENT_KINDS.DELETION], '#k': [String(EVENT_KINDS.APP), String(EVENT_KINDS.APP_STACK)], since: Math.floor(Date.now() / 1000), limit: 50 }, { ...subParams, id: subId('deletions') })
	);
	// Kind 1111 / 9735: nak-shaped one-shot `fetchFromRelays` only — persistent SUB with bare kinds may be "too vague".

	nostrDebug('live subscriptions started (1111/9735 via one-shot reads)');
}

/**
 * Stop all persistent relay subscriptions.
 * Call on app unmount or cleanup.
 */
export function stopLiveSubscriptions() {
	for (const sub of activeSubscriptions) {
		try {
			sub.close();
		} catch {
			/* noop */
		}
	}
	activeSubscriptions = [];

	// Flush any remaining buffered events
	if (flushTimer) {
		clearTimeout(flushTimer);
		flushTimer = null;
	}
	if (pendingEvents.length > 0) {
		const batch = pendingEvents;
		pendingEvents = [];
		putEvents(batch).catch(() => {});
	}

}

// ============================================================================
// One-Shot Relay Queries (search, load-more, social)
// ============================================================================

/**
 * Fetch events from relays (one-shot: EOSE + grace → close → putEvents).
 * Returns the collected events after writing them to Dexie.
 *
 * Note: nostr-tools SimplePool.subscribeMany expects a single filter object
 * as the second argument (it handles grouping internally via subscribeMap).
 *
 * @param {string[]} relayUrls
 * @param {object} filter - NIP-01 filter object
 * @param {{ timeout?: number, signal?: AbortSignal }} options
 * @returns {Promise<import('nostr-tools').Event[]>}
 */
export async function fetchFromRelays(relayUrls, filter, options = {}) {
	const { timeout = 5000, signal, feature = 'q' } = options;
	if (signal?.aborted) return [];

	return new Promise((resolve) => {
		const events = [];
		let settled = false;
		let eoseTimer = null;
		let timeoutTimer = null;

		const finish = async () => {
			if (settled) return;
			settled = true;
			if (eoseTimer) clearTimeout(eoseTimer);
			if (timeoutTimer) clearTimeout(timeoutTimer);
			try {
				sub?.close();
			} catch {
				/* noop */
			}
			// Write to Dexie
			if (events.length > 0) {
				await putEvents(events).catch((err) =>
					console.error('[Service] Failed to persist events:', err)
				);
			}
			if (isNostrDebug()) {
				nostrDebug('fetchFromRelays', feature, `→ ${events.length} events`, filter);
				if (events.length === 0 && (feature === 'comments' || feature === 'zaps')) {
					console.warn('[Zapstore] fetchFromRelays returned 0 events', { feature, filter, relays: relayUrls });
				}
			}
			resolve(events);
		};

		const p = getPool();
		const sub = p.subscribeMany(relayUrls, filter, {
			id: subId(feature),
			onevent(event) {
				if (event?.id) events.push(event);
			},
			oneose() {
				if (!eoseTimer) eoseTimer = setTimeout(finish, EOSE_GRACE_MS);
			},
			onclose() {
				if (!settled) finish();
			}
		});

		signal?.addEventListener('abort', finish, { once: true });
		timeoutTimer = setTimeout(finish, timeout);
	});
}

// ============================================================================
// Client-side Data Queries (Dexie-backed)
// ============================================================================

/**
 * Query events from Dexie (async).
 * Use for one-shot reads. For reactive reads, use liveQuery in components.
 */
export { queryEvents, queryEvent, putEvents } from './dexie';
export { liveQuery } from 'dexie';
export { db } from './dexie';

/**
 * Search apps using NIP-50 full-text search via relays.
 * Uses a dedicated pool per search to avoid relay-side response budget
 * contention with persistent subscriptions or other in-flight queries.
 */
export async function searchApps(relays, query, options = {}) {
	const { limit = 50, timeout = 5000, signal } = options;
	if (signal?.aborted || !query.trim()) return [];

	const filter = {
		kinds: [32267],
		search: query.trim(),
		...PLATFORM_FILTER,
		limit
	};

	const searchPool = new SimplePool();

	return new Promise((resolve) => {
		const events = [];
		let settled = false;
		let eoseTimer = null;
		let timeoutTimer = null;

		const finish = async () => {
			if (settled) return;
			settled = true;
			if (eoseTimer) clearTimeout(eoseTimer);
			if (timeoutTimer) clearTimeout(timeoutTimer);
			try { sub?.close(); } catch { /* noop */ }
			searchPool.close(relays);
			if (events.length > 0) {
				await putEvents(events).catch((err) =>
					console.error('[Search] Failed to persist events:', err)
				);
			}
			resolve(events);
		};

		const sub = searchPool.subscribeMany(relays, filter, {
			id: subId('search'),
			onevent(event) {
				if (event?.id) events.push(event);
			},
			oneose() {
				if (!eoseTimer) eoseTimer = setTimeout(finish, EOSE_GRACE_MS);
			},
			onclose() {
				if (!settled) finish();
			}
		});

		signal?.addEventListener('abort', finish, { once: true });
		timeoutTimer = setTimeout(finish, timeout);
	});
}

/**
 * Search forum posts (kind 11) by title, content, or tags using NIP-50 full-text search.
 * Uses a dedicated pool; events are written to Dexie.
 * @param {string[]} relays - Relay URLs (e.g. FORUM_RELAY)
 * @param {string} communityPubkeyHex - Community pubkey for #h filter
 * @param {string} query - Search string
 * @param {{ limit?: number, timeout?: number, signal?: AbortSignal }} options
 * @returns {Promise<import('nostr-tools').NostrEvent[]>}
 */
export async function searchForumPosts(relays, communityPubkeyHex, query, options = {}) {
	const { limit = 50, timeout = 5000, signal } = options;
	if (signal?.aborted || !query.trim()) return [];
	if (!communityPubkeyHex) return [];

	const filter = {
		kinds: [EVENT_KINDS.FORUM_POST],
		'#h': [communityPubkeyHex],
		search: query.trim(),
		limit
	};

	const searchPool = new SimplePool();

	return new Promise((resolve) => {
		const events = [];
		let sub = null;
		let settled = false;
		let eoseTimer = null;
		let timeoutTimer = null;

		const finish = async () => {
			if (settled) return;
			settled = true;
			if (eoseTimer) clearTimeout(eoseTimer);
			if (timeoutTimer) clearTimeout(timeoutTimer);
			try { sub?.close(); } catch { /* noop */ }
			searchPool.close(relays);
			if (events.length > 0) {
				await putEvents(events).catch((err) =>
					console.error('[ForumSearch] Failed to persist events:', err)
				);
			}
			resolve(events);
		};

		sub = searchPool.subscribeMany(relays, filter, {
			id: subId('forum-search'),
			onevent(event) {
				if (event?.id) events.push(event);
			},
			oneose() {
				if (!eoseTimer) eoseTimer = setTimeout(finish, EOSE_GRACE_MS);
			},
			onclose() {
				if (!settled) finish();
			}
		});

		signal?.addEventListener('abort', finish, { once: true });
		timeoutTimer = setTimeout(finish, timeout);
	});
}

/**
 * Fetch app events by author from relays (for profile pages, etc.).
 * Events are written to Dexie via fetchFromRelays.
 */
export async function fetchAppsByAuthorFromRelays(relayUrls, pubkey, options = {}) {
	const { limit = 50, timeout = 5000, signal } = options;
	if (signal?.aborted || !pubkey) return [];
	const filter = {
		kinds: [32267],
		authors: [pubkey],
		...PLATFORM_FILTER,
		limit
	};
	return fetchFromRelays(relayUrls, filter, { timeout, signal, feature: 'profile' });
}

/**
 * Fetch a single app event by pubkey + d-tag from relays.
 * Used when resolving stack refs or app detail when not in Dexie.
 */
export async function fetchAppFromRelays(relayUrls, pubkey, dTag, options = {}) {
	const { timeout = 5000, signal } = options;
	if (signal?.aborted || !pubkey || !dTag) return null;
	const filter = {
		kinds: [32267],
		authors: [pubkey],
		'#d': [dTag],
		...PLATFORM_FILTER,
		limit: 1
	};
	const events = await fetchFromRelays(relayUrls, filter, { timeout, signal, feature: 'app-detail' });
	return events.length > 0 ? events[0] : null;
}

/**
 * Fetch release events (kind 30063) from relays for pagination.
 * until = created_at cursor (exclusive). Events are written to Dexie.
 */
export async function fetchReleasesFromRelays(relayUrls, options = {}) {
	const { limit = 25, until, timeout = 5000, signal } = options;
	if (signal?.aborted) return [];
	const filter = {
		kinds: [30063],
		until: until != null && !isNaN(until) ? Number(until) : Math.floor(Date.now() / 1000),
		limit
	};
	return fetchFromRelays(relayUrls, filter, { timeout, signal, feature: 'releases' });
}

// ============================================================================
// Profile Fetching (local-first with relay fallback)
// ============================================================================

/**
 * Fetch a single profile by pubkey.
 */
export async function fetchProfile(pubkey, options = {}) {
	const { timeout = 5000, signal } = options;
	if (signal?.aborted || !pubkey) return null;
	const results = await fetchProfilesBatch([pubkey], { timeout, signal });
	return results.get(pubkey) ?? null;
}

/**
 * Fetch multiple profiles in batch.
 * Checks Dexie first, then fetches missing from relays.
 */
export async function fetchProfilesBatch(pubkeys, options = {}) {
	const { timeout = 5000, signal } = options;
	const results = new Map();
	if (!pubkeys || pubkeys.length === 0 || signal?.aborted) return results;

	const uniquePubkeys = [
		...new Set(
			pubkeys
				.map((pk) => String(pk).trim().toLowerCase())
				.filter((pk) => /^[a-f0-9]{64}$/.test(pk))
		)
	];

	// First pass: batch check Dexie — single query for all pubkeys
	const cachedProfiles = await queryEvents({ kinds: [0], authors: uniquePubkeys });
	for (const event of cachedProfiles) {
		const pk = event.pubkey?.toLowerCase();
		if (pk && !results.has(pk)) {
			results.set(pk, event);
		}
	}
	const missingPubkeys = uniquePubkeys.filter((pk) => !results.has(pk));

	// Second pass: fetch missing from relays directly
	if (missingPubkeys.length > 0 && typeof window !== 'undefined') {
		try {
			const profileRelays = [...DEFAULT_SOCIAL_RELAYS, ...DEFAULT_CATALOG_RELAYS];
			const events = await fetchFromRelays(
				profileRelays,
				{ kinds: [0], authors: missingPubkeys, limit: missingPubkeys.length * 2 },
				{ timeout, signal, feature: 'profile' }
			);

			// Pick latest profile per pubkey
			for (const event of events) {
				const pk = event.pubkey?.toLowerCase();
				if (!pk) continue;
				const existing = results.get(pk);
				if (!existing || event.created_at > existing.created_at) {
					results.set(pk, event);
				}
			}
		} catch {
			// Keep partial local-first results when relay fetch fails.
		}
	}

	return results;
}

// ============================================================================
// Social Features: Comments and Zaps
// ============================================================================

/**
 * Zapstore REQ for kinds 1111 / 9735: always include `since` + positive `limit`.
 * @param {Record<string, unknown>} filter
 * @param {{ since?: number, defaultLimit?: number }} [options]
 */
function withZapstoreCommentZapReqBounds(filter, options = {}) {
	const { since: sinceOverride, defaultLimit } = options;
	const out = { ...filter };
	if (out.since === undefined) {
		out.since = sinceOverride !== undefined ? sinceOverride : commentZapRelayReadSince();
	}
	const lim = Number(out.limit);
	if (out.limit == null || !Number.isFinite(lim) || lim <= 0) {
		out.limit = defaultLimit ?? 500;
	}
	return out;
}

/** NIP-22 `K` tag: kind of the root being discussed (forum post, app, or stack). */
const NIP22_FORUM_ROOT_K = String(EVENT_KINDS.FORUM_POST);

/**
 * @param {string} aTagValue `kind:pubkey:dTag` for replaceable app/stack roots
 * @returns {string | null} `K` filter value (`32267` / `30267`)
 */
function nip22KFromAddressableATag(aTagValue) {
	const head = String(aTagValue).split(':')[0];
	if (head === String(EVENT_KINDS.APP) || head === String(EVENT_KINDS.APP_STACK)) return head;
	return null;
}

function normalizeAddressableATagValue(kind, pubkey, identifier) {
	return `${Number(kind)}:${String(pubkey).trim().toLowerCase()}:${String(identifier).trim()}`;
}

/**
 * Fetch kind 1111 by `#e`/`#E` (forum) or `#a`/`#A` (app/stack), scoped with NIP-22 `#K` for relay indexing.
 * @param {'e' | 'a'} refType
 * @param {string} refValue hex event id or `kind:pubkey:identifier`
 */
export async function fetchKind1111ByTagRef(relayUrls, refType, refValue, options = {}) {
	const { timeout = 5000, signal, since, limit = 300, feature = 'comments-1111-ref' } = options;
	if (!refValue?.trim()) return [];

	const v = refValue.trim();
	if (refType === 'e') {
		const fl = withZapstoreCommentZapReqBounds(
			{ kinds: [1111], '#K': [NIP22_FORUM_ROOT_K], '#e': [v], limit },
			{ since, defaultLimit: limit }
		);
		const fu = withZapstoreCommentZapReqBounds(
			{ kinds: [1111], '#K': [NIP22_FORUM_ROOT_K], '#E': [v], limit },
			{ since, defaultLimit: limit }
		);
		const [lo, up] = await Promise.all([
			fetchFromRelays(relayUrls, fl, { timeout, signal, feature: `${feature}-e` }),
			fetchFromRelays(relayUrls, fu, { timeout, signal, feature: `${feature}-E` })
		]);
		const byId = new Map();
		for (const e of [...lo, ...up]) if (e?.id) byId.set(e.id, e);
		return Array.from(byId.values());
	}

	const kRoot = nip22KFromAddressableATag(v);
	if (!kRoot) return [];

	const fl = withZapstoreCommentZapReqBounds(
		{ kinds: [1111], '#K': [kRoot], '#a': [v], limit },
		{ since, defaultLimit: limit }
	);
	const fu = withZapstoreCommentZapReqBounds(
		{ kinds: [1111], '#K': [kRoot], '#A': [v], limit },
		{ since, defaultLimit: limit }
	);
	const [lo, up] = await Promise.all([
		fetchFromRelays(relayUrls, fl, { timeout, signal, feature: `${feature}-a` }),
		fetchFromRelays(relayUrls, fu, { timeout, signal, feature: `${feature}-A` })
	]);
	const byId = new Map();
	for (const e of [...lo, ...up]) if (e?.id) byId.set(e.id, e);
	return Array.from(byId.values());
}

/**
 * Kind 1111 comments whose `e` or `E` tag references any of the given event ids (forum posts, etc.).
 */
export async function fetchKind1111ReferencingEventIds(relayUrls, eventIds, options = {}) {
	const { timeout = 5000, signal, since, limit = 500, feature = 'comments-1111-multi-e' } = options;
	const ids = [...new Set(eventIds.map((id) => String(id).trim().toLowerCase()).filter((id) => /^[a-f0-9]{64}$/.test(id)))];
	if (ids.length === 0) return [];

	const fl = withZapstoreCommentZapReqBounds(
		{ kinds: [1111], '#K': [NIP22_FORUM_ROOT_K], '#e': ids, limit },
		{ since, defaultLimit: limit }
	);
	const fu = withZapstoreCommentZapReqBounds(
		{ kinds: [1111], '#K': [NIP22_FORUM_ROOT_K], '#E': ids, limit },
		{ since, defaultLimit: limit }
	);
	const [lo, up] = await Promise.all([
		fetchFromRelays(relayUrls, fl, { timeout, signal, feature: `${feature}-e` }),
		fetchFromRelays(relayUrls, fu, { timeout, signal, feature: `${feature}-E` })
	]);
	const byId = new Map();
	for (const e of [...lo, ...up]) if (e?.id) byId.set(e.id, e);
	return Array.from(byId.values());
}

const ZAP_9735_E_BATCH = 100;

/**
 * Fetch kind 9735 for addressable and/or `#e` targets — tag-scoped REQs (`#a`/`#A` / `#e`/`#E`) with
 * `since` + `limit`. A global bucket + in-memory filter misses app-specific zaps when they are not in the
 * newest N receipts across the whole relay.
 * @param {{ aTag?: string, eventIds?: string[] }} spec
 */
export async function fetchKind9735MatchingRefs(relayUrls, spec, options = {}) {
	const { timeout = 5000, signal, since, limit = 400, feature = 'zaps-9735-ref' } = options;
	const aTag = spec.aTag?.trim();
	const ids = (spec.eventIds ?? [])
		.map((id) => String(id).trim().toLowerCase())
		.filter((id) => /^[a-f0-9]{64}$/.test(id));

	if (!aTag && ids.length === 0) return [];

	const byId = new Map();

	if (aTag) {
		const fl = withZapstoreCommentZapReqBounds(
			{ kinds: [9735], '#a': [aTag], limit },
			{ since, defaultLimit: limit }
		);
		const fu = withZapstoreCommentZapReqBounds(
			{ kinds: [9735], '#A': [aTag], limit },
			{ since, defaultLimit: limit }
		);
		const [lo, up] = await Promise.all([
			fetchFromRelays(relayUrls, fl, { timeout, signal, feature: `${feature}-a` }),
			fetchFromRelays(relayUrls, fu, { timeout, signal, feature: `${feature}-A` })
		]);
		for (const e of [...lo, ...up]) if (e?.id) byId.set(e.id, e);
	}

	for (let i = 0; i < ids.length; i += ZAP_9735_E_BATCH) {
		const chunk = ids.slice(i, i + ZAP_9735_E_BATCH);
		const fl = withZapstoreCommentZapReqBounds(
			{ kinds: [9735], '#e': chunk, limit },
			{ since, defaultLimit: limit }
		);
		const fu = withZapstoreCommentZapReqBounds(
			{ kinds: [9735], '#E': chunk, limit },
			{ since, defaultLimit: limit }
		);
		const [lo, up] = await Promise.all([
			fetchFromRelays(relayUrls, fl, { timeout, signal, feature: `${feature}-e` }),
			fetchFromRelays(relayUrls, fu, { timeout, signal, feature: `${feature}-E` })
		]);
		for (const e of [...lo, ...up]) if (e?.id) byId.set(e.id, e);
	}

	return Array.from(byId.values());
}

const SOCIAL_RELAYS = [...DEFAULT_SOCIAL_RELAYS];

/** Cap merged publish list so NIP-65 lists cannot fan out unbounded. */
const MAX_COMMENT_PUBLISH_RELAYS = 24;

/**
 * NIP-65 kind 10002: `r` tags with optional third field — skip `read`-only relays for publish.
 * @param {import('nostr-tools').Event | null | undefined} event
 * @returns {string[]}
 */
function parseNip65WriteRelayUrls(event) {
	if (!event?.tags) return [];
	const urls = [];
	for (const tag of event.tags) {
		if (tag[0] !== 'r' || typeof tag[1] !== 'string') continue;
		const url = tag[1].trim();
		if (!/^wss?:\/\//i.test(url)) continue;
		const marker = (tag[2] || '').toLowerCase();
		if (marker === 'read') continue;
		urls.push(url);
	}
	return urls;
}

/**
 * Zapstore + default social + optional caller extras + signer’s NIP-65 write relays (Dexie, then relay fetch).
 * @param {string} signerPubkey - hex pubkey of the signed comment author
 * @param {string[] | null | undefined} relayExtras - merged in after core relays (e.g. explicit `COMMENT_PUBLISH_RELAYS` from callers)
 * @returns {Promise<string[]>}
 */
async function buildCommentPublishRelayUrls(signerPubkey, relayExtras) {
	const ordered = [];
	const seen = new Set();
	/** @param {string} u */
	function add(u) {
		if (!u || typeof u !== 'string') return;
		const n = u.trim();
		if (!n || seen.has(n)) return;
		seen.add(n);
		ordered.push(n);
	}

	for (const u of COMMENT_PUBLISH_RELAYS) add(u);
	for (const u of DEFAULT_SOCIAL_RELAYS) add(u);
	if (Array.isArray(relayExtras)) for (const u of relayExtras) add(u);

	if (signerPubkey && typeof window !== 'undefined') {
		try {
			const pk = signerPubkey.trim().toLowerCase();
			let ev = await queryEvent({ kinds: [EVENT_KINDS.RELAY_LIST], authors: [pk], limit: 1 });
			if (!ev) {
				const arr = await fetchFromRelays(
					[...DEFAULT_SOCIAL_RELAYS, ZAPSTORE_RELAY],
					{ kinds: [EVENT_KINDS.RELAY_LIST], authors: [pk], limit: 1 },
					{ timeout: 4000, feature: 'nip65-comment-publish' }
				);
				ev = arr[0];
				if (ev) await putEvents([ev]).catch(() => {});
			}
			if (ev) for (const u of parseNip65WriteRelayUrls(ev)) add(u);
		} catch {
			/* keep core + social */
		}
	}

	return ordered.slice(0, MAX_COMMENT_PUBLISH_RELAYS);
}

/**
 * Query comments from Dexie.
 */
export async function queryCommentsFromStore(pubkey, identifier, aTagKind = 32267) {
	if (!pubkey || !identifier) return [];
	const aTagValue = normalizeAddressableATagValue(aTagKind, pubkey, identifier);
	const kStr = String(aTagKind);

	const lower = await queryEvents({ kinds: [1111], '#K': [kStr], '#a': [aTagValue], limit: 500 });
	const upper = await queryEvents({ kinds: [1111], '#K': [kStr], '#A': [aTagValue], limit: 500 });

	const byId = new Map();
	for (const e of [...lower, ...upper]) {
		if (!byId.has(e.id)) byId.set(e.id, e);
	}

	return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
}

/**
 * Fetch comments from relays and store in Dexie.
 */
export async function fetchComments(pubkey, identifier, options = {}) {
	const {
		timeout = 5000,
		signal,
		relays = COMMENT_AND_ZAP_READ_RELAYS,
		aTagKind = 32267,
		eventId = null,
		since
	} = options;
	if (signal?.aborted) return [];

	// Non-replaceable event root: filter by #e / #E tags
	if (eventId) {
		const evs = await fetchKind1111ByTagRef(relays, 'e', eventId, {
			timeout,
			signal,
			since,
			limit: 500,
			feature: 'comments-root-e'
		});
		return evs.sort((a, b) => b.created_at - a.created_at);
	}

	// Replaceable root: #a / #A + NIP-22 #K (app/stack).
	if (!pubkey || !identifier) return [];
	const aTagValue = normalizeAddressableATagValue(aTagKind, pubkey, identifier);
	const evs = await fetchKind1111ByTagRef(relays, 'a', aTagValue, {
		timeout,
		signal,
		since,
		limit: 500,
		feature: 'comments-root-a'
	});
	return evs.sort((a, b) => b.created_at - a.created_at);
}

/**
 * Fetch kind 1111 comments whose root is any of the given NIP-33 `a` values (e.g. `32267:pubkey:dTag`).
 * Caller should persist via putEvents.
 */
export async function fetchCommentsByRootATags(aTagValues, options = {}) {
	const { timeout = 7000, signal, relays = COMMENT_AND_ZAP_READ_RELAYS, limit = 500, since } = options;
	if (signal?.aborted || !aTagValues?.length) return [];

	const uniq = [...new Set(aTagValues.map((v) => String(v).trim()).filter(Boolean))];
	if (uniq.length === 0) return [];

	/** @type {Map<string, string[]>} */
	const byK = new Map();
	for (const t of uniq) {
		const k = nip22KFromAddressableATag(t);
		if (!k) continue;
		if (!byK.has(k)) byK.set(k, []);
		byK.get(k).push(t);
	}

	const ATAG_REQ_CHUNK = 55;
	const byId = new Map();
	for (const [kStr, tags] of byK) {
		for (let i = 0; i < tags.length; i += ATAG_REQ_CHUNK) {
			const chunk = tags.slice(i, i + ATAG_REQ_CHUNK);
			const filterLower = withZapstoreCommentZapReqBounds(
				{ kinds: [EVENT_KINDS.COMMENT], '#K': [kStr], '#a': chunk, limit },
				{ since, defaultLimit: limit }
			);
			const filterUpper = withZapstoreCommentZapReqBounds(
				{ kinds: [EVENT_KINDS.COMMENT], '#K': [kStr], '#A': chunk, limit },
				{ since, defaultLimit: limit }
			);
			const [eventsLower, eventsUpper] = await Promise.all([
				fetchFromRelays(relays, filterLower, { timeout, signal, feature: 'comments' }),
				fetchFromRelays(relays, filterUpper, { timeout, signal, feature: 'comments' })
			]);
			for (const e of [...eventsLower, ...eventsUpper]) {
				if (e?.id && !byId.has(e.id)) byId.set(e.id, e);
			}
		}
	}

	return Array.from(byId.values());
}

const COMMENT_REPLIES_E_BATCH = 100;

/**
 * Fetch comment replies by event IDs.
 */
export async function fetchCommentRepliesByE(eventIds, options = {}) {
	if (eventIds.length === 0) return [];
	const { timeout = 5000, signal, relays = COMMENT_AND_ZAP_READ_RELAYS, since } = options;

	const byId = new Map();
	for (let i = 0; i < eventIds.length; i += COMMENT_REPLIES_E_BATCH) {
		const chunk = eventIds.slice(i, i + COMMENT_REPLIES_E_BATCH);
		const fl = withZapstoreCommentZapReqBounds(
			{ kinds: [1111], '#K': [NIP22_FORUM_ROOT_K], '#e': chunk, limit: 500 },
			{ since, defaultLimit: 500 }
		);
		const fu = withZapstoreCommentZapReqBounds(
			{ kinds: [1111], '#K': [NIP22_FORUM_ROOT_K], '#E': chunk, limit: 500 },
			{ since, defaultLimit: 500 }
		);
		const [lo, up] = await Promise.all([
			fetchFromRelays(relays, fl, { timeout, signal, feature: 'comments-e' }),
			fetchFromRelays(relays, fu, { timeout, signal, feature: 'comments-E' })
		]);
		for (const e of [...lo, ...up]) if (e?.id) byId.set(e.id, e);
	}

	return Array.from(byId.values());
}

/**
 * Fetch zap receipts by recipient pubkeys (Zapstore read path; same relay policy as fetchZaps / comments).
 */
export async function fetchZapReceiptsByPubkeys(pubkeys, options = {}) {
	const { since, limit = 500, timeout = 8000, signal } = options;
	if (signal?.aborted || !pubkeys?.length) return [];

	const filter = withZapstoreCommentZapReqBounds(
		{ kinds: [9735], '#p': pubkeys, limit },
		{ since, defaultLimit: limit }
	);

	return fetchFromRelays(COMMENT_AND_ZAP_READ_RELAYS, filter, { timeout, signal, feature: 'zaps' });
}

/**
 * Fetch zap receipts that target any of the given event ids (#e).
 */
export async function fetchZapsByEventIds(eventIds, options = {}) {
	const { timeout = 5000, signal, relays = COMMENT_AND_ZAP_READ_RELAYS, since } = options;
	if (signal?.aborted || !Array.isArray(eventIds) || eventIds.length === 0) return [];
	const ids = eventIds
		.map((id) => String(id).trim().toLowerCase())
		.filter((id) => /^[a-f0-9]{64}$/.test(id));
	if (ids.length === 0) return [];
	const evs = await fetchKind9735MatchingRefs(relays, { eventIds: ids }, {
		timeout,
		signal,
		since,
		limit: 200,
		feature: 'zaps-by-e'
	});
	return evs.sort((a, b) => b.created_at - a.created_at);
}

/**
 * Fetch kind 1985 label events for a forum post.
 *
 * @param {string[]} relayUrls
 * @param {string} eventId - id of the labeled event (forum post id)
 * @param {string} communityPubkey - community h-tag value (hex pubkey)
 * @param {{ timeout?: number, signal?: AbortSignal, allowedPubkeys?: string[], enforced?: boolean }} options
 */
export async function fetchLabelEvents(relayUrls, eventId, communityPubkey, options = {}) {
	const { timeout = 5000, signal, allowedPubkeys = [], enforced = false } = options;
	if (signal?.aborted || !eventId || !communityPubkey) return [];
	const filter = {
		kinds: [EVENT_KINDS.LABEL],
		'#e': [eventId],
		'#h': [communityPubkey],
		limit: 200
	};
	if (!enforced && allowedPubkeys.length > 0) {
		filter.authors = allowedPubkeys;
	}
	return fetchFromRelays(relayUrls, filter, { timeout, signal });
}

/**
 * Fetch zaps for an app.
 */
export async function fetchZaps(pubkey, identifier, options = {}) {
	const {
		timeout = 5000,
		signal,
		relays = COMMENT_AND_ZAP_READ_RELAYS,
		since,
		aTagKind = EVENT_KINDS.APP
	} = options;
	if (signal?.aborted || !pubkey || !identifier) return [];

	const aTagValue = normalizeAddressableATagValue(aTagKind, pubkey, identifier);
	const eventIds = (options.eventIds ?? [])
		.map((id) => id.trim().toLowerCase())
		.filter((id) => /^[a-f0-9]{64}$/.test(id));

	const evs = await fetchKind9735MatchingRefs(relays, { aTag: aTagValue, eventIds }, {
		timeout,
		signal,
		since,
		limit: 100,
		feature: 'zaps'
	});
	return evs.sort((a, b) => b.created_at - a.created_at);
}

/**
 * Parse a zap receipt.
 */
export function parseZapReceipt(event) {
	const result = {
		senderPubkey: null,
		recipientPubkey: null,
		amountSats: 0,
		comment: '',
		emojiTags: [],
		createdAt: event.created_at,
		zappedEventId: null
	};

	const pTag = event.tags.find((t) => t[0] === 'p');
	if (pTag?.[1]) result.recipientPubkey = pTag[1];

	const bolt11Tag = event.tags.find((t) => t[0] === 'bolt11');
	if (bolt11Tag?.[1]) {
		const bolt11 = bolt11Tag[1].toLowerCase();
		const amountMatch = bolt11.match(/^lnbc(\d+)([munp]?)/);
		if (amountMatch) {
			const num = parseInt(amountMatch[1], 10);
			const unit = amountMatch[2] || '';
			switch (unit) {
				case 'm': result.amountSats = num * 100000; break;
				case 'u': result.amountSats = num * 100; break;
				case 'n': result.amountSats = Math.round(num / 10); break;
				case 'p': result.amountSats = Math.round(num / 10000); break;
				default: result.amountSats = num * 100000000; break;
			}
		}
	}

	const receiptETag = event.tags.find((t) => t[0]?.toLowerCase() === 'e' && !!t[1]);
	if (receiptETag?.[1]) result.zappedEventId = receiptETag[1].toLowerCase();

	const descTag = event.tags.find((t) => t[0] === 'description');
	if (descTag?.[1]) {
		try {
			const zapRequest = JSON.parse(descTag[1]);
			if (zapRequest.pubkey) {
				result.senderPubkey = String(zapRequest.pubkey).toLowerCase();
			}
			result.comment = zapRequest.content || '';
			if (result.zappedEventId == null) {
				const eTag = zapRequest.tags?.find((t) => t[0] === 'e' && !!t[1]);
				if (eTag?.[1]) result.zappedEventId = eTag[1].toLowerCase();
			}
			const seen = new Set();
			for (const tag of zapRequest.tags ?? []) {
				if (tag[0] === 'emoji' && tag[1] && tag[2] && !seen.has(tag[1])) {
					seen.add(tag[1]);
					result.emojiTags.push({ shortcode: tag[1], url: tag[2] });
				}
			}
		} catch {
			// Failed to parse zap request
		}
	}

	const pUpper = event.tags.find((t) => t[0] === 'P' && t[1]);
	if (!result.senderPubkey && pUpper?.[1]) {
		result.senderPubkey = String(pUpper[1]).toLowerCase();
	}

	return result;
}

/**
 * Publish a NIP-22 comment (kind 1111).
 * Writes to Dexie after attempting publish to all target relays (`Promise.allSettled` — check relay / extension for `OK` rejections).
 * @param {string} content - Comment text (may include nostr:npub… and :shortcode:)
 * @param {object} target - Replaceable: { contentType, pubkey, identifier } | Non-replaceable: { contentType, pubkey, id, kind }
 * @param {function} signEvent - NIP-07 signer
 * @param {Array<{ shortcode: string, url: string }>} [emojiTags] - Custom emoji tags for the event
 * @param {string} [parentEventId] - Parent comment/event id for replies
 * @param {string} [replyToPubkey] - Pubkey being replied to (p tag on reply)
 * @param {number} [parentKind] - Kind of parent (e.g. 1111 or 9735)
 * @param {string[]} [mentions] - Pubkeys mentioned in content (p tags for notifications)
 * @param {string[]} [relays] - Extra publish URLs merged in (after Zapstore + social); full set also adds signer NIP-65 write relays.
 * @param {string[]} [mediaUrls] - Media URLs (images/videos) as 'media' tags
 *
 * **Relay hint inside the signed event:** every NIP-22 `e` / `E` / `a` / `A` tag that includes a relay
 * URL uses exactly {@link ZAPSTORE_RELAY} (`wss://relay.zapstore.dev`) as the third list element — not
 * multiple hints per tag, and not other relays.
 *
 * **Publish targets:** {@link COMMENT_PUBLISH_RELAYS} first (awaited — UI treats this as “accepted”), then
 * {@link DEFAULT_SOCIAL_RELAYS}, optional `relays`, and NIP-65 write relays are published in the background
 * without blocking the returned promise.
 */
export async function publishComment(content, target, signEvent, emojiTags, parentEventId, replyToPubkey, parentKind, mentions, relays, mediaUrls, version = null) {
	if (!content?.trim()) throw new Error('Comment content is required');
	if (!target?.pubkey?.trim()) throw new Error('Comment target pubkey is required');

	// Non-replaceable events (e.g. forum posts, kind 11) use e/E root tags.
	// Replaceable/addressable events (apps kind 32267, stacks kind 30267) use a/A root tags.
	const isNonReplaceable = !!target.id && !target.identifier;

	if (!isNonReplaceable && !target?.identifier?.trim()) {
		throw new Error('Comment target (pubkey, identifier) is required for replaceable events');
	}

	let rootKind;
	let tags;

	// Root: uppercase A/E + K + P; many indexers also expect lowercase a/e + k + p for the same root.
	// Replies: keep uppercase root tags; lowercase e/k/p refer to the immediate parent only.
	/** Single relay URL embedded on each NIP-22 tag that carries a hint (third element): Zapstore catalog relay. */
	const relayHint = ZAPSTORE_RELAY;

	if (isNonReplaceable) {
		rootKind = target.kind ?? 11;
		const eId = target.id.trim().toLowerCase();
		tags = [
			['E', eId, relayHint],
			['K', String(rootKind)],
			['P', target.pubkey.trim().toLowerCase()]
		];
		if (!parentEventId) {
			tags.push(['e', eId, relayHint]);
			tags.push(['k', String(rootKind)]);
			tags.push(['p', target.pubkey.trim().toLowerCase()]);
		}
	} else {
		const kind = 32267;
		const stackKind = 30267;
		const aTagValue = target.contentType === 'app'
			? `${kind}:${target.pubkey}:${target.identifier}`
			: `${stackKind}:${target.pubkey}:${target.identifier}`;

		rootKind = target.contentType === 'app' ? kind : stackKind;
		tags = [
			['A', aTagValue, relayHint],
			['K', String(rootKind)],
			['P', target.pubkey.trim().toLowerCase()]
		];
		if (!parentEventId) {
			tags.push(['a', aTagValue, relayHint]);
			tags.push(['k', String(rootKind)]);
			tags.push(['p', target.pubkey.trim().toLowerCase()]);
		}
	}

	// Parent item (when replying to a comment): e, k, p — spec requires parent author in p tag
	if (parentEventId) {
		const parentId = parentEventId.trim().toLowerCase();
		if (!/^[a-f0-9]{64}$/.test(parentId)) {
			throw new Error(`Invalid parent event id: ${parentEventId.slice(0, 20)}...`);
		}
		const parentPubkey = replyToPubkey?.trim();
		if (!parentPubkey || !/^[a-f0-9]{64}$/.test(parentPubkey.toLowerCase())) {
			throw new Error('replyToPubkey (parent comment author) is required when replying to a comment');
		}
		tags.push(['e', parentId, relayHint]);
		tags.push(['k', String(parentKind ?? 1111)]);
		tags.push(['p', parentPubkey.toLowerCase()]);
	}

	const emojiList = emojiTags ?? [];
	if (emojiList.length > 0) {
		const seen = new Set();
		for (const { shortcode, url } of emojiList) {
			if (shortcode && url && !seen.has(shortcode)) {
				seen.add(shortcode);
				tags.push(['emoji', shortcode, url]);
			}
		}
	}

	const mentionPubkeys = mentions ?? [];
	const seenP = new Set([target.pubkey.trim().toLowerCase()]);
	if (replyToPubkey) seenP.add(replyToPubkey.trim().toLowerCase());
	for (const pk of mentionPubkeys) {
		const normalized = String(pk).trim().toLowerCase();
		if (/^[a-f0-9]{64}$/.test(normalized) && !seenP.has(normalized)) {
			seenP.add(normalized);
			tags.push(['p', normalized]);
		}
	}

	// Version tag: only on root comments for app/stack targets (not on replies)
	if (version && !parentEventId && !isNonReplaceable) {
		tags.push(['v', String(version).trim()]);
	}

	const mediaList = mediaUrls ?? [];
	for (const u of mediaList) {
		if (typeof u === 'string' && u.trim()) tags.push(['media', u.trim()]);
	}

	const template = {
		kind: 1111,
		content: content.trim(),
		tags,
		created_at: Math.floor(Date.now() / 1000)
	};

	const signed = await signEvent(template);
	const p = getPool();
	const relayUrls = await buildCommentPublishRelayUrls(signed.pubkey, relays);
	const primarySet = new Set(COMMENT_PUBLISH_RELAYS);
	let primaryRelays = relayUrls.filter((u) => primarySet.has(u));
	if (primaryRelays.length === 0) primaryRelays = [...COMMENT_PUBLISH_RELAYS];
	const secondaryRelays = relayUrls.filter((u) => !primarySet.has(u));

	// Await catalog relay only — pending/spinner clears here; outbox/social is best-effort after.
	await Promise.allSettled(p.publish(primaryRelays, signed));

	await putEvents([signed]);

	if (secondaryRelays.length > 0) {
		void Promise.allSettled(p.publish(secondaryRelays, signed)).catch(() => {});
	}

	return signed;
}

const APP_LABEL_NAMESPACE = 'app';
/** Nostr topic labels (kind 1985): L + l mark `#t` per label spec */
const TOPIC_LABEL_NAMESPACE = '#t';

/**
 * Fetch kind 1985 label events targeting an addressable entity (#a / #A).
 * Persists to Dexie via fetchFromRelays.
 * @param {string} pubkey - hex pubkey
 * @param {string} identifier - d-tag
 * @param {{ timeout?: number, signal?: AbortSignal, relays?: string[], aTagKind?: number }} [options]
 */
export async function fetchLabelsForAddressable(pubkey, identifier, options = {}) {
	const { timeout = 5000, signal, relays = SOCIAL_RELAYS, aTagKind = EVENT_KINDS.APP } = options;
	if (signal?.aborted || !pubkey?.trim() || !identifier?.trim()) return [];
	const pk = pubkey.trim().toLowerCase();
	const id = identifier.trim();
	const aTagValue = `${aTagKind}:${pk}:${id}`;
	const filterLower = { kinds: [EVENT_KINDS.LABEL], '#a': [aTagValue], limit: 300 };
	const filterUpper = { kinds: [EVENT_KINDS.LABEL], '#A': [aTagValue], limit: 300 };
	const [eventsLower, eventsUpper] = await Promise.all([
		fetchFromRelays(relays, filterLower, { timeout, signal, feature: 'labels' }),
		fetchFromRelays(relays, filterUpper, { timeout, signal, feature: 'labels' })
	]);
	const byId = new Map();
	for (const e of [...eventsLower, ...eventsUpper]) {
		if (e?.id && !byId.has(e.id)) byId.set(e.id, e);
	}
	return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
}

/**
 * Group kind 1985 (or any) events with `l` tags into display rows: unique label string → pubkeys who published.
 * @param {Array<{ pubkey?: string, tags?: string[][] }>} events
 * @returns {Array<{ label: string, pubkeys: string[] }>}
 */
export function groupLabelEventsToEntries(events) {
	const labelMap = new Map();
	for (const ev of events) {
		const pk = ev?.pubkey;
		if (!pk) continue;
		for (const t of ev.tags ?? []) {
			if (t[0] === 'l' && t[1]) {
				const lv = String(t[1]);
				if (!labelMap.has(lv)) labelMap.set(lv, new Set());
				labelMap.get(lv).add(pk);
			}
		}
	}
	return [...labelMap.entries()]
		.map(([label, pubkeys]) => ({ label, pubkeys: [...pubkeys] }))
		.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Publish kind 1985 labeling an addressable app or stack (`a` tag).
 * Structured values `alternative:*`, `reads:*`, `writes:*` use L=app and l mark app per Nostr label spec.
 * Topic / freeform labels use `L` + `l` mark `#t`. Plain `l` without `L` is not used here.
 */
export async function publishAddressableLabel(signEvent, params) {
	if (typeof signEvent !== 'function') throw new Error('signEvent is required');
	const {
		pubkey,
		identifier,
		contentType = 'app',
		labelValue: rawLabel,
		relays = SOCIAL_RELAYS
	} = params;
	if (!pubkey?.trim() || !identifier?.trim()) throw new Error('Label target (pubkey, identifier) is required');
	const trimmed = String(rawLabel ?? '').trim();
	if (!trimmed) throw new Error('Label text is required');

	const aKind = contentType === 'stack' ? EVENT_KINDS.APP_STACK : EVENT_KINDS.APP;
	const aTagValue = `${aKind}:${pubkey.trim().toLowerCase()}:${identifier.trim()}`;
	const relayHint = ZAPSTORE_RELAY;

	const structured = /^(alternative|reads|writes):(.+)$/i.exec(trimmed);
	const rest = structured?.[2]?.trim() ?? '';
	const tags =
		structured && rest
			? [
					['L', APP_LABEL_NAMESPACE],
					['l', `${structured[1].toLowerCase()}:${rest}`, APP_LABEL_NAMESPACE],
					['a', aTagValue, relayHint]
				]
			: [
					['L', TOPIC_LABEL_NAMESPACE],
					['l', trimmed, TOPIC_LABEL_NAMESPACE],
					['a', aTagValue, relayHint]
				];

	const template = {
		kind: EVENT_KINDS.LABEL,
		content: '',
		tags,
		created_at: Math.floor(Date.now() / 1000)
	};

	const signed = await signEvent(template);
	await publishToRelays(relays, signed);
	await putEvents([signed]);
	return signed;
}

/**
 * Publish kind 1985 labeling a forum post (`#e` root + `#h` community), matching {@link fetchLabelEvents}.
 */
export async function publishForumPostLabel(signEvent, params) {
	if (typeof signEvent !== 'function') throw new Error('signEvent is required');
	const { eventId, communityPubkey, labelValue: rawLabel, relays } = params;
	const relayUrls = Array.isArray(relays) && relays.length > 0 ? relays : SOCIAL_RELAYS;
	if (!eventId?.trim() || !communityPubkey?.trim()) {
		throw new Error('Forum label target (eventId, communityPubkey) is required');
	}
	const trimmed = String(rawLabel ?? '').trim();
	if (!trimmed) throw new Error('Label text is required');

	const id = eventId.trim().toLowerCase();
	const h = communityPubkey.trim().toLowerCase();

	const tags = [
		['L', TOPIC_LABEL_NAMESPACE],
		['l', trimmed, TOPIC_LABEL_NAMESPACE],
		['e', id, ZAPSTORE_RELAY],
		['h', h]
	];

	const template = {
		kind: EVENT_KINDS.LABEL,
		content: '',
		tags,
		created_at: Math.floor(Date.now() / 1000)
	};

	const signed = await signEvent(template);
	await publishToRelays(relayUrls, signed);
	await putEvents([signed]);
	return signed;
}

/**
 * NIP-09: publish kind 5 deletion request for an event, then remove it from Dexie.
 * @param {{ eventId: string, eventKind: number, aTagValue?: string, relays?: string[] }} opts
 */
export async function publishDeletionRequest(signEvent, opts) {
	if (typeof signEvent !== 'function') throw new Error('signEvent is required');
	const { eventId, eventKind, aTagValue, relays } = opts;
	const relayUrls = Array.isArray(relays) && relays.length > 0 ? relays : SOCIAL_RELAYS;
	const id = String(eventId ?? '').trim().toLowerCase();
	if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid event id');
	const tags = [
		['e', id, ZAPSTORE_RELAY],
		['k', String(eventKind)]
	];
	if (aTagValue?.trim()) tags.push(['a', aTagValue.trim(), ZAPSTORE_RELAY]);

	const template = {
		kind: 5,
		content: '',
		tags,
		created_at: Math.floor(Date.now() / 1000)
	};
	const signed = await signEvent(template);
	await publishToRelays(relayUrls, signed);
	await putEvents([signed]);
	try {
		await db.events.delete(id);
	} catch (dexieErr) {
		console.error('[publishDeletionRequest] Dexie delete failed:', dexieErr);
	}
	return signed;
}

/**
 * Delete a kind 1985 label the user published (NIP-09).
 */
export async function publishLabelDeletion(signEvent, labelEventId, relays) {
	const id = String(labelEventId ?? '').trim().toLowerCase();
	if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid label event id');
	return publishDeletionRequest(signEvent, {
		eventId: id,
		eventKind: EVENT_KINDS.LABEL,
		relays: Array.isArray(relays) && relays.length > 0 ? relays : SOCIAL_RELAYS
	});
}

/**
 * Publish a kind 30267 App Stack.
 * Creates a new stack with the given apps as references.
 */
export async function publishStack(name, description, apps, signEvent) {
	if (!name?.trim()) throw new Error('Stack name is required');

	// Generate a unique identifier from name + timestamp
	const identifier = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();

	const content = description?.trim() || '';

	const tags = [
		['d', identifier],
		['title', name.trim()],
		['f', PLATFORM_FILTER['#f'][0]] // android-arm64-v8a
	];

	if (!content) {
		tags.push(['h', ZAPSTORE_COMMUNITY_PUBKEY]);
	}

	// Add app references as 'a' tags (format: "kind:pubkey:identifier")
	for (const app of apps) {
		if (app?.pubkey && app?.dTag) {
			tags.push(['a', `${EVENT_KINDS.APP}:${app.pubkey}:${app.dTag}`, ZAPSTORE_RELAY]);
		}
	}

	const template = {
		kind: EVENT_KINDS.APP_STACK,
		content,
		tags,
		created_at: Math.floor(Date.now() / 1000)
	};

	const signed = await signEvent(template);
	const p = getPool();
	await Promise.allSettled(p.publish(DEFAULT_CATALOG_RELAYS, signed));
	await putEvents([signed]);

	return signed;
}

/**
 * Update an existing stack by adding or removing an app.
 * Since stacks are replaceable events (kind 30267), we create a new event with the same 'd' tag.
 */
export async function updateStackApps(stackEvent, app, action, signEvent) {
	if (!stackEvent?.id) throw new Error('Stack event is required');
	if (!app?.pubkey || !app?.dTag) throw new Error('App with pubkey and dTag is required');

	const dTag = stackEvent.tags.find(t => t[0] === 'd')?.[1];
	if (!dTag) throw new Error('Stack must have a d tag');

	const appATag = `${EVENT_KINDS.APP}:${app.pubkey}:${app.dTag}`;
	const existingATags = stackEvent.tags.filter(t => t[0] === 'a');
	const hintedATags = existingATags.map((t) =>
		t[1] ? ['a', t[1], ZAPSTORE_RELAY] : t
	);
	let newATags;

	if (action === 'add') {
		if (existingATags.some(t => t[1] === appATag)) return stackEvent;
		newATags = [...hintedATags, ['a', appATag, ZAPSTORE_RELAY]];
	} else if (action === 'remove') {
		newATags = hintedATags.filter(t => t[1] !== appATag);
	} else {
		throw new Error('Action must be "add" or "remove"');
	}
	
	// Preserve all non-'a' tags from original event, then add new 'a' tags
	const preservedTags = stackEvent.tags.filter(t => t[0] !== 'a');
	const tags = [...preservedTags, ...newATags];
	
	// Ensure we have the platform filter tag
	if (!tags.some(t => t[0] === 'f')) {
		tags.push(['f', PLATFORM_FILTER['#f'][0]]);
	}

	const isPublic = !(stackEvent.content || '').trim();
	// Remove any existing h tag — it will be re-added only for public stacks
	const tagsWithoutH = tags.filter(t => !(t[0] === 'h' && t[1] === ZAPSTORE_COMMUNITY_PUBKEY));
	tags.length = 0;
	tags.push(...tagsWithoutH);
	if (isPublic && !tags.some(t => t[0] === 'h' && t[1] === ZAPSTORE_COMMUNITY_PUBKEY)) {
		tags.push(['h', ZAPSTORE_COMMUNITY_PUBKEY]);
	}
	
	const template = {
		kind: EVENT_KINDS.APP_STACK,
		content: stackEvent.content || '',
		tags,
		created_at: Math.floor(Date.now() / 1000)
	};
	
	let signed;
	try {
		signed = await signEvent(template);
	} catch (signErr) {
		console.error('[updateStackApps] signing failed:', signErr);
		throw signErr;
	}
	if (!signed?.id) throw new Error('Signing failed - no valid event returned');

	const p = getPool();
	try {
		const results = await Promise.allSettled(p.publish(DEFAULT_CATALOG_RELAYS, signed));
		const failed = results.filter(r => r.status === 'rejected');
		if (failed.length > 0) console.warn('[updateStackApps] some publishes failed:', failed.map(f => f.reason));
	} catch (pubErr) {
		console.error('[updateStackApps] publish failed:', pubErr);
	}

	try {
		await putEvents([signed]);
	} catch (dexieErr) {
		console.error('[updateStackApps] Dexie write failed:', dexieErr);
		throw dexieErr;
	}

	return signed;
}

/**
 * Update an existing stack with new name, description, and/or apps list.
 * Since stacks are replaceable events (kind 30267), we create a new event with the same 'd' tag.
 */
export async function updateStack(stackEvent, newName, newDescription, newApps, signEvent) {
	
	if (!stackEvent?.id) throw new Error('Stack event is required');
	
	const dTag = stackEvent.tags.find(t => t[0] === 'd')?.[1];
	if (!dTag) throw new Error('Stack must have a d tag');
	
	const content = newDescription?.trim() || '';

	const tags = [
		['d', dTag],
		['f', PLATFORM_FILTER['#f'][0]]
	];

	if (!content) {
		tags.push(['h', ZAPSTORE_COMMUNITY_PUBKEY]);
	}
	
	// Add title tag if name is provided
	if (newName?.trim()) {
		tags.push(['title', newName.trim()]);
	}
	
	// Build app 'a' tags from the new apps list
	for (const app of (newApps || [])) {
		if (app?.pubkey && app?.dTag) {
			tags.push(['a', `${EVENT_KINDS.APP}:${app.pubkey}:${app.dTag}`, ZAPSTORE_RELAY]);
		}
	}
	
	const template = {
		kind: EVENT_KINDS.APP_STACK,
		content,
		tags,
		created_at: Math.floor(Date.now() / 1000)
	};
	
	let signed;
	try {
		signed = await signEvent(template);
	} catch (signErr) {
		console.error('[updateStack] signing failed:', signErr);
		throw signErr;
	}
	if (!signed?.id) throw new Error('Signing failed - no valid event returned');

	const p = getPool();
	try {
		const results = await Promise.allSettled(p.publish(DEFAULT_CATALOG_RELAYS, signed));
		const failed = results.filter(r => r.status === 'rejected');
		if (failed.length > 0) console.warn('[updateStack] some publishes failed:', failed.map(f => f.reason));
	} catch (pubErr) {
		console.error('[updateStack] publish failed:', pubErr);
	}

	try {
		await putEvents([signed]);
	} catch (dexieErr) {
		console.error('[updateStack] Dexie write failed:', dexieErr);
		throw dexieErr;
	}

	return signed;
}

/**
 * Delete a stack by publishing a kind 5 deletion event.
 * NIP-09: Event Deletion
 */
export async function deleteStack(stackEvent, signEvent) {
	
	if (!stackEvent?.id) throw new Error('Stack event is required');
	
	const dTag = stackEvent.tags.find(t => t[0] === 'd')?.[1];
	if (!dTag) throw new Error('Stack must have a d tag');
	
	// Build the deletion event (kind 5)
	// Reference the event by id with 'e' tag and by address with 'a' tag
	const aTagValue = `${EVENT_KINDS.APP_STACK}:${stackEvent.pubkey}:${dTag}`;
	
	const template = {
		kind: 5,
		content: 'Stack deleted',
		tags: [
			['e', stackEvent.id, ZAPSTORE_RELAY],
			['a', aTagValue, ZAPSTORE_RELAY],
			['k', String(EVENT_KINDS.APP_STACK)]
		],
		created_at: Math.floor(Date.now() / 1000)
	};
	
	let signed;
	try {
		signed = await signEvent(template);
	} catch (signErr) {
		console.error('[deleteStack] signing failed:', signErr);
		throw signErr;
	}
	if (!signed?.id) throw new Error('Signing failed - no valid event returned');

	const p = getPool();
	try {
		await Promise.allSettled(p.publish(DEFAULT_CATALOG_RELAYS, signed));
	} catch (pubErr) {
		console.error('[deleteStack] publish failed:', pubErr);
	}

	try {
		await db.events.delete(stackEvent.id);
	} catch (dexieErr) {
		console.error('[deleteStack] Dexie delete failed:', dexieErr);
	}

	return signed;
}

/**
 * Parse a comment event.
 */
export function parseComment(event) {
	const eTags = event.tags.filter((t) => (t[0] === 'e' || t[0] === 'E') && !!t[1]);
	const replyTag = eTags.find((t) => t[3] === 'reply');
	const parentId = (replyTag?.[1] ?? eTags[eTags.length - 1]?.[1]) ?? null;

	const emojiTags = [];
	for (const tag of event.tags) {
		if (tag[0] === 'emoji' && tag[1] && tag[2]) {
			emojiTags.push({ shortcode: tag[1], url: tag[2] });
		}
	}

	const mediaUrls = event.tags.filter((t) => t[0] === 'media' && t[1]).map((t) => t[1]);

	const contentHtml = event.content
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\n/g, '<br>');

	return {
		id: event.id,
		pubkey: event.pubkey,
		content: event.content,
		contentHtml: `<p>${contentHtml}</p>`,
		emojiTags,
		mediaUrls: mediaUrls || [],
		createdAt: event.created_at,
		parentId,
		isReply: parentId !== null,
		/** Version tag from the event (set when the comment was posted on a specific app release). */
		version: event.tags.find((t) => t[0] === 'v' && t[1])?.[1] ?? null
	};
}

// ============================================================================
// NIP-09 Deletion Sync
// ============================================================================

const DELETION_CHECK_KEY = 'zapstore_deletion_check_at';

/**
 * One-shot fetch for NIP-09 deletion events (kind 5) since last check.
 * Stores a timestamp in localStorage so each startup only fetches new deletions.
 * The fetched events flow through putEvents → applyDeletions, busting Dexie cache.
 *
 * Call on app startup after startLiveSubscriptions(). Fire-and-forget.
 *
 * @param {string[]} relayUrls
 */
export async function syncDeletions(relayUrls) {
	if (typeof navigator !== 'undefined' && !navigator.onLine) return;

	const now = Math.floor(Date.now() / 1000);
	const stored = localStorage.getItem(DELETION_CHECK_KEY);
	const since = stored ? parseInt(stored, 10) : undefined;

	const filter = /** @type {object} */ ({
		kinds: [EVENT_KINDS.DELETION],
		'#k': [String(EVENT_KINDS.APP), String(EVENT_KINDS.APP_STACK)],
		limit: 200
	});
	if (since !== undefined) filter.since = since;

	await fetchFromRelays(relayUrls, filter, { timeout: 5000, feature: 'deletions' });
	localStorage.setItem(DELETION_CHECK_KEY, String(now));
}

/**
 * Cleanup — stop subscriptions and close pool.
 */
export function cleanup() {
	stopLiveSubscriptions();
	if (pool) {
		pool.close([...DEFAULT_CATALOG_RELAYS, ...DEFAULT_SOCIAL_RELAYS]);
		pool = null;
	}
}
