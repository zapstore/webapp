/**
 * Batch resolution of activity-feed root events (apps, stacks, forum posts).
 * Dexie-first, relay backfill for misses — shared by community Activity and profile Activity.
 */
import { nip19 } from 'nostr-tools';
import { EVENT_KINDS, SAVED_APPS_STACK_D_TAG, ZAPSTORE_RELAY } from '$lib/config.js';
import { parseApp, parseAppStack } from '$lib/nostr/models.js';
import { queryEvents } from '../storage/dexie.js';
import { fetchFromRelays } from '../sync/service.js';

export const ACTIVITY_ROOT_RELAYS = [ZAPSTORE_RELAY];
export const ACTIVITY_IDS_CHUNK = 80;
export const ACTIVITY_ADDR_D_CHUNK = 45;
export const ACTIVITY_ROOT_MISSING_AFTER_MS = 14_000;

/**
 * @template T
 * @param {T[]} arr
 * @param {number} size
 */
export function chunkArray(arr, size) {
	/** @type {T[][]} */
	const out = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}

/** Prefer `A` then `a` on kind 1111. */
export function addrTagFromComment(/** @type {import('nostr-tools').NostrEvent} */ ev) {
	return (
		ev.tags?.find((t) => t[0] === 'A' && t[1])?.[1] ??
		ev.tags?.find((t) => t[0] === 'a' && t[1])?.[1] ??
		null
	);
}

/** @param {string | null | undefined} a */
export function isAddressableActivityATag(a) {
	if (!a) return false;
	return a.startsWith(`${EVENT_KINDS.APP}:`) || a.startsWith(`${EVENT_KINDS.APP_STACK}:`);
}

/**
 * NIP-33 address: `<kind>:<64-hex-pubkey>:<d-tag>`.
 * @param {string | null | undefined} a
 */
export function parseActivityNip33ATag(a) {
	if (!a || typeof a !== 'string') return null;
	const m = a.match(/^(\d+):([0-9a-fA-F]{64}):(.*)$/);
	if (!m) return null;
	const kind = parseInt(m[1], 10);
	if (kind !== EVENT_KINDS.APP && kind !== EVENT_KINDS.APP_STACK) return null;
	return { kind, pubkey: m[2], dTag: m[3] };
}

/**
 * @param {import('nostr-tools').NostrEvent} ev
 * @returns {{ key: string, kind: 'forum' | 'app' | 'stack' } | null}
 */
export function activityRootKeyMetaFromComment(ev) {
	const addr = addrTagFromComment(ev);
	const eRoot = ev.tags?.find((t) => t[0] === 'E' && t[1])?.[1];
	if (isAddressableActivityATag(addr)) {
		const kind = addr.startsWith(`${EVENT_KINDS.APP_STACK}:`) ? 'stack' : 'app';
		return { key: `a:${addr}`, kind };
	}
	if (eRoot) return { key: `e:${eRoot.toLowerCase()}`, kind: 'forum' };
	return null;
}

/**
 * Batch-resolve app/stack roots (Dexie only).
 * @param {import('nostr-tools').NostrEvent[]} comments
 * @param {Map<string, import('nostr-tools').NostrEvent>} addrRootByATag
 */
export async function batchResolveAddrRootsFromDexie(comments, addrRootByATag) {
	/** @type {Map<string, { kind: number, pubkey: string, dTag: string }[]>} */
	const byAuthorKind = new Map();
	for (const c of comments) {
		const raw = addrTagFromComment(c);
		if (!isAddressableActivityATag(raw)) continue;
		if (addrRootByATag.has(raw)) continue;
		const p = parseActivityNip33ATag(raw);
		if (!p) continue;
		const gk = `${p.kind}:${p.pubkey}`;
		if (!byAuthorKind.has(gk)) byAuthorKind.set(gk, []);
		byAuthorKind.get(gk).push(p);
	}
	for (const [gk, rows] of byAuthorKind) {
		const [kindStr, pubkey] = gk.split(':');
		const kind = parseInt(kindStr, 10);
		const uniqueD = [...new Set(rows.map((r) => r.dTag).filter(Boolean))];
		for (const dChunk of chunkArray(uniqueD, ACTIVITY_ADDR_D_CHUNK)) {
			if (dChunk.length === 0) continue;
			const evs = await queryEvents({
				kinds: [kind],
				authors: [pubkey],
				'#d': dChunk,
				limit: Math.max(dChunk.length, 80)
			});
			for (const ev of evs) {
				const d = ev.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
				if (!d) continue;
				if (ev.kind === EVENT_KINDS.APP_STACK && d === SAVED_APPS_STACK_D_TAG) continue;
				addrRootByATag.set(`${ev.kind}:${ev.pubkey}:${d}`, ev);
			}
		}
	}
}

