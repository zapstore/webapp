/**
 * Resolve "discussion root" comments for thread modals (NIP-22 kind 1111).
 * The modal header must show the root of the sub-thread, not a nested reply.
 */

/**
 * @param {import('nostr-tools').NostrEvent} ev
 * @returns {string | null}
 */
export function getCommentParentEventId(ev) {
	const eTag = ev?.tags?.find((t) => t[0] === 'e' && t[1])?.[1] ?? null;
	return eTag && /^[a-f0-9]{64}$/i.test(eTag) ? eTag.toLowerCase() : null;
}

/**
 * Some threads include `E` pointing at the thread's root comment (not the forum post).
 * @param {import('nostr-tools').NostrEvent} ev
 * @returns {string | null}
 */
export function getThreadRootCommentIdFromETag(ev) {
	const E = ev?.tags?.find((t) => t[0] === 'E' && t[1])?.[1] ?? null;
	return E && /^[a-f0-9]{64}$/i.test(E) ? E.toLowerCase() : null;
}

/**
 * App/stack comments: walk up `e` until no parent comment event.
 * @param {import('nostr-tools').NostrEvent} ev
 * @param {Map<string, import('nostr-tools').NostrEvent>} commentMap — keys lowercased id
 * @returns {string | null} root id, or null if chain breaks before root
 */
export function walkAppDiscussionRootInMap(ev, commentMap) {
	const fromE = getThreadRootCommentIdFromETag(ev);
	if (fromE) return fromE;

	function getFromMap(id) {
		const il = id.toLowerCase();
		return commentMap.get(il) ?? commentMap.get(id);
	}

	let current = ev;
	const seen = new Set();
	for (;;) {
		if (seen.has(current.id)) return null;
		seen.add(current.id);
		const p = getCommentParentEventId(current);
		if (!p) return current.id;
		const parent = getFromMap(p);
		if (!parent) return null;
		current = parent;
	}
}

/**
 * @param {import('nostr-tools').NostrEvent} ev
 * @param {Map<string, import('nostr-tools').NostrEvent>} commentMap
 * @param {null | ((id: string) => Promise<import('nostr-tools').NostrEvent | null>)} fetchEvent
 * @returns {Promise<string>}
 */
export async function resolveAppDiscussionRootCommentId(ev, commentMap, fetchEvent = null) {
	const fromE = getThreadRootCommentIdFromETag(ev);
	if (fromE) return fromE;

	let current = ev;
	const seen = new Set();
	for (;;) {
		if (seen.has(current.id)) return current.id;
		seen.add(current.id);
		const p = getCommentParentEventId(current);
		if (!p) return current.id;
		const il = p.toLowerCase();
		let parent = commentMap.get(il) ?? commentMap.get(p);
		if (!parent && fetchEvent) {
			const fetched = await fetchEvent(p);
			if (fetched) {
				commentMap.set(fetched.id.toLowerCase(), fetched);
				parent = fetched;
			}
		}
		if (!parent) return current.id;
		current = parent;
	}
}

/**
 * Forum: `E` is the post id. Walk up until `e` parent is the post (root comment under post).
 * @param {import('nostr-tools').NostrEvent} ev
 * @param {string} forumPostId
 * @param {Map<string, import('nostr-tools').NostrEvent>} commentMap
 * @param {null | ((id: string) => Promise<import('nostr-tools').NostrEvent | null>)} fetchEvent
 * @returns {Promise<string>}
 */
export async function resolveForumDiscussionRootCommentId(ev, forumPostId, commentMap, fetchEvent = null) {
	const postLower = forumPostId.toLowerCase();
	let current = ev;
	const seen = new Set();
	for (;;) {
		if (seen.has(current.id)) return ev.id;
		seen.add(current.id);
		const p = getCommentParentEventId(current);
		if (!p || p === postLower) return current.id;
		const il = p.toLowerCase();
		let parent = commentMap.get(il) ?? commentMap.get(p);
		if (!parent && fetchEvent) {
			const fetched = await fetchEvent(p);
			if (fetched) {
				commentMap.set(fetched.id.toLowerCase(), fetched);
				parent = fetched;
			}
		}
		if (!parent) return current.id;
		current = parent;
	}
}

/**
 * All descendants of rootId (including root) by NIP-22 `e` parent links.
 * @param {string} rootId
 * @param {import('nostr-tools').NostrEvent[]} events
 * @returns {import('nostr-tools').NostrEvent[]}
 */
export function collectCommentSubtree(rootId, events) {
	const rootLower = rootId.toLowerCase();
	const byId = new Map();
	for (const e of events) {
		byId.set(e.id.toLowerCase(), e);
	}
	const out = new Map();
	function walk(idl) {
		if (out.has(idl)) return;
		const ev = byId.get(idl);
		if (!ev) return;
		out.set(idl, ev);
		for (const e of events) {
			const p = getCommentParentEventId(e);
			if (p && p.toLowerCase() === idl) {
				walk(e.id.toLowerCase());
			}
		}
	}
	walk(rootLower);
	return Array.from(out.values());
}
