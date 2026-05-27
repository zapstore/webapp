/**
 * In-memory LRU comment composer drafts (max 21). Cleared on publish; oldest evicted at cap.
 */

const MAX_DRAFTS = 21;

/** @type {Map<string, { json: object, updatedAt: number }>} */
const drafts = new Map();

/**
 * @param {string | null | undefined} contentType
 * @param {{ pubkey?: string, dTag?: string, id?: string, communityPubkey?: string } | null | undefined} target
 */
export function catalogCommentDraftKey(contentType, target) {
	if (!target) return null;
	const type = String(contentType ?? '').trim();
	if (type === 'forum') {
		const id = String(target.id ?? '').trim().toLowerCase();
		if (!id) return null;
		const h = String(target.communityPubkey ?? '').trim().toLowerCase();
		return h ? `forum:${id}:${h}` : `forum:${id}`;
	}
	const pk = String(target.pubkey ?? '')
		.trim()
		.toLowerCase();
	const dTag = String(target.dTag ?? '').trim();
	if (!pk || !dTag) return null;
	return `${type}:${pk}:${dTag}`;
}

/**
 * @param {string | null | undefined} rootEventId
 * @param {string | null | undefined} [parentId]
 */
export function threadCommentDraftKey(rootEventId, parentId = null) {
	const root = String(rootEventId ?? '')
		.trim()
		.toLowerCase();
	if (!root) return null;
	const parent = parentId
		? String(parentId).trim().toLowerCase()
		: 'root';
	return `thread:${root}:${parent}`;
}

/** @param {string | null | undefined} key */
export function getCommentDraft(key) {
	if (!key) return null;
	return drafts.get(key) ?? null;
}

/** @param {string | null | undefined} key @param {object | null | undefined} json */
export function saveCommentDraft(key, json) {
	if (!key || !json) return;
	if (drafts.has(key)) drafts.delete(key);
	drafts.set(key, { json, updatedAt: Date.now() });
	while (drafts.size > MAX_DRAFTS) {
		const oldest = drafts.keys().next().value;
		if (oldest === undefined) break;
		drafts.delete(oldest);
	}
}

/** @param {string | null | undefined} key */
export function clearCommentDraft(key) {
	if (key) drafts.delete(key);
}