/**
 * Forum kind-11 roots: batch Dexie lookup by uppercase `E` tag (NIP-22 root id).
 * @param {import('nostr-tools').NostrEvent[]} comments
 */
export async function batchResolveForumRootsByIdFromDexie(comments) {
	/** @type {Map<string, import('nostr-tools').NostrEvent>} */
	const forumRootById = new Map();
	const pending = new Set();
	for (const c of comments) {
		const id = c.tags?.find((t) => t[0] === 'E' && t[1])?.[1];
		if (id) pending.add(id.toLowerCase());
	}
	if (pending.size === 0) return forumRootById;
	for (const chunk of chunkArray([...pending], ACTIVITY_IDS_CHUNK)) {
		const evs = await queryEvents({ ids: chunk, limit: chunk.length });
		for (const ev of evs) {
			if (ev?.id && ev.kind === EVENT_KINDS.FORUM_POST) {
				forumRootById.set(ev.id, ev);
				forumRootById.set(ev.id.toLowerCase(), ev);
			}
		}
	}
	return forumRootById;
}

/**
 * One relay round-trip per (kind, pubkey), chunked `#d`.
 * @param {string[]} aTags
 * @param {string[]} [relays]
 */
export async function relayFetchAddrRootEventsByATags(aTags, relays = ACTIVITY_ROOT_RELAYS) {
	const uniq = [...new Set(aTags.filter(Boolean))];
	/** @type {Map<string, Map<string, string>>} */
	const dToFullA = new Map();
	for (const a of uniq) {
		const p = parseActivityNip33ATag(a);
		if (!p) continue;
		const gk = `${p.kind}:${p.pubkey}`;
		if (!dToFullA.has(gk)) dToFullA.set(gk, new Map());
		dToFullA.get(gk).set(p.dTag, a);
	}
	/** @type {Promise<unknown>[]} */
	const fetches = [];
	for (const [gk, dMap] of dToFullA) {
		const [kindStr, pubkey] = gk.split(':');
		const kind = parseInt(kindStr, 10);
		const dTags = [...dMap.keys()];
		for (const dChunk of chunkArray(dTags, ACTIVITY_ADDR_D_CHUNK)) {
			if (dChunk.length === 0) continue;
			fetches.push(
				fetchFromRelays(
					relays,
					{
						kinds: [kind],
						authors: [pubkey],
						'#d': dChunk,
						limit: Math.max(100, dChunk.length)
					},
					{ timeout: 8000, feature: 'activity-relay-addr-d', immediateFlush: true }
				).catch(() => [])
			);
		}
	}
	await Promise.all(fetches);
}

/**
 * Batch-fetch forum posts by id; results are written to Dexie by fetchFromRelays.
 * @param {string[]} ids
 * @param {string[]} [relays]
 */
export async function relayFetchForumRootEventsByIds(ids, relays = ACTIVITY_ROOT_RELAYS) {
	const uniq = [...new Set(ids.filter(Boolean))];
	for (const chunk of chunkArray(uniq, ACTIVITY_IDS_CHUNK)) {
		if (chunk.length === 0) continue;
		await fetchFromRelays(
			relays,
			{ ids: chunk, limit: chunk.length },
			{ timeout: 5000, feature: 'activity-relay-forum-ids', immediateFlush: true }
		).catch(() => []);
	}
}

/**
 * @param {Map<string, import('nostr-tools').NostrEvent>} addrRootByATag
 * @param {Map<string, import('nostr-tools').NostrEvent>} forumRootById
 */
export function buildActivityRootLookupMaps(addrRootByATag, forumRootById) {
	/** @type {Map<string, import('nostr-tools').NostrEvent>} */
	const rootEventByKey = new Map();
	/** @type {Map<string, { icon?: string|null, name: string, identifier: string, isStack: boolean, href: string|null }>} */
	const rootInfoByATag = new Map();

	for (const [aTag, rawEvent] of addrRootByATag) {
		rootEventByKey.set(aTag, rawEvent);
		if (rawEvent.kind === EVENT_KINDS.APP) {
			const app = parseApp(rawEvent);
			if (app.pubkey && app.dTag) {
				let href = null;
				try {
					href = `/apps/${nip19.naddrEncode({ kind: EVENT_KINDS.APP, pubkey: app.pubkey, identifier: app.dTag })}`;
				} catch {
					href = `/apps/${app.dTag}`;
				}
				rootInfoByATag.set(aTag, {
					icon: app.icon ?? null,
					name: app.name || app.dTag || '',
					identifier: app.dTag,
					isStack: false,
					href
				});
			}
		} else if (rawEvent.kind === EVENT_KINDS.APP_STACK) {
			const stack = parseAppStack(rawEvent);
			if (stack.pubkey && stack.dTag) {
				let href = null;
				try {
					href = `/stacks/${nip19.naddrEncode({ kind: EVENT_KINDS.APP_STACK, pubkey: stack.pubkey, identifier: stack.dTag })}`;
				} catch {
					/* ignore */
				}
				rootInfoByATag.set(aTag, {
					icon: stack.image ?? null,
					name: stack.title || stack.dTag || '',
					identifier: stack.dTag,
					isStack: true,
					href
				});
			}
		}
	}

	for (const ev of forumRootById.values()) {
		if (!ev?.id) continue;
		rootEventByKey.set(ev.id, ev);
		rootEventByKey.set(ev.id.toLowerCase(), ev);
	}

	return { rootEventByKey, rootInfoByATag };
}

