/**
 * Community forum search — local Dexie first, then NIP-50 relay (posts + comments).
 */
import { nip19 } from 'nostr-tools';
import { queryEvents, searchForumPosts, searchForumComments } from '$lib/purpleweb';
import { parseForumPost } from '$lib/nostr/models';
import { EVENT_KINDS, ZAPSTORE_RELAY } from '$lib/config';

/** @typedef {'post' | 'comment'} ForumSearchResultType */

/**
 * @typedef {Object} ForumSearchPostResult
 * @property {'post'} type
 * @property {import('nostr-tools').NostrEvent} event
 */

/**
 * @typedef {Object} ForumSearchCommentResult
 * @property {'comment'} type
 * @property {import('nostr-tools').NostrEvent} event
 * @property {string | null} rootPostId
 * @property {string | null} rootPostNevent
 * @property {import('nostr-tools').NostrEvent} rootEvent
 * @property {string | null} rootATag
 */

/** @typedef {ForumSearchPostResult | ForumSearchCommentResult} ForumSearchResult */

/**
 * @param {import('nostr-tools').NostrEvent} event
 * @param {string} lower
 */
export function postMatchesQuery(event, lower) {
	const post = parseForumPost(event);
	if (!post) return false;
	if ((post.title ?? '').toLowerCase().includes(lower)) return true;
	if ((post.content ?? '').toLowerCase().includes(lower)) return true;
	const labels = post.labels ?? [];
	return labels.some((t) => t.toLowerCase().includes(lower));
}

/** @param {string} id */
export function safeForumNevent(id) {
	try {
		return nip19.neventEncode({ id });
	} catch {
		return '';
	}
}

/**
 * @param {string | null | undefined} a
 * @returns {{ kind: number, pubkey: string, dTag: string } | null}
 */
function parseNip33ATag(a) {
	if (!a || typeof a !== 'string') return null;
	const m = a.match(/^(\d+):([0-9a-fA-F]{64}):(.*)$/);
	if (!m) return null;
	const kind = parseInt(m[1], 10);
	if (kind !== EVENT_KINDS.APP && kind !== EVENT_KINDS.APP_STACK) return null;
	return { kind, pubkey: m[2], dTag: m[3] };
}

/** @param {string | null | undefined} a */
function isAddressableRootATag(a) {
	if (!a || typeof a !== 'string') return false;
	return (
		a.startsWith(`${EVENT_KINDS.APP}:`) || a.startsWith(`${EVENT_KINDS.APP_STACK}:`)
	);
}

/**
 * @param {string} q
 * @param {string} hPubkey
 * @param {AbortSignal} signal
 * @param {{ postLimit?: number, commentLimit?: number }} [limits]
 * @returns {Promise<{ results: ForumSearchResult[], profilesByPubkey: Map<string, { name?: string | null, picture?: string | null }> }>}
 */
