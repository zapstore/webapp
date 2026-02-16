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
import { SimplePool } from 'nostr-tools';
import { DEFAULT_CATALOG_RELAYS, DEFAULT_SOCIAL_RELAYS, PLATFORM_FILTER, EVENT_KINDS } from '$lib/config';
import { APPS_POLL_LIMIT, STACKS_POLL_LIMIT } from '$lib/constants';
import { putEvents, queryEvents } from './dexie';

// ============================================================================
// Relay Pool
// ============================================================================

let pool = null;

function getPool() {
	if (!pool) pool = new SimplePool();
	return pool;
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
			console.log('[Service] Catalog subscription closed:', reasons);
		}
	};

	// Separate subscriptions per filter (subscribeMany takes a single filter)
	// Limits = POLL_LIMIT (3 × page size) — load-more handles deeper data
	activeSubscriptions.push(
		p.subscribeMany(DEFAULT_CATALOG_RELAYS, { kinds: [EVENT_KINDS.APP], ...PLATFORM_FILTER, limit: APPS_POLL_LIMIT }, subParams)
	);
	// Releases: needed for app detail pages + liveQuery reactivity
	activeSubscriptions.push(
		p.subscribeMany(DEFAULT_CATALOG_RELAYS, { kinds: [EVENT_KINDS.RELEASE], limit: APPS_POLL_LIMIT }, subParams)
	);
	// Stacks
	activeSubscriptions.push(
		p.subscribeMany(DEFAULT_CATALOG_RELAYS, { kinds: [EVENT_KINDS.APP_STACK], ...PLATFORM_FILTER, limit: STACKS_POLL_LIMIT }, subParams)
	);
	console.log('[Service] Live subscriptions started');
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

	console.log('[Service] Live subscriptions stopped');
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
	const { timeout = 5000, signal } = options;
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
			resolve(events);
		};

		const p = getPool();
		const sub = p.subscribeMany(relayUrls, filter, {
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

	return fetchFromRelays(relays, filter, { timeout, signal });
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
	return fetchFromRelays(relayUrls, filter, { timeout, signal });
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
	const events = await fetchFromRelays(relayUrls, filter, { timeout, signal });
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
		limit
	};
	if (until != null && !isNaN(until)) filter.until = Number(until);
	return fetchFromRelays(relayUrls, filter, { timeout, signal });
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
				{ timeout, signal }
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

const SOCIAL_RELAYS = [...DEFAULT_SOCIAL_RELAYS];

/**
 * Query comments from Dexie.
 */
export async function queryCommentsFromStore(pubkey, identifier, aTagKind = 32267) {
	if (!pubkey || !identifier) return [];
	const aTagValue = `${aTagKind}:${pubkey}:${identifier}`;

	const lower = await queryEvents({ kinds: [1111], '#a': [aTagValue], limit: 500 });
	const upper = await queryEvents({ kinds: [1111], '#A': [aTagValue], limit: 500 });

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
	const { timeout = 5000, signal, relays = SOCIAL_RELAYS, aTagKind = 32267 } = options;
	if (signal?.aborted || !pubkey || !identifier) return [];

	const aTagValue = `${aTagKind}:${pubkey}:${identifier}`;
	const filterLower = { kinds: [1111], '#a': [aTagValue], limit: 500 };
	const filterUpper = { kinds: [1111], '#A': [aTagValue], limit: 500 };

	const [eventsLower, eventsUpper] = await Promise.all([
		fetchFromRelays(relays, filterLower, { timeout, signal }),
		fetchFromRelays(relays, filterUpper, { timeout, signal })
	]);

	const byId = new Map();
	for (const e of [...eventsLower, ...eventsUpper]) {
		if (!byId.has(e.id)) byId.set(e.id, e);
	}

	return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
}

const COMMENT_REPLIES_E_BATCH = 100;

/**
 * Fetch comment replies by event IDs.
 */
export async function fetchCommentRepliesByE(eventIds, options = {}) {
	if (eventIds.length === 0) return [];
	const { timeout = 5000, signal, relays = SOCIAL_RELAYS } = options;

	const byId = new Map();
	for (let i = 0; i < eventIds.length; i += COMMENT_REPLIES_E_BATCH) {
		const chunk = eventIds.slice(i, i + COMMENT_REPLIES_E_BATCH);
		const filter = { kinds: [1111], '#e': chunk, limit: 500 };
		const events = await fetchFromRelays(relays, filter, { timeout, signal });
		for (const e of events) byId.set(e.id, e);
	}

	return Array.from(byId.values());
}

/**
 * Fetch zap receipts by recipient pubkeys from social relays.
 */
export async function fetchZapReceiptsByPubkeys(pubkeys, options = {}) {
	const { since, limit = 500, timeout = 8000, signal } = options;
	if (signal?.aborted || !pubkeys?.length) return [];

	const filter = { kinds: [9735], '#p': pubkeys };
	if (since !== undefined) filter.since = since;
	if (limit) filter.limit = limit;

	return fetchFromRelays(SOCIAL_RELAYS, filter, { timeout, signal });
}

/**
 * Fetch zaps for an app.
 */
export async function fetchZaps(pubkey, identifier, options = {}) {
	const { timeout = 5000, signal, relays = SOCIAL_RELAYS } = options;
	if (signal?.aborted || !pubkey || !identifier) return [];

	const aTagValue = `32267:${pubkey}:${identifier}`;
	const byId = new Map();

	const filtersMain = [
		{ kinds: [9735], '#a': [aTagValue], limit: 100 },
		{ kinds: [9735], '#A': [aTagValue], limit: 100 }
	];

	const mainResults = await Promise.all(
		filtersMain.map((f) => fetchFromRelays(relays, f, { timeout, signal }))
	);
	for (const events of mainResults) {
		for (const e of events) if (!byId.has(e.id)) byId.set(e.id, e);
	}

	// Zaps on specific events
	const eventIds = (options.eventIds ?? [])
		.map((id) => id.trim().toLowerCase())
		.filter((id) => /^[a-f0-9]{64}$/.test(id));

	if (eventIds.length > 0 && !signal?.aborted) {
		const filterE = { kinds: [9735], '#e': eventIds, limit: 100 };
		const filterEUpper = { kinds: [9735], '#E': eventIds, limit: 100 };
		const [byELower, byEUpper] = await Promise.all([
			fetchFromRelays(relays, filterE, { timeout, signal }),
			fetchFromRelays(relays, filterEUpper, { timeout, signal })
		]);
		for (const e of [...byELower, ...byEUpper]) {
			if (!byId.has(e.id)) byId.set(e.id, e);
		}
	}

	return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
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
			result.senderPubkey = zapRequest.pubkey;
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

	return result;
}

/**
 * Publish a NIP-22 comment (kind 1111).
 * Writes to Dexie after successful publish.
 */
export async function publishComment(content, target, signEvent, emojiTags, parentEventId, replyToPubkey, parentKind) {
	if (!content?.trim()) throw new Error('Comment content is required');
	if (!target?.pubkey?.trim() || !target?.identifier?.trim()) {
		throw new Error('Comment target (pubkey, identifier) is required');
	}

	const kind = 32267;
	const stackKind = 30267;
	const aTagValue = target.contentType === 'app'
		? `${kind}:${target.pubkey}:${target.identifier}`
		: `${stackKind}:${target.pubkey}:${target.identifier}`;

	const rootKind = target.contentType === 'app' ? kind : stackKind;
	const tags = [
		['a', aTagValue],
		['A', aTagValue],
		['K', String(rootKind)],
		['P', target.pubkey.trim().toLowerCase()]
	];

	if (parentEventId) {
		const eId = parentEventId.trim().toLowerCase();
		if (!/^[a-f0-9]{64}$/.test(eId)) {
			throw new Error(`Invalid parent event id: ${parentEventId.slice(0, 20)}...`);
		}
		tags.push(['e', eId]);
		tags.push(['k', String(parentKind ?? 1111)]);
		if (replyToPubkey) tags.push(['p', replyToPubkey.trim().toLowerCase()]);
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

	const template = {
		kind: 1111,
		content: content.trim(),
		tags,
		created_at: Math.floor(Date.now() / 1000)
	};

	const signed = await signEvent(template);
	const p = getPool();

	// Publish to relays — pool.publish returns an array of promises (one per relay)
	await Promise.allSettled(p.publish(SOCIAL_RELAYS, signed));

	// Write to Dexie
	await putEvents([signed]);

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
		createdAt: event.created_at,
		parentId,
		isReply: parentId !== null
	};
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
