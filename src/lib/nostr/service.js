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
import {
	ZAPSTORE_RELAY,
	DEFAULT_CATALOG_RELAYS,
	DEFAULT_SOCIAL_RELAYS,
	PLATFORM_FILTER,
	EVENT_KINDS,
	SUB_PREFIX
} from '$lib/config';

const subId = (feature) => `${SUB_PREFIX}${feature}-${Math.floor(Math.random() * 1e9)}`;
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

export async function publishToRelays(relayUrls, signedEvent) {
	const p = getPool();
	await Promise.allSettled(p.publish(relayUrls, signedEvent));
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
		onclose() {}
	};

	// Separate subscriptions per filter (subscribeMany takes a single filter)
	// Limits = POLL_LIMIT (3 × page size) — load-more handles deeper data
	activeSubscriptions.push(
		p.subscribeMany(
			[ZAPSTORE_RELAY],
			{ kinds: [EVENT_KINDS.APP], ...PLATFORM_FILTER, limit: APPS_POLL_LIMIT },
			{ ...subParams, id: subId('apps') }
		)
	);
	// Releases: needed for app detail pages + liveQuery reactivity
	// since:now — live sub only needs future events; also raises relay specificity score to 3
	activeSubscriptions.push(
		p.subscribeMany(
			[ZAPSTORE_RELAY],
			{ kinds: [EVENT_KINDS.RELEASE], since: Math.floor(Date.now() / 1000), limit: 50 },
			{ ...subParams, id: subId('releases') }
		)
	);
	// Stacks
	activeSubscriptions.push(
		p.subscribeMany(
			[ZAPSTORE_RELAY],
			{ kinds: [EVENT_KINDS.APP_STACK], ...PLATFORM_FILTER, limit: STACKS_POLL_LIMIT },
			{ ...subParams, id: subId('stacks') }
		)
	);
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
			try {
				sub?.close();
			} catch {
				/* noop */
			}
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
	const events = await fetchFromRelays(relayUrls, filter, {
		timeout,
		signal,
		feature: 'app-detail'
	});
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
			pubkeys.map((pk) => String(pk).trim().toLowerCase()).filter((pk) => /^[a-f0-9]{64}$/.test(pk))
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
	const {
		timeout = 5000,
		signal,
		relays = SOCIAL_RELAYS,
		aTagKind = 32267,
		eventId = null
	} = options;
	if (signal?.aborted) return [];

	// Non-replaceable event root: filter by #e / #E tags
	if (eventId) {
		const filterLower = { kinds: [1111], '#e': [eventId], limit: 500 };
		const filterUpper = { kinds: [1111], '#E': [eventId], limit: 500 };
		const [eventsLower, eventsUpper] = await Promise.all([
			fetchFromRelays(relays, filterLower, { timeout, signal, feature: 'comments' }),
			fetchFromRelays(relays, filterUpper, { timeout, signal, feature: 'comments' })
		]);
		const byId = new Map();
		for (const e of [...eventsLower, ...eventsUpper]) {
			if (!byId.has(e.id)) byId.set(e.id, e);
		}
		return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
	}

	// Replaceable/addressable event root: filter by #a / #A tags
	if (!pubkey || !identifier) return [];
	const aTagValue = `${aTagKind}:${pubkey}:${identifier}`;
	const filterLower = { kinds: [1111], '#a': [aTagValue], limit: 500 };
	const filterUpper = { kinds: [1111], '#A': [aTagValue], limit: 500 };

	const [eventsLower, eventsUpper] = await Promise.all([
		fetchFromRelays(relays, filterLower, { timeout, signal, feature: 'comments' }),
		fetchFromRelays(relays, filterUpper, { timeout, signal, feature: 'comments' })
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
		const events = await fetchFromRelays(relays, filter, { timeout, signal, feature: 'comments' });
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

	return fetchFromRelays(SOCIAL_RELAYS, filter, { timeout, signal, feature: 'zaps' });
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
		filtersMain.map((f) => fetchFromRelays(relays, f, { timeout, signal, feature: 'zaps' }))
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
			fetchFromRelays(relays, filterE, { timeout, signal, feature: 'zaps' }),
			fetchFromRelays(relays, filterEUpper, { timeout, signal, feature: 'zaps' })
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
				case 'm':
					result.amountSats = num * 100000;
					break;
				case 'u':
					result.amountSats = num * 100;
					break;
				case 'n':
					result.amountSats = Math.round(num / 10);
					break;
				case 'p':
					result.amountSats = Math.round(num / 10000);
					break;
				default:
					result.amountSats = num * 100000000;
					break;
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
 * @param {string} content - Comment text (may include nostr:npub… and :shortcode:)
 * @param {object} target - Replaceable: { contentType, pubkey, identifier } | Non-replaceable: { contentType, pubkey, id, kind }
 * @param {function} signEvent - NIP-07 signer
 * @param {Array<{ shortcode: string, url: string }>} [emojiTags] - Custom emoji tags for the event
 * @param {string} [parentEventId] - Parent comment/event id for replies
 * @param {string} [replyToPubkey] - Pubkey being replied to (p tag on reply)
 * @param {number} [parentKind] - Kind of parent (e.g. 1111 or 9735)
 * @param {string[]} [mentions] - Pubkeys mentioned in content (p tags for notifications)
 */
export async function publishComment(
	content,
	target,
	signEvent,
	emojiTags,
	parentEventId,
	replyToPubkey,
	parentKind,
	mentions
) {
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

	// NIP-22: uppercase tags (E/A, K, P) always point to the root scope.
	// Lowercase tags (e/a, k, p) always point to the parent item.
	// For top-level comments the parent IS the root, so lowercase duplicates the uppercase values.
	// For replies to comments, lowercase tags point to the parent comment instead.
	const isReply = !!parentEventId;
	const relayHint = ZAPSTORE_RELAY;

	if (isNonReplaceable) {
		rootKind = target.kind ?? 11;
		const eId = target.id.trim().toLowerCase();
		const pubkey = target.pubkey.trim().toLowerCase();
		tags = [
			['E', eId, relayHint, pubkey],
			['K', String(rootKind)],
			['P', pubkey, relayHint]
		];
		// Top-level comment: parent = root
		if (!isReply) {
			tags.push(['e', eId, relayHint, pubkey]);
			tags.push(['k', String(rootKind)]);
			tags.push(['p', pubkey, relayHint]);
		}
	} else {
		const kind = 32267;
		const stackKind = 30267;
		const aTagValue =
			target.contentType === 'app'
				? `${kind}:${target.pubkey}:${target.identifier}`
				: `${stackKind}:${target.pubkey}:${target.identifier}`;

		rootKind = target.contentType === 'app' ? kind : stackKind;
		const pubkey = target.pubkey.trim().toLowerCase();
		tags = [
			['A', aTagValue, relayHint],
			['K', String(rootKind)],
			['P', pubkey, relayHint]
		];
		// Top-level comment: parent = root
		if (!isReply) {
			tags.push(['a', aTagValue, relayHint]);
			tags.push(['k', String(rootKind)]);
			tags.push(['p', pubkey, relayHint]);
		}
	}

	// Reply to a comment: lowercase tags point to the parent comment
	if (isReply) {
		const parentId = parentEventId.trim().toLowerCase();
		if (!/^[a-f0-9]{64}$/.test(parentId)) {
			throw new Error(`Invalid parent event id: ${parentEventId.slice(0, 20)}...`);
		}
		const parentPubkey = replyToPubkey?.trim();
		if (!parentPubkey || !/^[a-f0-9]{64}$/.test(parentPubkey.toLowerCase())) {
			throw new Error(
				'replyToPubkey (parent comment author) is required when replying to a comment'
			);
		}
		tags.push(['e', parentId, relayHint, parentPubkey.toLowerCase()]);
		tags.push(['k', String(parentKind ?? 1111)]);
		tags.push(['p', parentPubkey.toLowerCase(), relayHint]);
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
 * Publish a kind 30267 App Stack.
 * Creates a new stack with the given apps as references.
 */
export async function publishStack(name, description, apps, signEvent) {
	if (!name?.trim()) throw new Error('Stack name is required');

	// Generate a unique identifier from name + timestamp
	const identifier =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') +
		'-' +
		Date.now();

	const tags = [
		['d', identifier],
		['title', name.trim()],
		['f', PLATFORM_FILTER['#f'][0]] // android-arm64-v8a
	];

	// Add app references as 'a' tags (format: "kind:pubkey:identifier")
	for (const app of apps) {
		if (app?.pubkey && app?.dTag) {
			tags.push(['a', `${EVENT_KINDS.APP}:${app.pubkey}:${app.dTag}`]);
		}
	}

	const template = {
		kind: EVENT_KINDS.APP_STACK,
		content: description?.trim() || '',
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

	const dTag = stackEvent.tags.find((t) => t[0] === 'd')?.[1];
	if (!dTag) throw new Error('Stack must have a d tag');

	const appATag = `${EVENT_KINDS.APP}:${app.pubkey}:${app.dTag}`;
	const existingATags = stackEvent.tags.filter((t) => t[0] === 'a');
	let newATags;

	if (action === 'add') {
		if (existingATags.some((t) => t[1] === appATag)) return stackEvent;
		newATags = [...existingATags, ['a', appATag]];
	} else if (action === 'remove') {
		newATags = existingATags.filter((t) => t[1] !== appATag);
	} else {
		throw new Error('Action must be "add" or "remove"');
	}

	// Preserve all non-'a' tags from original event, then add new 'a' tags
	const preservedTags = stackEvent.tags.filter((t) => t[0] !== 'a');
	const tags = [...preservedTags, ...newATags];

	// Ensure we have the platform filter tag
	if (!tags.some((t) => t[0] === 'f')) {
		tags.push(['f', PLATFORM_FILTER['#f'][0]]);
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
		const failed = results.filter((r) => r.status === 'rejected');
		if (failed.length > 0)
			console.warn(
				'[updateStackApps] some publishes failed:',
				failed.map((f) => f.reason)
			);
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

	const dTag = stackEvent.tags.find((t) => t[0] === 'd')?.[1];
	if (!dTag) throw new Error('Stack must have a d tag');

	// Build tags list, preserving d tag and platform filter
	const tags = [
		['d', dTag],
		['f', PLATFORM_FILTER['#f'][0]]
	];

	// Add title tag if name is provided
	if (newName?.trim()) {
		tags.push(['title', newName.trim()]);
	}

	// Build app 'a' tags from the new apps list
	for (const app of newApps || []) {
		if (app?.pubkey && app?.dTag) {
			tags.push(['a', `${EVENT_KINDS.APP}:${app.pubkey}:${app.dTag}`]);
		}
	}

	const template = {
		kind: EVENT_KINDS.APP_STACK,
		content: newDescription?.trim() || '',
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
		const failed = results.filter((r) => r.status === 'rejected');
		if (failed.length > 0)
			console.warn(
				'[updateStack] some publishes failed:',
				failed.map((f) => f.reason)
			);
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

	const dTag = stackEvent.tags.find((t) => t[0] === 'd')?.[1];
	if (!dTag) throw new Error('Stack must have a d tag');

	// Build the deletion event (kind 5)
	// Reference the event by id with 'e' tag and by address with 'a' tag
	const aTagValue = `${EVENT_KINDS.APP_STACK}:${stackEvent.pubkey}:${dTag}`;

	const template = {
		kind: 5,
		content: 'Stack deleted',
		tags: [
			['e', stackEvent.id],
			['a', aTagValue],
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
	const parentId = replyTag?.[1] ?? eTags[eTags.length - 1]?.[1] ?? null;

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