export async function runForumSearchLocal(
	q,
	hPubkey,
	signal,
	{ postLimit = 200, commentLimit = 200 } = {}
) {
	const lower = q.toLowerCase();

	const [postEvents, commentEvents] = await Promise.all([
		queryEvents({ kinds: [EVENT_KINDS.FORUM_POST], '#h': [hPubkey], limit: postLimit }),
		queryEvents({
			kinds: [EVENT_KINDS.COMMENT],
			'#K': [String(EVENT_KINDS.FORUM_POST), String(EVENT_KINDS.APP), String(EVENT_KINDS.APP_STACK)],
			limit: commentLimit
		})
	]);
	if (signal.aborted) return { results: [], profilesByPubkey: new Map() };

	const filteredPosts = postEvents
		.filter((e) => postMatchesQuery(e, lower))
		.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
		.slice(0, 15);

	const matchingComments = commentEvents
		.filter((e) => (e.content ?? '').toLowerCase().includes(lower))
		.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));

	const rootIdSet = new Set(
		matchingComments.map((e) => e.tags?.find((t) => t[0] === 'E' && t[1])?.[1]).filter(Boolean)
	);
	/** @type {Map<string, import('nostr-tools').NostrEvent>} */
	const rootPostMap = new Map();
	/** @type {Map<string, import('nostr-tools').NostrEvent>} */
	const addrRootMap = new Map();
	if (rootIdSet.size > 0) {
		const rootPosts = await queryEvents({ ids: [...rootIdSet], limit: rootIdSet.size });
		if (signal.aborted) return { results: [], profilesByPubkey: new Map() };
		for (const rp of rootPosts) {
			if (rp.tags?.some((t) => t[0] === 'h' && t[1] === hPubkey)) {
				rootPostMap.set(rp.id, rp);
			}
		}
	}

	const addrTagSet = new Set(
		matchingComments
			.map((e) => e.tags?.find((t) => t[0] === 'A' && t[1])?.[1] ?? e.tags?.find((t) => t[0] === 'a' && t[1])?.[1])
			.filter(Boolean)
			.map((a) => String(a))
	);
	/** @type {Map<string, Map<string, true>>} */
	const dByGroup = new Map();
	for (const a of addrTagSet) {
		const parsed = parseNip33ATag(a);
		if (!parsed) continue;
		const key = `${parsed.kind}:${parsed.pubkey}`;
		if (!dByGroup.has(key)) dByGroup.set(key, new Map());
		dByGroup.get(key).set(parsed.dTag, true);
	}
	for (const [groupKey, dMap] of dByGroup) {
		const [kindStr, pubkey] = groupKey.split(':');
		const kind = parseInt(kindStr, 10);
		const dTags = [...dMap.keys()];
		for (let i = 0; i < dTags.length; i += 30) {
			const dChunk = dTags.slice(i, i + 30);
			const evs = await queryEvents({
				kinds: [kind],
				authors: [pubkey],
				'#d': dChunk,
				limit: Math.max(80, dChunk.length)
			});
			if (signal.aborted) return { results: [], profilesByPubkey: new Map() };
			for (const ev of evs) {
				const d = ev.tags?.find((t) => t[0] === 'd')?.[1];
				if (!d) continue;
				addrRootMap.set(`${ev.kind}:${ev.pubkey}:${d}`, ev);
			}
		}
	}

	/** @type {ForumSearchResult[]} */
	const commentResults = matchingComments
		.flatMap((e) => {
			const rootId = e.tags?.find((t) => t[0] === 'E' && t[1])?.[1];
			const rootATag =
				e.tags?.find((t) => t[0] === 'A' && t[1])?.[1] ??
				e.tags?.find((t) => t[0] === 'a' && t[1])?.[1] ??
				null;
			const rootPost = rootId ? rootPostMap.get(rootId) : null;
			const rootAddr = rootATag ? addrRootMap.get(rootATag) : null;
			// Match Activity feed: addressable app/stack roots win over #E forum ids.
			const rootEvent =
				isAddressableRootATag(rootATag) && rootAddr
					? rootAddr
					: rootPost ?? rootAddr ?? null;
			if (!rootEvent) return [];
			const rootPostNevent =
				rootEvent.kind === EVENT_KINDS.FORUM_POST ? safeForumNevent(rootEvent.id) : null;
			return [
				{
					type: /** @type {'comment'} */ ('comment'),
					event: e,
					rootPostId: rootEvent.kind === EVENT_KINDS.FORUM_POST ? rootEvent.id : null,
					rootPostNevent,
					rootEvent,
					rootATag
				}
			];
		})
		.slice(0, 15);

	/** @type {ForumSearchResult[]} */
	const results = [
		...filteredPosts.map((e) => ({ type: /** @type {'post'} */ ('post'), event: e })),
		...commentResults
	].sort((a, b) => (b.event?.created_at ?? 0) - (a.event?.created_at ?? 0));

	return { results, profilesByPubkey: new Map() };
}

/**
 * Relay NIP-50 search; caller should re-run {@link runForumSearchLocal} after this settles.
 *
 * @param {string} q
 * @param {string} hPubkey
 * @param {AbortSignal} signal
 */
export async function runForumSearchRelay(q, hPubkey, signal) {
	await Promise.all([
		searchForumPosts([ZAPSTORE_RELAY], hPubkey, q, {
			limit: 50,
			timeout: 6000,
			signal
		}),
		searchForumComments([ZAPSTORE_RELAY], q, {
			limit: 50,
			timeout: 6000,
			signal
		})
	]);
}
