/**
 * Collect thread items under a zap receipt (kind 9735) from pooled events.
 */
import { EVENT_KINDS } from '$lib/config.js';
import { parseZapReceipt } from './service.js';
import { getCommentParentEventId } from './thread-discussion.js';

/**
 * Walk up kind-1111 parent chain (`e` tag). If any direct parent is a zap receipt (9735), return it.
 * Used when opening a thread from inbox/activity: comments under a zap must use the zap modal, not the app/forum root.
 *
 * @param {import('nostr-tools').NostrEvent} commentEv
 * @param {Map<string, import('nostr-tools').NostrEvent>} commentMap — ids keyed lower + original
 * @param {Map<string, import('nostr-tools').NostrEvent>} zapMap — zap receipts by id
 * @param {null | ((id: string) => Promise<import('nostr-tools').NostrEvent | null>)} fetchEvent
 * @returns {Promise<import('nostr-tools').NostrEvent | null>}
 */
export async function findEnclosingZapReceiptForComment(commentEv, commentMap, zapMap, fetchEvent = null) {
	let current = commentEv;
	const seen = new Set();

	function getComment(id) {
		const il = id.toLowerCase();
		return commentMap.get(il) ?? commentMap.get(id);
	}

	function getZap(id) {
		const il = id.toLowerCase();
		return zapMap.get(il) ?? zapMap.get(id);
	}

	for (;;) {
		if (seen.has(current.id)) return null;
		seen.add(current.id);

		const p = getCommentParentEventId(current);
		if (!p) return null;

		let z = getZap(p);
		if (!z && fetchEvent) {
			const fetched = await fetchEvent(p);
			if (fetched?.kind === EVENT_KINDS.ZAP_RECEIPT) z = fetched;
		}
		if (z?.kind === EVENT_KINDS.ZAP_RECEIPT) return z;

		let next = getComment(p);
		if (!next && fetchEvent) {
			const fetched = await fetchEvent(p);
			if (fetched?.kind === EVENT_KINDS.COMMENT) {
				commentMap.set(fetched.id.toLowerCase(), fetched);
				next = fetched;
			}
		}
		if (!next) return null;
		current = next;
	}
}

/**
 * All kind 1111 events whose reply chain originates at `parentId` (zap id or comment id).
 * @param {string} parentIdLower
 * @param {import('nostr-tools').NostrEvent[]} pool
 * @returns {import('nostr-tools').NostrEvent[]}
 */
export function collectCommentsUnderParent(parentIdLower, pool) {
	const root = parentIdLower.toLowerCase();
	const byParent = new Map();
	for (const c of pool) {
		const p = getCommentParentEventId(c);
		if (!p) continue;
		const pl = p.toLowerCase();
		if (!byParent.has(pl)) byParent.set(pl, []);
		byParent.get(pl).push(c);
	}
	const out = [];
	const queue = [root];
	const seen = new Set();
	while (queue.length) {
		const pid = queue.shift();
		const kids = byParent.get(pid) ?? [];
		for (const c of kids) {
			const idl = c.id.toLowerCase();
			if (seen.has(idl)) continue;
			seen.add(idl);
			out.push(c);
			queue.push(idl);
		}
	}
	return out;
}

/**
 * Zap receipts that zap `rootZapId` or any descendant zap in the same pool.
 * @param {string} rootZapIdLower
 * @param {import('nostr-tools').NostrEvent[]} pool
 * @returns {import('nostr-tools').NostrEvent[]}
 */
export function collectZapReceiptsUnderZap(rootZapIdLower, pool) {
	const root = rootZapIdLower.toLowerCase();
	const byZapped = new Map();
	for (const ev of pool) {
		const z = parseZapReceipt(ev);
		const p = z.zappedEventId?.toLowerCase();
		if (!p) continue;
		if (!byZapped.has(p)) byZapped.set(p, []);
		byZapped.get(p).push(ev);
	}
	const out = [];
	const queue = [root];
	const seen = new Set();
	while (queue.length) {
		const pid = queue.shift();
		const kids = byZapped.get(pid) ?? [];
		for (const ev of kids) {
			const idl = ev.id.toLowerCase();
			if (seen.has(idl)) continue;
			seen.add(idl);
			out.push(ev);
			queue.push(idl);
		}
	}
	return out;
}