/**
 * Roots still missing after `missingAfterMs` — show "not found" instead of empty forum emoji.
 * @param {{
 *   comments: import('nostr-tools').NostrEvent[],
 *   rootEventByKey: Map<string, import('nostr-tools').NostrEvent>,
 *   addrRootByATag: Map<string, import('nostr-tools').NostrEvent>,
 *   waitSince: Map<string, number>,
 *   readyForDeletedTimer: boolean,
 *   missingAfterMs?: number
 * }} ctx
 */
export function computeActivityRootDeletedByKey(ctx) {
	const {
		comments,
		rootEventByKey,
		addrRootByATag,
		waitSince,
		readyForDeletedTimer,
		missingAfterMs = ACTIVITY_ROOT_MISSING_AFTER_MS
	} = ctx;
	const now = Date.now();
	/** @type {Map<string, 'forum' | 'app' | 'stack'>} */
	const needed = new Map();

	for (const c of comments) {
		const meta = activityRootKeyMetaFromComment(c);
		if (!meta) continue;
		const resolved = meta.key.startsWith('a:')
			? addrRootByATag.has(meta.key.slice(2))
			: !!(
					rootEventByKey.get(meta.key.slice(2)) ??
					rootEventByKey.get(meta.key.slice(2).toLowerCase())
				);
		if (resolved) {
			waitSince.delete(meta.key);
			continue;
		}
		needed.set(meta.key, meta.kind);
		if (!waitSince.has(meta.key)) {
			if (!readyForDeletedTimer) continue;
			waitSince.set(meta.key, now);
		}
	}
	for (const k of [...waitSince.keys()]) {
		if (!needed.has(k)) waitSince.delete(k);
	}
	/** @type {Map<string, 'forum' | 'app' | 'stack'>} */
	const out = new Map();
	for (const [k, kind] of needed) {
		const since = waitSince.get(k) ?? now;
		if (now - since >= missingAfterMs) out.set(k, kind);
	}
	return out;
}

/**
 * Dexie batch resolve for a comment slice; returns lookup maps for UI.
 * @param {import('nostr-tools').NostrEvent[]} comments
 */
export async function resolveActivityRootsFromDexie(comments) {
	const addrRootByATag = new Map();
	await batchResolveAddrRootsFromDexie(comments, addrRootByATag);
	const forumRootById = await batchResolveForumRootsByIdFromDexie(comments);
	return buildActivityRootLookupMaps(addrRootByATag, forumRootById);
}

/**
 * Collect addressable a-tags and forum E-root ids still missing from maps.
 * @param {import('nostr-tools').NostrEvent[]} comments
 * @param {Map<string, import('nostr-tools').NostrEvent>} addrRootByATag
 * @param {Map<string, import('nostr-tools').NostrEvent>} rootEventByKey
 */
export function collectMissingActivityRootRefs(comments, addrRootByATag, rootEventByKey) {
	/** @type {string[]} */
	const missingAddr = [];
	/** @type {string[]} */
	const missingForumIds = [];
	const seenAddr = new Set();
	const seenForum = new Set();

	for (const c of comments) {
		const addr = addrTagFromComment(c);
		if (isAddressableActivityATag(addr) && !addrRootByATag.has(addr) && !seenAddr.has(addr)) {
			seenAddr.add(addr);
			missingAddr.push(addr);
		}
		const eRoot = c.tags?.find((t) => t[0] === 'E' && t[1])?.[1];
		if (eRoot) {
			const low = eRoot.toLowerCase();
			if (
				!rootEventByKey.get(eRoot) &&
				!rootEventByKey.get(low) &&
				!seenForum.has(low)
			) {
				seenForum.add(low);
				missingForumIds.push(eRoot);
			}
		}
	}
	return { missingAddr, missingForumIds };
}
