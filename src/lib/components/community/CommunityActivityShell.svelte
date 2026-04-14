<script lang="js">
	/**
	 * Activity: local-first from Dexie. Relay `since` is unified: {@link activityRelaySince} →
	 * `commentZapRelayReadSince()` for bulk 1111/9735 seed and for {@link backfillActivityThreadsScoped}
	 * (comments + zaps by thread refs, not zaps-only).
	 * Zaps are filtered to the same scope as NIP-22 comments, then merged with comments into **one**
	 * newest-first timeline; a single visible row limit preserves true chronological order (no separate
	 * comment vs zap slice). Scroll sentinel extends the window; no “load more” button.
	 */
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { nip19 } from 'nostr-tools';
	import {
		db,
		fetchFromRelays,
		fetchKind1111ByTagRef,
		fetchKind1111ReferencingEventIds,
		fetchKind9735MatchingRefs,
		fetchProfilesBatch,
		putEvents,
		queryEvents,
		queryEvent,
		liveQuery,
		parseComment,
		parseZapReceipt,
		publishComment
	} from '$lib/nostr';
	import {
		resolveForumDiscussionRootCommentId,
		resolveAppDiscussionRootCommentId,
		collectCommentSubtree,
		walkAppDiscussionRootInMap
	} from '$lib/nostr/thread-discussion.js';
	import {
		collectCommentsUnderParent,
		collectZapReceiptsUnderZap,
		findEnclosingZapReceiptForComment
	} from '$lib/nostr/zap-thread.js';
	import { parseProfile, parseApp, parseAppStack, parseForumPost, getEventOneliner } from '$lib/nostr/models';
	import {
		EVENT_KINDS,
		SAVED_APPS_STACK_D_TAG,
		DEFAULT_CATALOG_RELAYS,
		COMMENT_PUBLISH_RELAYS,
		commentZapRelayReadSince,
		ZAPSTORE_COMMUNITY_PUBKEY,
		ZAPSTORE_RELAY
	} from '$lib/config';
	import { goto } from '$app/navigation';
	import { setCached } from '$lib/stores/query-cache.js';
	import CommentCard from '$lib/components/community/CommentCard.svelte';
	import ZapActivityCard from '$lib/components/community/ZapActivityCard.svelte';
	import RootComment from '$lib/components/social/RootComment.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import ActivityFeedSkeleton from '$lib/components/community/ActivityFeedSkeleton.svelte';
	import { signEvent, getCurrentPubkey } from '$lib/stores/auth.svelte.js';
	import { createSearchProfilesFunction } from '$lib/services/profile-search.js';
	import { createSearchEmojisFunction } from '$lib/services/emoji-search.js';
	import { isOnline } from '$lib/stores/online.svelte.js';
	import {
		markInboxEventsSeen,
		isInboxEventUnread,
		inboxSeenSignal
	} from '$lib/stores/user-inbox-seen.svelte.js';

	const ACTIVITY_CATALOG_RELAYS = [...DEFAULT_CATALOG_RELAYS];

	/** Embedded header inbox: #p-filtered feed + same thread modals as Activity. */
	let {
		inboxUserPubkey = null,
		inboxEmbed = false,
		inboxActive = true,
		/** Called when user taps "Mark All as Read"; parent can use this to update UI. */
		onMarkAllRead = null
	} = $props();

	/** Re-seed when user opens Activity (shell can stay mounted while they use Forum). */
	const activityRouteActive = $derived(
		$page.url.pathname === '/community/activity' ||
			$page.url.pathname.startsWith('/community/activity/')
	);

	/** Single cap for merged comment+zap timeline rows (scroll loads more; same window for relay backfill scan). */
	let activityFeedVisibleLimit = $state(400);
	const ACTIVITY_FEED_VISIBLE_MAX = 2500;
	/** `queryEvents({ ids })` batch size — avoid huge `anyOf` lists. */
	const ACTIVITY_IDS_CHUNK = 80;
	/** Batch `authors` + `#d` addr-root lookups (Dexie + relay). */
	const ACTIVITY_ADDR_D_CHUNK = 45;
	/**
	 * Same `since` as live subs + other comment/zap reads (`COMMENT_ZAP_RELAY_READ_LOOKBACK_SEC`).
	 * Kind 1111/9735 never use `#f` — only catalog app/stack roots do (`PLATFORM_FILTER`).
	 */
	/** Safety cap for bulk 1111/9735 one-shots (`nak req` shows Zapstore usually answers quickly). */
	const ACTIVITY_BULK_RELAY_TIMEOUT_MS = 45_000;
	/** Keep first seed lighter; deeper history arrives via scoped backfill + scroll extension. */
	const ACTIVITY_INITIAL_SEED_LIMIT = 220;
	/**
	 * After Dexie + relay root fetch (~4s) still no root event — treat as likely deleted; show label, don't block feed.
	 */
	const ACTIVITY_ROOT_MISSING_AFTER_MS = 6500;

	/** NIP-22 `K` tag values for Activity scope (forum + catalog app + stack threads). */
	const ACTIVITY_NIP22_K_TAGS = [
		String(EVENT_KINDS.FORUM_POST),
		String(EVENT_KINDS.APP),
		String(EVENT_KINDS.APP_STACK)
	];

	function activityRelaySince() {
		return commentZapRelayReadSince();
	}

	/** Comments only — NIP-22 `K` for forum / app / stack threads. */
	function eventMatchesActivityNip22KComment(ev) {
		const k = ev.tags?.find((t) => t[0] === 'K')?.[1];
		return (
			k === ACTIVITY_NIP22_K_TAGS[0] ||
			k === ACTIVITY_NIP22_K_TAGS[1] ||
			k === ACTIVITY_NIP22_K_TAGS[2]
		);
	}

	/**
	 * @param {unknown[]} arr
	 * @param {number} size
	 */
	function chunkArray(arr, size) {
		const out = [];
		for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
		return out;
	}

	/**
	 * NIP-33 address: `<kind>:<64-hex-pubkey>:<d-tag>`.
	 * @param {string | null | undefined} a
	 * @returns {{ kind: number, pubkey: string, dTag: string } | null}
	 */
	function parseActivityNip33ATag(a) {
		if (!a || typeof a !== 'string') return null;
		const m = a.match(/^(\d+):([0-9a-fA-F]{64}):(.*)$/);
		if (!m) return null;
		const kind = parseInt(m[1], 10);
		if (kind !== EVENT_KINDS.APP && kind !== EVENT_KINDS.APP_STACK) return null;
		return { kind, pubkey: m[2], dTag: m[3] };
	}

	/** Prefer `A` then `a` on kind 1111. */
	function addrTagFromComment(/** @type {import('nostr-tools').NostrEvent} */ ev) {
		return (
			ev.tags?.find((t) => t[0] === 'A' && t[1])?.[1] ??
			ev.tags?.find((t) => t[0] === 'a' && t[1])?.[1] ??
			null
		);
	}

	/**
	 * Batch-resolve app/stack roots for comments (Dexie only — no network inside liveQuery).
	 * @param {import('nostr-tools').NostrEvent[]} comments
	 * @param {Map<string, import('nostr-tools').NostrEvent>} addrRootByATag
	 */
	async function batchResolveAddrRootsFromDexie(comments, addrRootByATag) {
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
	 * Forum kind-11 roots: batch `ids` in Dexie, multi-wave (zap may point at post or comment → `E`).
	 * @param {import('nostr-tools').NostrEvent[]} comments
	 * @param {import('nostr-tools').NostrEvent[]} zaps
	 */
	async function batchResolveForumRootsByIdFromDexie(comments, zaps) {
		/** @type {Map<string, import('nostr-tools').NostrEvent>} */
		const forumRootById = new Map();
		function putForum(ev) {
			if (!ev?.id || ev.kind !== EVENT_KINDS.FORUM_POST) return;
			forumRootById.set(ev.id, ev);
			forumRootById.set(ev.id.toLowerCase(), ev);
		}
		/** @type {Set<string>} */
		const pending = new Set();
		for (const c of comments) {
			const id = c.tags?.find((t) => t[0] === 'E' && t[1])?.[1];
			if (id) pending.add(id.toLowerCase());
		}
		for (const z of zaps) {
			try {
				const p = parseZapReceipt(z);
				if (p?.zappedEventId) pending.add(p.zappedEventId.toLowerCase());
			} catch {
				/* skip */
			}
		}
		const seen = new Set();
		let depth = 0;
		while (pending.size > 0 && depth < 10) {
			depth++;
			const batch = [...pending].filter((id) => !seen.has(id));
			for (const id of batch) seen.add(id);
			if (batch.length === 0) break;
			const next = new Set();
			for (const chunk of chunkArray(batch, ACTIVITY_IDS_CHUNK)) {
				const evs = await queryEvents({ ids: chunk, limit: chunk.length });
				for (const ev of evs) {
					if (!ev?.id) continue;
					if (ev.kind === EVENT_KINDS.FORUM_POST) putForum(ev);
					else if (ev.kind === EVENT_KINDS.COMMENT) {
						const er = ev.tags?.find((t) => t[0] === 'E' && t[1])?.[1];
						if (er) {
							const lr = er.toLowerCase();
							if (!seen.has(lr)) next.add(lr);
						}
					}
				}
			}
			pending.clear();
			for (const id of next) pending.add(id);
		}
		return forumRootById;
	}

	/**
	 * One relay round-trip per (kind, pubkey), chunked `#d` — no N+1 per comment.
	 * All chunks run in parallel (no sequential await).
	 * No `since` filter: app/stack events are replaceable — the relay returns the latest
	 * version regardless of when it was created. A `since` cutoff silently drops apps
	 * that haven't been updated recently.
	 * @param {string[]} aTags
	 */
	async function relayFetchAddrRootEventsByATags(aTags) {
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
						ACTIVITY_CATALOG_RELAYS,
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

	function appBadgeFromAddrRoot(/** @type {import('nostr-tools').NostrEvent | null} */ ev) {
		if (!ev) return null;
		if (ev.kind === EVENT_KINDS.APP) {
			const p = parseApp(ev);
			return { iconUrl: p.icon ?? null, name: p.name, identifier: p.dTag };
		}
		if (ev.kind === EVENT_KINDS.APP_STACK) {
			const p = parseAppStack(ev);
			return { iconUrl: p.image ?? null, name: p.title, identifier: p.dTag };
		}
		return null;
	}

	function appATagFromZapEvent(/** @type {import('nostr-tools').NostrEvent | null} */ ev) {
		return (
			ev?.tags?.find((t) => t[0] === 'A' && t[1])?.[1] ??
			ev?.tags?.find((t) => t[0] === 'a' && t[1])?.[1] ??
			null
		);
	}

	function isAddressableActivityATag(/** @type {string | null} */ a) {
		if (!a) return false;
		return a.startsWith(`${EVENT_KINDS.APP}:`) || a.startsWith(`${EVENT_KINDS.APP_STACK}:`);
	}

	/** First-seen time per root key while event still missing (not reactive UI state). */
	/** @type {Map<string, number>} */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- module-local timer bookkeeping
	const activityRootWaitSince = new Map();

	/**
	 * @param {import('nostr-tools').NostrEvent} ev
	 * @returns {{ key: string, kind: 'forum' | 'app' | 'stack' } | null}
	 */
	function activityRootKeyMetaFromComment(ev) {
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
	 * @param {import('nostr-tools').NostrEvent} zapEv
	 * @param {ReturnType<typeof parseZapReceipt>} parsed
	 * @param {Map<string, import('nostr-tools').NostrEvent>} roots
	 * @param {Map<string, import('nostr-tools').NostrEvent>} commentMap
	 */
	function activityRootKeyMetaFromZap(zapEv, parsed, roots, commentMap) {
		const aZap = addrATagForAppStackZap(zapEv, parsed);
		if (aZap && isAddressableActivityATag(aZap)) {
			const kind = aZap.startsWith(`${EVENT_KINDS.APP_STACK}:`) ? 'stack' : 'app';
			return { key: `a:${aZap}`, kind };
		}
		const postId = resolveForumPostIdForZapActivity(parsed, roots, commentMap);
		if (postId) return { key: `e:${postId.toLowerCase()}`, kind: 'forum' };
		return null;
	}

	/**
	 * @param {ReturnType<typeof parseZapReceipt>} parsed
	 * @param {Map<string, import('nostr-tools').NostrEvent>} roots
	 * @param {Map<string, import('nostr-tools').NostrEvent>} commentMap
	 */
	function resolveForumPostIdForZapActivity(parsed, roots, commentMap) {
		const zid = parsed?.zappedEventId;
		if (!zid) return null;
		if (roots.has(zid) || roots.has(zid.toLowerCase())) return zid;
		const c = commentMap.get(zid) ?? commentMap.get(zid.toLowerCase());
		if (c) return c.tags?.find((t) => t[0] === 'E' && t[1])?.[1] ?? null;
		return zid;
	}

	/**
	 * @param {Map<string, import('nostr-tools').NostrEvent>} roots
	 * @param {Map<string, import('nostr-tools').NostrEvent>} addrRoots
	 * @param {import('nostr-tools').NostrEvent[]} comments
	 * @param {{ event: import('nostr-tools').NostrEvent, parsed: ReturnType<typeof parseZapReceipt> }[]} zapsForFeed
	 * @param {Map<string, import('nostr-tools').NostrEvent>} commentMap
	 * @param {boolean} readyForDeletedTimer - true once the initial relay seed has finished (or inbox load has settled); prevents showing "not found" before we've had a chance to load data
	 */
	function recomputeActivityRootDeleted(
		roots,
		addrRoots,
		comments,
		zapsForFeed,
		commentMap,
		readyForDeletedTimer
	) {
		const now = Date.now();
		/** @type {Map<string, 'forum' | 'app' | 'stack'>} */
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- ephemeral merge set
		const needed = new Map();
		for (const c of comments) {
			const meta = activityRootKeyMetaFromComment(c);
			if (!meta) continue;
			const resolved = meta.key.startsWith('a:')
				? addrRoots.has(meta.key.slice(2))
				: !!(roots.get(meta.key.slice(2)) || roots.get(meta.key.slice(2).toLowerCase()));
			if (resolved) {
				activityRootWaitSince.delete(meta.key);
				continue;
			}
			needed.set(meta.key, meta.kind);
			if (!activityRootWaitSince.has(meta.key)) {
				if (!readyForDeletedTimer) continue;
				activityRootWaitSince.set(meta.key, now);
			}
		}
		for (const row of zapsForFeed) {
			const meta = activityRootKeyMetaFromZap(row.event, row.parsed, roots, commentMap);
			if (!meta) continue;
			const resolved = meta.key.startsWith('a:')
				? addrRoots.has(meta.key.slice(2))
				: !!(roots.get(meta.key.slice(2)) || roots.get(meta.key.slice(2).toLowerCase()));
			if (resolved) {
				activityRootWaitSince.delete(meta.key);
				continue;
			}
			needed.set(meta.key, meta.kind);
			if (!activityRootWaitSince.has(meta.key)) {
				if (!readyForDeletedTimer) continue;
				activityRootWaitSince.set(meta.key, now);
			}
		}
		for (const k of [...activityRootWaitSince.keys()]) {
			if (!needed.has(k)) activityRootWaitSince.delete(k);
		}
		/** @type {Map<string, 'forum' | 'app' | 'stack'>} */
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- ephemeral result
		const out = new Map();
		for (const [k, kind] of needed) {
			const since = activityRootWaitSince.get(k) ?? now;
			if (now - since >= ACTIVITY_ROOT_MISSING_AFTER_MS) out.set(k, kind);
		}
		return out;
	}

	/**
	 * Event ids tied to activity comments + addressable `a`/`A` values on those comments (for matching zaps).
	 * @param {import('nostr-tools').NostrEvent[]} comments
	 */
	function buildActivityZapMatchSets(comments) {
		/** @type {Set<string>} */
		const refIds = new Set();
		/** @type {Set<string>} */
		const aTags = new Set();
		for (const c of comments) {
			if (!c?.id) continue;
			refIds.add(c.id.toLowerCase());
			for (const t of c.tags ?? []) {
				const v = t[1];
				if (!v) continue;
				const lower = String(v).toLowerCase();
				if (t[0] === 'E' || t[0] === 'e') refIds.add(lower);
				if ((t[0] === 'A' || t[0] === 'a') && isAddressableActivityATag(v)) {
					aTags.add(lower);
				}
			}
		}
		return { refIds, aTags };
	}

	/**
	 * Zap belongs in Activity if it ties to the same NIP-22 graph as scoped comments.
	 * Scan all e/E/a/A on the receipt (not only parseZapReceipt’s primary e) — many clients differ.
	 * @param {import('nostr-tools').NostrEvent} ev
	 * @param {Set<string>} refIds
	 * @param {Set<string>} aTags
	 */
	function eventMatchesActivityZap(ev, refIds, aTags) {
		const k = ev.tags?.find((t) => t[0] === 'K')?.[1];
		if (
			k === ACTIVITY_NIP22_K_TAGS[0] ||
			k === ACTIVITY_NIP22_K_TAGS[1] ||
			k === ACTIVITY_NIP22_K_TAGS[2]
		) {
			return true;
		}
		for (const t of ev.tags ?? []) {
			const name = t[0];
			const val = t[1];
			if (!val) continue;
			const low = String(val).toLowerCase();
			if ((name === 'e' || name === 'E') && refIds.has(low)) return true;
			if (
				(name === 'a' || name === 'A') &&
				isAddressableActivityATag(val) &&
				aTags.has(low)
			) {
				return true;
			}
		}
		let p;
		try {
			p = parseZapReceipt(ev);
		} catch {
			return false;
		}
		if (p.zappedEventId && refIds.has(String(p.zappedEventId).toLowerCase())) return true;
		const addrRaw = appATagFromZapEvent(ev);
		return !!(addrRaw && aTags.has(addrRaw.toLowerCase()));
	}

	/** NIP-22 `K` on receipt — same scope as comments (forum / app / stack). */
	function zapHasActivityNip22K(/** @type {import('nostr-tools').NostrEvent} */ ev) {
		const k = ev.tags?.find((t) => t[0] === 'K')?.[1];
		return (
			k === ACTIVITY_NIP22_K_TAGS[0] ||
			k === ACTIVITY_NIP22_K_TAGS[1] ||
			k === ACTIVITY_NIP22_K_TAGS[2]
		);
	}

	function mergeZapTagRefsIntoSets(
		/** @type {import('nostr-tools').NostrEvent} */ ev,
		/** @type {Set<string>} */ refIds,
		/** @type {Set<string>} */ aTags
	) {
		for (const t of ev.tags ?? []) {
			const v = t[1];
			if (!v) continue;
			const low = String(v).toLowerCase();
			if (t[0] === 'e' || t[0] === 'E') refIds.add(low);
			if ((t[0] === 'a' || t[0] === 'A') && isAddressableActivityATag(v)) aTags.add(low);
		}
		try {
			const p = parseZapReceipt(ev);
			if (p.zappedEventId) refIds.add(String(p.zappedEventId).toLowerCase());
		} catch {
			/* skip */
		}
	}

	/**
	 * Strict graph match OR catalog `a`/`A` on the receipt (clients often omit `K` / omit tags on comments in Dexie).
	 */
	function eventMatchesActivityZapInclusive(
		/** @type {import('nostr-tools').NostrEvent} */ ev,
		/** @type {Set<string>} */ refIds,
		/** @type {Set<string>} */ aTags
	) {
		if (eventMatchesActivityZap(ev, refIds, aTags)) return true;
		for (const t of ev.tags ?? []) {
			if ((t[0] === 'a' || t[0] === 'A') && t[1] && isAddressableActivityATag(t[1])) return true;
		}
		return false;
	}

	/**
	 * Forum post ids in Dexie so zaps that target the post (before any comment is stored) still match.
	 */
	async function seedForumPostIdsForActivityZaps(/** @type {Set<string>} */ refIds) {
		const posts = await queryEvents({ kinds: [EVENT_KINDS.FORUM_POST], limit: 400 }).catch(() => []);
		for (const fp of posts) {
			if (fp?.id) refIds.add(fp.id.toLowerCase());
		}
	}

	/**
	 * @param {import('nostr-tools').NostrEvent[]} zapRows
	 * @param {import('nostr-tools').NostrEvent[]} scopedComments
	 */
	async function filterZapsForActivityFeed(zapRows, scopedComments) {
		const { refIds, aTags } = buildActivityZapMatchSets(scopedComments);
		await seedForumPostIdsForActivityZaps(refIds);
		for (const z of zapRows) {
			if (zapHasActivityNip22K(z)) mergeZapTagRefsIntoSets(z, refIds, aTags);
		}
		for (let ri = 0; ri < 5; ri++) {
			const before = refIds.size + aTags.size;
			const candidates = zapRows.filter((z) => eventMatchesActivityZapInclusive(z, refIds, aTags));
			for (const z of candidates) mergeZapTagRefsIntoSets(z, refIds, aTags);
			if (refIds.size + aTags.size === before) break;
		}
		return zapRows.filter((z) => eventMatchesActivityZapInclusive(z, refIds, aTags));
	}

	/** Full NIP-22 scoped threads in Dexie (maps, modals, parent resolution). */
	/** @type {import('nostr-tools').NostrEvent[]} */
	let activityThreadComments = $state([]);
	/** @type {import('nostr-tools').NostrEvent[]} */
	let activityThreadZaps = $state([]);
	/** Merged newest-first slice for the list only — one timeline, one slice. */
	/** @type {Array<{ kind: 'comment', ts: number, ev: import('nostr-tools').NostrEvent } | { kind: 'zap', ts: number, row: { event: import('nostr-tools').NostrEvent, parsed: ReturnType<typeof parseZapReceipt> } }>} */
	let activityFeedItems = $state([]);
	let activityHasMoreTimeline = $state(false);
	/** @type {Map<string, import('nostr-tools').NostrEvent>} forum post id or other roots keyed by hex id */
	let activityRootEvents = $state(new Map());
	/** @type {Map<string, import('nostr-tools').NostrEvent>} NIP-33 `a` tag -> kind 32267 / 30267 event */
	let activityAddrRootEvents = $state(new Map());
	/** Root badge hydration is async and independent from feed row rendering. */
	let activityRootHydrateSeq = 0;
	/** @type {Map<string, { displayName?: string, name?: string, picture?: string }>} */
	let activityProfiles = $state(new Map());
	/** Roots still missing after `ACTIVITY_ROOT_MISSING_AFTER_MS` — key `e:…` / `a:…`, value kind for copy. */
	let activityRootDeletedByKey = $state(/** @type {Map<string, 'forum' | 'app' | 'stack'>} */ (new Map()));

	const activityCommentMap = $derived.by(() => {
		const m = new Map();
		for (const ev of activityThreadComments) {
			m.set(ev.id, ev);
			m.set(ev.id.toLowerCase(), ev);
		}
		return m;
	});

	const activityZapMap = $derived.by(() => {
		const m = new Map();
		for (const ev of activityThreadZaps) {
			m.set(ev.id, ev);
			m.set(ev.id.toLowerCase(), ev);
		}
		return m;
	});

	/** Parsed thread zaps (full scoped set) for deleted-root logic and sorting helpers. */
	const activityZapsForFeed = $derived.by(() => {
		const rows = [];
		for (const ev of activityThreadZaps) {
			let p;
			try {
				p = parseZapReceipt(ev);
			} catch {
				continue;
			}
			rows.push({ event: ev, parsed: p });
		}
		return rows.sort((a, b) => b.event.created_at - a.event.created_at);
	});

	$effect(() => {
		if (!browser || !activityReady) return;
		void activityThreadComments;
		void activityThreadZaps;
		void activityRootEvents;
		void activityAddrRootEvents;
		void activityZapsForFeed;
		void activityCommentMap;
		void activityInitialSeedDone;
		void activityLoading;
		void activityFeedQuerySettled;
		const roots = activityRootEvents;
		const addrRoots = activityAddrRootEvents;
		const comments = activityThreadComments;
		const zapsForFeed = activityZapsForFeed;
		const commentMap = activityCommentMap;
		let lastDeletedSig = '';
		const tick = () => {
			// Compute readyForDeletedTimer fresh on every tick so it reflects the live
			// values of plain (non-$state) variables like activityAddrRelayInFlight.
			// Activity route: wait for both the initial seed AND the addr-root relay fetch
			// to settle before the "not found" countdown begins — the fetch can still be
			// in-flight when activityInitialSeedDone fires on a fast relay.
			// Inbox embed: wait for loading to stop and a liveQuery to have fired.
			const readyForDeletedTimer = inboxEmbed
				? !activityLoading && activityFeedQuerySettled
				: activityInitialSeedDone && !activityAddrRelayInFlight;
			const next = recomputeActivityRootDeleted(roots, addrRoots, comments, zapsForFeed, commentMap, readyForDeletedTimer);
			const sig = [...next.entries()]
				.sort((a, b) => a[0].localeCompare(b[0]))
				.map(([k, v]) => `${k}:${v}`)
				.join('|');
			if (sig !== lastDeletedSig) {
				lastDeletedSig = sig;
				activityRootDeletedByKey = next;
			}
		};
		tick();
		const id = setInterval(tick, 500);
		return () => clearInterval(id);
	});

	const activityLikelyHasMore = $derived(
		!inboxUserPubkey &&
			activityFeedItems.length > 0 &&
			activityHasMoreTimeline &&
			activityFeedVisibleLimit < ACTIVITY_FEED_VISIBLE_MAX
	);

	function loadMoreActivity() {
		if (inboxUserPubkey) return;
		activityFeedVisibleLimit = Math.min(
			ACTIVITY_FEED_VISIBLE_MAX,
			activityFeedVisibleLimit + 160
		);
		void seedActivityFromRelay();
	}

	/** @param {string} eventId */
	function inboxRowUnread(eventId) {
		if (!inboxEmbed || !inboxUserPubkey || !eventId) return false;
		void inboxSeenSignal.count;
		return isInboxEventUnread(inboxUserPubkey, eventId);
	}

	/** Inbox: clear per-card unread only after the user engages this row (not on scroll). */
	function markInboxCardSeen(eventId) {
		if (!inboxEmbed || !inboxUserPubkey || !eventId) return;
		markInboxEventsSeen(inboxUserPubkey, [eventId]);
	}

	/** Mark every currently-visible inbox item as read. */
	export function markAllRead() {
		if (!inboxEmbed || !inboxUserPubkey || !activityFeedItems.length) return;
		const ids = activityFeedItems.map((item) =>
			item.kind === 'zap' ? item.row.event.id : item.ev.id
		);
		markInboxEventsSeen(inboxUserPubkey, ids);
		onMarkAllRead?.();
	}

	async function seedInboxFromRelay(pk) {
		if (!browser || !pk) return;
		activityLoading = true;
		activityError = '';
		try {
			activityAddrRelayAttempted.clear();
			const sinceSec = commentZapRelayReadSince();
			await Promise.all([
				fetchFromRelays(
					[ZAPSTORE_RELAY],
					{
						kinds: [EVENT_KINDS.COMMENT],
						'#p': [pk],
						since: sinceSec,
						limit: 500
					},
					{ timeout: ACTIVITY_BULK_RELAY_TIMEOUT_MS, feature: 'inbox-1111-p' }
				),
				fetchFromRelays(
					[ZAPSTORE_RELAY],
					{
						kinds: [EVENT_KINDS.ZAP_RECEIPT],
						'#p': [pk],
						since: sinceSec,
						limit: 400
					},
					{ timeout: ACTIVITY_BULK_RELAY_TIMEOUT_MS, feature: 'inbox-9735-p' }
				)
			]);
		} catch (err) {
			console.error('[Inbox] relay seed failed', err);
			activityError = 'Failed to sync inbox.';
		} finally {
			activityLoading = false;
		}
	}

	function forumPostIdForZapParsed(parsed) {
		return resolveForumPostIdForZapActivity(parsed, activityRootEvents, activityCommentMap);
	}

	/**
	 * App/stack zap thread key: NIP-33 `a` from receipt or from zapped comment's `A` tag.
	 * @param {import('nostr-tools').NostrEvent} zapEv
	 */
	function addrATagForAppStackZap(zapEv, parsed) {
		const direct = appATagFromZapEvent(zapEv);
		if (isAddressableActivityATag(direct)) return direct;
		const zid = parsed?.zappedEventId;
		if (!zid) return null;
		const c = activityCommentMap.get(zid) ?? activityCommentMap.get(zid.toLowerCase());
		if (!c) return null;
		const a = addrTagFromComment(c);
		return isAddressableActivityATag(a) ? a : null;
	}

	/** True while Activity tab should subscribe to Dexie; seed runs in parallel and must not block this. */
	let activityReady = $state(false);
	let activityLoading = $state(false);
	/** First relay seed for this route-entry finished (success or failure). */
	let activityInitialSeedDone = $state(false);
	let activityError = $state('');
	/** First Dexie `liveQuery` emission — avoids “No Activity yet” between seed finishing and reactive query. */
	let activityFeedQuerySettled = $state(false);
	/**
	 * True when Dexie already had activity events before the current seed started (return visit).
	 * On a return visit: show local data immediately (local-first).
	 * On a fresh/cleared DB: hold the skeleton until both seeds finish, so the zap-only
	 * flash (zap seed writing before comment seed) never shows.
	 */
	let activityHadCachedData = $state(false);
	/** Footer target for intersection-based “load more” (throttled). */
	let activityLoadSentinel = $state(/** @type {HTMLElement | null} */ (null));
	let activityScrollLoadLastAt = 0;
	const ACTIVITY_SCROLL_LOAD_GAP_MS = 1400;

	const activityAddrRelayAttempted = new Set();
	let activityAddrRelayInFlight = false;

	$effect(() => {
		const feedAddrReady = inboxEmbed ? !!(inboxUserPubkey && inboxActive) : activityReady;
		if (!browser || !feedAddrReady || !isOnline()) return;
		const missing = [];
		for (const c of activityThreadComments) {
			const raw = addrTagFromComment(c);
			if (!isAddressableActivityATag(raw)) continue;
			if (activityAddrRootEvents.has(raw)) continue;
			if (activityAddrRelayAttempted.has(raw)) continue;
			missing.push(raw);
		}
		if (missing.length === 0) return;
		if (activityAddrRelayInFlight) return;
		activityAddrRelayInFlight = true;
		for (const a of missing) activityAddrRelayAttempted.add(a);
		void relayFetchAddrRootEventsByATags(missing)
			.catch(() => {
				for (const a of missing) activityAddrRelayAttempted.delete(a);
			})
			.finally(() => {
				activityAddrRelayInFlight = false;
			});
	});

	// Subscribe in $effect (not $derived.by): Svelte 5 + liveQuery Observable must not be recreated opaquely; `filter` tolerates kind stored as string.
	$effect(() => {
		const feedLive = inboxEmbed ? !!(inboxUserPubkey && inboxActive) : activityReady;
		if (!browser || !feedLive) return;
		const visibleLimitSnap = Math.min(ACTIVITY_FEED_VISIBLE_MAX, activityFeedVisibleLimit);

		const obs = liveQuery(async () => {
			const [commentRows, zapRows] = await Promise.all([
				db.events.filter((e) => Number(e.kind) === EVENT_KINDS.COMMENT).toArray(),
				db.events.filter((e) => Number(e.kind) === EVENT_KINDS.ZAP_RECEIPT).toArray()
			]);
			const scopedComments = commentRows.filter(eventMatchesActivityNip22KComment);
			scopedComments.sort((a, b) => b.created_at - a.created_at);
			// Accept all parseable zap receipts — relay.zapstore.dev is Zapstore-specific so every
			// zap receipt there is relevant. The old graph-match filter excluded zaps whose referenced
			// comments weren't in Dexie yet, causing them to appear only when the backfill landed.
			const scopedZaps = [];
			for (const ev of zapRows) {
				try { parseZapReceipt(ev); scopedZaps.push(ev); } catch { /* skip malformed */ }
			}
			scopedZaps.sort((a, b) => b.created_at - a.created_at);

			/** @type {Array<{ kind: 'comment', ts: number, ev: import('nostr-tools').NostrEvent } | { kind: 'zap', ts: number, row: { event: import('nostr-tools').NostrEvent, parsed: ReturnType<typeof parseZapReceipt> } }>} */
			let merged;
			/** @type {import('nostr-tools').NostrEvent[]} */
			let threadCommentsForMap;

			if (inboxUserPubkey) {
				const pk = inboxUserPubkey;
				const inboxComments = commentRows.filter(
					(c) =>
						Number(c.kind) === EVENT_KINDS.COMMENT &&
						c.pubkey !== pk &&
						c.tags?.some((t) => t[0] === 'p' && t[1] === pk)
				);
				inboxComments.sort((a, b) => b.created_at - a.created_at);
				/** @type {{ event: import('nostr-tools').NostrEvent, parsed: ReturnType<typeof parseZapReceipt> }[]} */
				const inboxZapParsed = [];
				for (const ev of zapRows) {
					if (!ev.tags?.some((t) => t[0] === 'p' && t[1] === pk)) continue;
					try {
						const parsed = parseZapReceipt(ev);
						if (parsed.senderPubkey === pk) continue;
						inboxZapParsed.push({ event: ev, parsed });
					} catch {
						/* skip malformed */
					}
				}
				inboxZapParsed.sort((a, b) => b.event.created_at - a.event.created_at);
				merged = [];
				for (const ev of inboxComments) merged.push({ kind: 'comment', ts: ev.created_at, ev });
				for (const row of inboxZapParsed)
					merged.push({ kind: 'zap', ts: row.event.created_at, row });
				merged.sort((a, b) => b.ts - a.ts);

				const threadMergeById = new Map();
				for (const c of scopedComments) threadMergeById.set(c.id, c);
				for (const c of inboxComments) {
					if (!threadMergeById.has(c.id)) threadMergeById.set(c.id, c);
				}
				threadCommentsForMap = Array.from(threadMergeById.values());
			} else {
				merged = [];
				for (const ev of scopedComments) {
					merged.push({ kind: 'comment', ts: ev.created_at, ev });
				}
				for (const ev of scopedZaps) {
					try {
						const parsed = parseZapReceipt(ev);
						merged.push({ kind: 'zap', ts: ev.created_at, row: { event: ev, parsed } });
					} catch {
						/* skip malformed */
					}
				}
				merged.sort((a, b) => b.ts - a.ts);
				threadCommentsForMap = scopedComments;
			}

			const feedLimit = Math.min(ACTIVITY_FEED_VISIBLE_MAX, visibleLimitSnap);
			const hasMoreTimeline = inboxUserPubkey ? false : merged.length > feedLimit;
			const feedItems = merged.slice(0, feedLimit);

			const commentsInFeed = [];
			const zapsInFeed = [];
			for (const it of feedItems) {
				if (it.kind === 'comment') commentsInFeed.push(it.ev);
				else zapsInFeed.push(it.row.event);
			}
			return {
				feedItems,
				threadComments: threadCommentsForMap,
				threadZaps: scopedZaps,
				hasMoreTimeline
			};
		});

		const sub = obs.subscribe({
			next: (val) => {
				const feedItems = val?.feedItems ?? [];
				// On the very first emission: if Dexie already had data we're on a return visit
				// and should show it immediately (local-first). On a fresh/cleared DB the first
				// emission is empty → hold the skeleton until both seeds finish so the zap-only
				// flash (zap seed writing before comment seed) is never shown to the user.
				if (!activityFeedQuerySettled) {
					activityHadCachedData = feedItems.length > 0;
				}
				activityFeedQuerySettled = true;
				const threadComments = val?.threadComments ?? [];
				const threadZaps = val?.threadZaps ?? [];
				activityFeedItems = feedItems;
				activityThreadComments = threadComments;
				activityThreadZaps = threadZaps;
				activityHasMoreTimeline = !!val?.hasMoreTimeline;
				void hydrateActivityRootsForVisibleFeed(feedItems);
				const threadCommentById = new Map();
				for (const c of threadComments) {
					threadCommentById.set(c.id, c);
					threadCommentById.set(c.id.toLowerCase(), c);
				}
				for (const it of feedItems) {
					if (it.kind !== 'comment') continue;
					const ev = it.ev;
					resolveActivityRootEvent(ev);
					scheduleActivityProfileFetch(ev.pubkey);
					const parentTag = ev.tags?.find((t) => t[0] === 'e' && t[1]);
					if (parentTag?.[1]) {
						const parent =
							threadCommentById.get(parentTag[1]) ??
							threadCommentById.get(parentTag[1].toLowerCase());
						if (parent?.pubkey) scheduleActivityProfileFetch(parent.pubkey);
					}
				}
				for (const it of feedItems) {
					if (it.kind !== 'zap') continue;
					const zEv = it.row.event;
					try {
						const zp = parseZapReceipt(zEv);
						if (zp.senderPubkey) scheduleActivityProfileFetch(zp.senderPubkey);
						const zapped = zp.zappedEventId;
						if (
							zapped &&
							!threadCommentById.get(zapped) &&
							!threadCommentById.get(zapped.toLowerCase()) &&
							!activityRootEvents.get(zapped)
						) {
							void queryEvent({ ids: [zapped] }).then((ev) => {
								if (!ev) return;
								if (ev.kind === EVENT_KINDS.FORUM_POST) {
									activityRootEvents = new Map(activityRootEvents).set(zapped, ev);
								} else if (ev.kind === EVENT_KINDS.APP || ev.kind === EVENT_KINDS.APP_STACK) {
									const d = ev.tags?.find((t) => t[0] === 'd')?.[1];
									if (d) {
										const a = `${ev.kind}:${ev.pubkey}:${d}`;
										activityAddrRootEvents = new Map(activityAddrRootEvents).set(a, ev);
									}
									activityRootEvents = new Map(activityRootEvents).set(zapped, ev);
								}
							});
						}
					} catch {
						/* ignore */
					}
				}
			},
			error: (e) => {
				console.error('[Activity] liveQuery error', e);
				activityFeedQuerySettled = true;
				activityError = 'Failed to load activity.';
			}
		});
		return () => sub.unsubscribe();
	});

	/**
	 * Hydrate root labels/badges asynchronously so feed rows render immediately.
	 * Cards show per-root skeletons (`rootBadgeSkeleton`) while this resolves.
	 * @param {Array<{ kind: 'comment', ts: number, ev: import('nostr-tools').NostrEvent } | { kind: 'zap', ts: number, row: { event: import('nostr-tools').NostrEvent, parsed: ReturnType<typeof parseZapReceipt> } }>} feedItems
	 */
	async function hydrateActivityRootsForVisibleFeed(feedItems) {
		if (!browser || !activityReady || !feedItems?.length) return;
		const seq = ++activityRootHydrateSeq;
		/** @type {import('nostr-tools').NostrEvent[]} */
		const commentsInFeed = [];
		/** @type {import('nostr-tools').NostrEvent[]} */
		const zapsInFeed = [];
		for (const it of feedItems) {
			if (it.kind === 'comment') commentsInFeed.push(it.ev);
			else zapsInFeed.push(it.row.event);
		}
		const addrRootByATag = new Map();
		await batchResolveAddrRootsFromDexie(commentsInFeed, addrRootByATag);
		const forumRootById = await batchResolveForumRootsByIdFromDexie(commentsInFeed, zapsInFeed);
		if (seq !== activityRootHydrateSeq) return;
		if (addrRootByATag.size > 0) {
			activityAddrRootEvents = new Map([...activityAddrRootEvents, ...addrRootByATag]);
		}
		if (forumRootById.size > 0) {
			activityRootEvents = new Map([...activityRootEvents, ...forumRootById]);
		}
	}

	$effect(() => {
		if (!browser || !activityReady || !activityRouteActive) return;
		if (!activityLikelyHasMore) return;
		const el = activityLoadSentinel;
		if (!el) return;

		const obs = new IntersectionObserver(
			(entries) => {
				for (const ent of entries) {
					if (!ent.isIntersecting) continue;
					const now = Date.now();
					if (now - activityScrollLoadLastAt < ACTIVITY_SCROLL_LOAD_GAP_MS) continue;
					activityScrollLoadLastAt = now;
					loadMoreActivity();
				}
			},
			{ root: null, rootMargin: '240px', threshold: 0 }
		);
		obs.observe(el);
		return () => obs.disconnect();
	});

	$effect(() => {
		for (const ev of activityThreadComments) {
			const parentTag = ev.tags?.find((t) => t[0] === 'e' && t[1]);
			const pid = parentTag?.[1];
			if (!pid) continue;
			if (activityCommentMap.get(pid) ?? activityCommentMap.get(pid.toLowerCase())) continue;
			const z = activityZapMap.get(pid) ?? activityZapMap.get(pid.toLowerCase());
			if (!z) continue;
			try {
				const p = parseZapReceipt(z);
				if (p.senderPubkey) scheduleActivityProfileFetch(p.senderPubkey);
			} catch {
				/* ignore */
			}
		}
	});

	async function resolveActivityRootEvent(commentEvent) {
		if (!commentEvent?.tags) return;
		const eRootTag = commentEvent.tags.find((t) => t[0] === 'E' && t[1]);
		const rootId = eRootTag?.[1] ?? null;
		if (!rootId || activityRootEvents.get(rootId)) return;

		let rootEv = await queryEvent({ ids: [rootId] }).catch(() => null);
		if (rootEv) {
			activityRootEvents = new Map(activityRootEvents).set(rootId, rootEv);
			return;
		}

		try {
			const arr = await fetchFromRelays(
				[ZAPSTORE_RELAY],
				{ ids: [rootId], since: 0, limit: 1 },
				{ timeout: 4000, feature: 'activity-forum-root-by-id' }
			);
			if (arr?.[0]) {
				await putEvents([arr[0]]).catch(() => {});
				activityRootEvents = new Map(activityRootEvents).set(rootId, arr[0]);
			}
		} catch {
			// non-fatal
		}
	}

	let _activityProfileTimer = null;
	const _activityPendingProfiles = new Set();
	function scheduleActivityProfileFetch(pubkey) {
		if (!pubkey || activityProfiles.get(pubkey)) return;
		_activityPendingProfiles.add(pubkey);
		if (_activityProfileTimer) return;
		_activityProfileTimer = setTimeout(async () => {
			_activityProfileTimer = null;
			const keys = [..._activityPendingProfiles];
			_activityPendingProfiles.clear();
			if (!keys.length) return;
			try {
				const results = await fetchProfilesBatch(keys, { timeout: 4000 });
				for (const [pk, event] of results) {
					try {
						activityProfiles = new Map(activityProfiles).set(pk, parseProfile(event));
					} catch {
						/* skip */
					}
				}
			} catch {
				/* non-fatal */
			}
		}, 200);
	}

	const ACTIVITY_BACKFILL_REF_COMMENT_CAP = 2000;
	const ACTIVITY_BACKFILL_FORUM_ID_BATCH = 40;
	const ACTIVITY_BACKFILL_FORUM_WAVE = 4;

	/**
	 * Zaps were ref-scoped from the relay; comments were only the global K-bucket — older threads had zaps
	 * but almost no 1111 in Dexie. Mirror zaps: pull 1111 by `#e`/`#E` (forum, batched) and `#a`/`#A` (app/stack).
	 */
	async function backfillActivityThreadsScoped() {
		if (!browser || !isOnline()) return;
		const sinceSec = activityRelaySince();
		const relays = [ZAPSTORE_RELAY];

		const commentRows = await queryEvents({
			kinds: [EVENT_KINDS.COMMENT],
			limit: Math.max(ACTIVITY_BACKFILL_REF_COMMENT_CAP, 600)
		}).catch(() => []);
		const scoped = commentRows.filter(eventMatchesActivityNip22KComment);
		scoped.sort((a, b) => b.created_at - a.created_at);
		const forRefs = scoped.slice(0, ACTIVITY_BACKFILL_REF_COMMENT_CAP);

		/** @type {Set<string>} */
		const eventIds = new Set();
		/** @type {Map<string, string>} */
		const aTagByLower = new Map();
		for (const c of forRefs) {
			if (c?.id) eventIds.add(c.id.toLowerCase());
			for (const t of c.tags ?? []) {
				const v = t[1];
				if (!v) continue;
				if (t[0] === 'e' || t[0] === 'E') eventIds.add(String(v).toLowerCase());
				if ((t[0] === 'a' || t[0] === 'A') && isAddressableActivityATag(v)) {
					const low = String(v).toLowerCase();
					if (!aTagByLower.has(low)) aTagByLower.set(low, v);
				}
			}
		}
		const posts = await queryEvents({ kinds: [EVENT_KINDS.FORUM_POST], limit: 400 }).catch(() => []);
		for (const fp of posts) {
			if (fp?.id) eventIds.add(fp.id.toLowerCase());
		}

		const idList = [...eventIds].filter((id) => /^[a-f0-9]{64}$/.test(id));
		const aList = [...aTagByLower.values()].slice(0, 96);
		const aChunk = 6;

		// Critical: start zap backfill immediately. Previously zaps waited behind long
		// sequential comment backfill loops, causing the 20-30s "late zap burst".
		const zapBackfillByEventIds = idList.length
			? fetchKind9735MatchingRefs(relays, { eventIds: idList }, {
				since: sinceSec,
				limit: 500,
				timeout: 14_000,
				feature: 'activity-zap-backfill-e'
			}).catch(() => [])
			: Promise.resolve([]);

		const zapBackfillByATags = (async () => {
			for (let i = 0; i < aList.length; i += aChunk) {
				await Promise.all(
					aList.slice(i, i + aChunk).map((aTag) =>
						fetchKind9735MatchingRefs(relays, { aTag }, {
						since: sinceSec,
						limit: 350,
						timeout: 10_000,
						feature: 'activity-zap-backfill-a'
					}).catch(() => [])
					)
				);
			}
		})();

		const commentBackfillByEventIds = (async () => {
			const idChunks = chunkArray(idList, ACTIVITY_BACKFILL_FORUM_ID_BATCH);
			for (let i = 0; i < idChunks.length; i += ACTIVITY_BACKFILL_FORUM_WAVE) {
				await Promise.all(
					idChunks.slice(i, i + ACTIVITY_BACKFILL_FORUM_WAVE).map((chunk) =>
						fetchKind1111ReferencingEventIds(relays, chunk, {
						since: sinceSec,
						limit: 500,
						timeout: 12_000,
						feature: 'activity-comment-backfill-e'
					}).catch(() => [])
					)
				);
			}
		})();

		const commentBackfillByATags = (async () => {
			for (let i = 0; i < aList.length; i += aChunk) {
				await Promise.all(
					aList.slice(i, i + aChunk).map((aTag) =>
						fetchKind1111ByTagRef(relays, 'a', aTag, {
						since: sinceSec,
						limit: 450,
						timeout: 10_000,
						feature: 'activity-comment-backfill-a'
					}).catch(() => [])
					)
				);
			}
		})();

		await Promise.allSettled([
			zapBackfillByEventIds,
			zapBackfillByATags,
			commentBackfillByEventIds,
			commentBackfillByATags
		]);
	}

	async function seedActivityFromRelay() {
		if (!browser) return;
		activityLoading = true;
		activityError = '';
		try {
			activityAddrRelayAttempted.clear();
			const sinceSec = activityRelaySince();
			const lim = ACTIVITY_INITIAL_SEED_LIMIT;
			// Fetch comments and zaps in parallel. Start backfill (targeted #e/#a zap queries)
			// as soon as comments land in Dexie — don't block it behind the slower zap seed.
			const commentPromise = fetchFromRelays(
				[ZAPSTORE_RELAY],
				{
					kinds: [EVENT_KINDS.COMMENT],
					'#K': ACTIVITY_NIP22_K_TAGS,
					since: sinceSec,
					limit: lim
				},
				{ timeout: ACTIVITY_BULK_RELAY_TIMEOUT_MS, feature: 'activity-1111-K' }
			);
			const zapPromise = fetchFromRelays(
				[ZAPSTORE_RELAY],
				{
					kinds: [EVENT_KINDS.ZAP_RECEIPT],
					since: sinceSec,
					limit: lim
				},
				{ timeout: ACTIVITY_BULK_RELAY_TIMEOUT_MS, feature: 'activity-9735-bucket' }
			);
			// Start backfill right after comments land (don't wait for zap seed).
			commentPromise
				.catch(() => {})
				.then(() =>
					backfillActivityThreadsScoped().catch((err) =>
						console.error('[Activity] thread backfill failed', err)
					)
				);
			await Promise.all([commentPromise, zapPromise]);
		} catch (err) {
			console.error('[Activity] relay seed failed', err);
			activityError = 'Failed to sync activity.';
		} finally {
			activityLoading = false;
			activityInitialSeedDone = true;
		}
	}

	/** @param {import('nostr-tools').NostrEvent | null} ev */
	/** @param {'forum' | 'app' | 'stack'} kind */
	function activityDeletedRootLabel(kind) {
		if (kind === 'forum') return 'Forum post not found';
		if (kind === 'app') return 'App not found';
		return 'Stack not found';
	}

	function hrefForActivityRootEvent(ev) {
		if (!ev?.id) return null;
		try {
			if (ev.kind === EVENT_KINDS.FORUM_POST) {
				return `/community/forum/${nip19.neventEncode({ id: ev.id })}`;
			}
			const dTag = ev.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
			if (!dTag) return null;
			const naddr = nip19.naddrEncode({
				kind: ev.kind,
				pubkey: ev.pubkey,
				identifier: dTag
			});
			return ev.kind === EVENT_KINDS.APP ? `/apps/${naddr}` : `/stacks/${naddr}`;
		} catch {
			return null;
		}
	}

	/** Root label: forum post, app, or stack detail. */
	function openRootPost(rootEvent) {
		if (!rootEvent?.id) return;
		try {
			if (rootEvent.kind === EVENT_KINDS.FORUM_POST) {
				const parsed = parseForumPost(rootEvent);
				if (parsed) {
					setCached(`forum_post:${rootEvent.id}`, { ...parsed, _raw: rootEvent });
				}
				const nevent = nip19.neventEncode({ id: rootEvent.id });
				goto(`/community/forum/${nevent}`);
				return;
			}
			if (rootEvent.kind === EVENT_KINDS.APP || rootEvent.kind === EVENT_KINDS.APP_STACK) {
				const dTag = rootEvent.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
				if (!dTag) return;
				const naddr = nip19.naddrEncode({
					kind: rootEvent.kind,
					pubkey: rootEvent.pubkey,
					identifier: dTag
				});
				goto(rootEvent.kind === EVENT_KINDS.APP ? `/apps/${naddr}` : `/stacks/${naddr}`);
			}
		} catch {
			/* ignore */
		}
	}

	// ── In-feed thread modal (header = discussion root under the forum post) ───
	let threadModalRootId = $state(/** @type {string | null} */ (null));
	let threadModalRootEvent = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
	let initialReplyTargetForModal = $state(/** @type {any} */ (null));
	let threadLoadGen = 0;
	let openReplyOnMount = $state(false);
	/** Feed three-dots: open actions sheet when thread modal mounts */
	let threadOpenActionsOnMount = $state(false);
	/** Feed ⋯: show only CommentActionsModal first (no thread modal behind it). */
	let threadOpenFeedActionsOnly = $state(false);
	/** Feed zap icon: load thread data but show zap slider only (no thread modal). */
	let threadOpenFeedZapOnly = $state(false);
	let standaloneActionsOpenKey = $state(0);
	let standaloneZapOpenKey = $state(0);
	let threadInitialActionsTarget = $state(/** @type {'root' | any | null} */ (null));
	let pendingActionsCommentEv = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
	let pendingZapCommentEv = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
	let selectedThreadComments = $state(/** @type {any[]} */ ([]));
	let selectedThreadZaps = $state(/** @type {any[]} */ ([]));
	let threadModalKind = $state(/** @type {'comment' | 'zap' | null} */ (null));
	let threadModalZapId = $state(/** @type {string | null} */ (null));
	let threadModalZapEvent = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
	/** App/stack thread: NIP-33 `a` value (32267:… or 30267:…). Null when modal is forum-only. */
	let threadModalAddrATag = $state(/** @type {string | null} */ (null));

	const searchProfiles = $derived(createSearchProfilesFunction(() => getCurrentPubkey()));
	const searchEmojis = $derived(createSearchEmojisFunction(() => getCurrentPubkey()));

	function enrichReplyTargetForModal(commentEv) {
		const c = parseComment(commentEv);
		const p = activityProfiles.get(commentEv.pubkey);
		let npub = '';
		try {
			npub = nip19.npubEncode(commentEv.pubkey);
		} catch {
			/* ignore */
		}
		return {
			id: commentEv.id,
			pubkey: commentEv.pubkey,
			displayName:
				p?.displayName ??
				p?.name ??
				(npub ? `npub1${npub.slice(5, 8)}…${npub.slice(-6)}` : commentEv.pubkey.slice(0, 8)),
			avatarUrl: p?.picture ?? null,
			content: commentEv.content ?? '',
			createdAt: commentEv.created_at,
			emojiTags: c.emojiTags,
			mediaUrls: c.mediaUrls ?? []
		};
	}

	function openThread(commentEv, withReply = false, opts = {}) {
		const openActionsSheet = opts?.openActionsSheet === true;
		const openZapOnly = opts?.openZapOnly === true;
		if (openZapOnly) {
			threadOpenFeedZapOnly = true;
			standaloneZapOpenKey++;
			threadOpenActionsOnMount = false;
			threadOpenFeedActionsOnly = false;
			pendingZapCommentEv = commentEv;
			pendingActionsCommentEv = null;
		} else if (openActionsSheet) {
			threadOpenFeedZapOnly = false;
			pendingZapCommentEv = null;
			threadOpenActionsOnMount = true;
			threadOpenFeedActionsOnly = true;
			standaloneActionsOpenKey++;
			pendingActionsCommentEv = commentEv;
		} else {
			threadOpenFeedZapOnly = false;
			pendingZapCommentEv = null;
			threadOpenActionsOnMount = false;
			threadOpenFeedActionsOnly = false;
			pendingActionsCommentEv = null;
		}
		threadInitialActionsTarget = null;

		const postId = commentEv.tags?.find((t) => t[0] === 'E' && t[1])?.[1] ?? null;
		const aRoot = addrTagFromComment(commentEv);

		threadLoadGen++;
		const gen = threadLoadGen;
		openReplyOnMount = withReply;
		selectedThreadComments = [];
		selectedThreadZaps = [];
		threadModalKind = null;
		threadModalZapId = null;
		threadModalZapEvent = null;
		threadModalRootId = null;
		threadModalRootEvent = null;
		threadModalAddrATag = null;
		initialReplyTargetForModal = null;

		const cmap = new Map();
		for (const c of activityThreadComments) cmap.set(c.id.toLowerCase(), c);

		if (postId) {
			(async () => {
				const encZap = await findEnclosingZapReceiptForComment(
					commentEv,
					cmap,
					activityZapMap,
					(id) => queryEvent({ ids: [id] }).catch(() => null)
				);
				if (gen !== threadLoadGen) return;

				if (encZap) {
					let zp;
					try {
						zp = parseZapReceipt(encZap);
					} catch {
						return;
					}
					const postIdZap = forumPostIdForZapParsed(zp);
					if (!postIdZap) return;

					threadModalKind = 'zap';
					threadModalRootId = null;
					threadModalRootEvent = null;
					threadModalAddrATag = null;
					threadModalZapId = encZap.id;
					threadModalZapEvent = encZap;
					initialReplyTargetForModal =
						withReply && commentEv.id.toLowerCase() !== encZap.id.toLowerCase()
							? enrichReplyTargetForModal(commentEv)
							: null;

					if (threadOpenActionsOnMount && pendingActionsCommentEv) {
						const isRoot =
							pendingActionsCommentEv.id.toLowerCase() === encZap.id.toLowerCase();
						threadInitialActionsTarget = isRoot
							? 'root'
							: enrichReplyTargetForModal(pendingActionsCommentEv);
					} else {
						threadInitialActionsTarget = null;
					}

					loadZapForumThread(postIdZap, encZap.id, gen);
					return;
				}

				const rootId = await resolveForumDiscussionRootCommentId(commentEv, postId, cmap, (id) =>
					queryEvent({ ids: [id] }).catch(() => null)
				);
				if (gen !== threadLoadGen) return;

				let rootEv = cmap.get(rootId.toLowerCase());
				if (!rootEv) {
					rootEv = await queryEvent({ ids: [rootId] }).catch(() => null);
					if (rootEv) cmap.set(rootEv.id.toLowerCase(), rootEv);
				}
				if (!rootEv || gen !== threadLoadGen) return;

				threadModalKind = 'comment';
				threadModalRootId = rootId;
				threadModalRootEvent = rootEv;
				threadModalAddrATag = null;
				scheduleActivityProfileFetch(rootEv.pubkey);
				initialReplyTargetForModal =
					withReply && commentEv.id.toLowerCase() !== rootId.toLowerCase()
						? enrichReplyTargetForModal(commentEv)
						: null;

				if (threadOpenActionsOnMount && pendingActionsCommentEv) {
					const isRoot =
						pendingActionsCommentEv.id.toLowerCase() === rootId.toLowerCase();
					threadInitialActionsTarget = isRoot
						? 'root'
						: enrichReplyTargetForModal(pendingActionsCommentEv);
				} else {
					threadInitialActionsTarget = null;
				}

				await loadActivityThread(postId, rootId, gen, rootEv);
			})();
			return;
		}

		if (!aRoot || !isAddressableActivityATag(aRoot)) {
			threadOpenActionsOnMount = false;
			threadOpenFeedActionsOnly = false;
			threadOpenFeedZapOnly = false;
			threadInitialActionsTarget = null;
			pendingActionsCommentEv = null;
			pendingZapCommentEv = null;
			return;
		}

		(async () => {
			const encZap = await findEnclosingZapReceiptForComment(
				commentEv,
				cmap,
				activityZapMap,
				(id) => queryEvent({ ids: [id] }).catch(() => null)
			);
			if (gen !== threadLoadGen) return;

			if (encZap) {
				const aRootZ = appATagFromZapEvent(encZap) ?? aRoot;
				if (!isAddressableActivityATag(aRootZ)) return;
				threadModalKind = 'zap';
				threadModalRootId = null;
				threadModalRootEvent = null;
				threadModalAddrATag = aRootZ;
				threadModalZapId = encZap.id;
				threadModalZapEvent = encZap;
				initialReplyTargetForModal =
					withReply && commentEv.id.toLowerCase() !== encZap.id.toLowerCase()
						? enrichReplyTargetForModal(commentEv)
						: null;

				if (threadOpenActionsOnMount && pendingActionsCommentEv) {
					const isRoot =
						pendingActionsCommentEv.id.toLowerCase() === encZap.id.toLowerCase();
					threadInitialActionsTarget = isRoot
						? 'root'
						: enrichReplyTargetForModal(pendingActionsCommentEv);
				} else {
					threadInitialActionsTarget = null;
				}

				loadZapAddrThread(encZap.id, aRootZ, gen);
				return;
			}

			let rootId = walkAppDiscussionRootInMap(commentEv, cmap);
			if (!rootId) {
				rootId = await resolveAppDiscussionRootCommentId(commentEv, cmap, (id) =>
					queryEvent({ ids: [id] }).catch(() => null)
				);
			}
			if (gen !== threadLoadGen) return;

			let rootEv = cmap.get(rootId.toLowerCase());
			if (!rootEv) {
				rootEv = await queryEvent({ ids: [rootId] }).catch(() => null);
				if (rootEv) cmap.set(rootEv.id.toLowerCase(), rootEv);
			}
			if (!rootEv || gen !== threadLoadGen) return;

			threadModalKind = 'comment';
			threadModalRootId = rootId;
			threadModalRootEvent = rootEv;
			threadModalAddrATag = aRoot;
			scheduleActivityProfileFetch(rootEv.pubkey);
			initialReplyTargetForModal =
				withReply && commentEv.id.toLowerCase() !== rootId.toLowerCase()
					? enrichReplyTargetForModal(commentEv)
					: null;

			if (threadOpenActionsOnMount && pendingActionsCommentEv) {
				const isRoot = pendingActionsCommentEv.id.toLowerCase() === rootId.toLowerCase();
				threadInitialActionsTarget = isRoot
					? 'root'
					: enrichReplyTargetForModal(pendingActionsCommentEv);
			} else {
				threadInitialActionsTarget = null;
			}

			await loadAddrActivityThread(rootId, aRoot, gen, rootEv);
		})();
	}

	async function loadActivityThread(postId, rootId, gen, rootEv) {
		try {
			const [lower, upper] = await Promise.all([
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#E': [postId], limit: 300 }),
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#e': [postId], limit: 300 })
			]);
			const merged = [];
			const seen = new Set();
			for (const e of [...lower, ...upper]) {
				if (!seen.has(e.id)) {
					seen.add(e.id);
					merged.push(e);
				}
			}
			if (!merged.some((e) => e.id === rootEv.id)) merged.push(rootEv);

			const subtree = collectCommentSubtree(rootId, merged);
			let byId = new Map(subtree.map((e) => [e.id, e]));

			fetchKind1111ByTagRef([ZAPSTORE_RELAY], 'e', postId, {
				since: activityRelaySince(),
				limit: 300,
				timeout: 5000,
				feature: 'activity-thread-forum'
			})
				.then(async (relayComments) => {
					const pool = [...merged];
					for (const e of relayComments) {
						if (!pool.some((x) => x.id === e.id)) pool.push(e);
					}
					const sub2 = collectCommentSubtree(rootId, pool);
					const m2 = new Map(sub2.map((e) => [e.id, e]));
					await putEvents([...m2.values()]).catch(() => {});
					if (gen !== threadLoadGen || threadModalKind !== 'comment') return;
					await enrichAndSetActivityThread(rootId, gen, m2);
				})
				.catch(() => {});

			await enrichAndSetActivityThread(rootId, gen, byId);
		} catch (err) {
			console.error('[Activity] thread load failed', err);
		}
	}

	async function loadAddrActivityThread(rootId, aRoot, gen, rootEv) {
		try {
			const [lower, upper] = await Promise.all([
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#A': [aRoot], limit: 500 }),
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#a': [aRoot], limit: 500 })
			]);
			const merged = [];
			const seen = new Set();
			for (const e of [...lower, ...upper]) {
				if (!seen.has(e.id)) {
					seen.add(e.id);
					merged.push(e);
				}
			}
			if (!merged.some((e) => e.id === rootEv.id)) merged.push(rootEv);

			const subtree = collectCommentSubtree(rootId, merged);
			let byId = new Map(subtree.map((e) => [e.id, e]));

			fetchKind1111ByTagRef([ZAPSTORE_RELAY], 'a', aRoot, {
				since: activityRelaySince(),
				limit: 500,
				timeout: 5000,
				feature: 'activity-addr-thread'
			})
				.then(async (relayComments) => {
					const pool = [...merged];
					for (const e of relayComments) {
						if (!pool.some((x) => x.id === e.id)) pool.push(e);
					}
					const sub2 = collectCommentSubtree(rootId, pool);
					const m2 = new Map(sub2.map((e) => [e.id, e]));
					await putEvents([...m2.values()]).catch(() => {});
					if (gen !== threadLoadGen || threadModalKind !== 'comment') return;
					await enrichAndSetActivityThread(rootId, gen, m2);
				})
				.catch(() => {});

			await enrichAndSetActivityThread(rootId, gen, byId);
		} catch (err) {
			console.error('[Activity] addr thread load failed', err);
		}
	}

	async function enrichAndSetActivityThread(rootId, gen, byIdMap) {
		const evs = Array.from(byIdMap.values()).sort((a, b) => a.created_at - b.created_at);
		const pks = [...new Set(evs.map((e) => e.pubkey))];
		const profileResults = await fetchProfilesBatch(pks, { timeout: 4000 }).catch(() => new Map());
		const profileMap = new Map();
		for (const [pk, ev] of profileResults) {
			if (!ev?.content) continue;
			try {
				const j = JSON.parse(ev.content);
				profileMap.set(pk, {
					displayName: j.display_name ?? j.name,
					name: j.name,
					picture: j.picture
				});
			} catch {
				/* ignore */
			}
		}
		if (gen !== threadLoadGen || threadModalRootId !== rootId || threadModalKind !== 'comment')
			return;
		selectedThreadComments = evs.map((e) => {
			const c = parseComment(e);
			const p = profileMap.get(e.pubkey) ?? activityProfiles.get(e.pubkey);
			let npub = '';
			try {
				npub = nip19.npubEncode(e.pubkey);
			} catch {
				/* ignore */
			}
			return {
				...c,
				displayName:
					p?.displayName ??
					p?.name ??
					(npub ? `npub1${npub.slice(5, 8)}…${npub.slice(-6)}` : e.pubkey.slice(0, 8)),
				avatarUrl: p?.picture ?? null,
				profileUrl: npub ? `/profile/${npub}` : '',
				profileLoading: false
			};
		});
	}

	async function handleActivityThreadReply(rootPostId, rootPostPubkey, e) {
		if (!e?.text?.trim()) return;
		if (threadModalAddrATag) {
			const parts = threadModalAddrATag.split(':');
			const kindNum = parseInt(parts[0] ?? '', 10);
			const pubkey = parts[1];
			const identifier = parts.slice(2).join(':');
			if (
				!pubkey ||
				!identifier ||
				(kindNum !== EVENT_KINDS.APP && kindNum !== EVENT_KINDS.APP_STACK)
			)
				return;
			const contentType = kindNum === EVENT_KINDS.APP ? 'app' : 'stack';
			const signed = await publishComment(
				e.text,
				{ contentType, pubkey, identifier },
				signEvent,
				e.emojiTags ?? [],
				e.parentId ?? null,
				e.replyToPubkey ?? null,
				e.parentKind ?? EVENT_KINDS.COMMENT,
				e.mentions ?? [],
				COMMENT_PUBLISH_RELAYS,
				e.mediaUrls ?? []
			);
			const parsed = parseComment(signed);
			let npub = '';
			try {
				npub = nip19.npubEncode(signed.pubkey);
			} catch {
				/* ignore */
			}
			const profile = activityProfiles.get(signed.pubkey);
			selectedThreadComments = [
				...selectedThreadComments,
				{
					...parsed,
					displayName:
						profile?.displayName ??
						profile?.name ??
						(npub ? `npub1${npub.slice(5, 8)}…${npub.slice(-6)}` : signed.pubkey.slice(0, 8)),
					avatarUrl: profile?.picture ?? null,
					profileUrl: npub ? `/profile/${npub}` : '',
					profileLoading: false
				}
			];
			if (inboxEmbed && inboxUserPubkey) void seedInboxFromRelay(inboxUserPubkey);
			else void seedActivityFromRelay();
			return;
		}
		if (!rootPostId) return;
		const signed = await publishComment(
			e.text,
			{
				contentType: 'forum',
				pubkey: rootPostPubkey,
				id: rootPostId,
				kind: EVENT_KINDS.FORUM_POST
			},
			signEvent,
			e.emojiTags ?? [],
			e.parentId ?? null,
			e.replyToPubkey ?? null,
			e.parentKind ?? EVENT_KINDS.COMMENT,
			e.mentions ?? [],
			COMMENT_PUBLISH_RELAYS,
			e.mediaUrls ?? []
		);
		const parsed = parseComment(signed);
		let npub = '';
		try {
			npub = nip19.npubEncode(signed.pubkey);
		} catch {
			/* ignore */
		}
		const profile = activityProfiles.get(signed.pubkey);
		selectedThreadComments = [
			...selectedThreadComments,
			{
				...parsed,
				displayName:
					profile?.displayName ??
					profile?.name ??
					(npub ? `npub1${npub.slice(5, 8)}…${npub.slice(-6)}` : signed.pubkey.slice(0, 8)),
				avatarUrl: profile?.picture ?? null,
				profileUrl: npub ? `/profile/${npub}` : '',
				profileLoading: false
			}
		];
		if (inboxEmbed && inboxUserPubkey) void seedInboxFromRelay(inboxUserPubkey);
		else void seedActivityFromRelay();
	}

	function openZapThreadForum(zapEvent, withReply = false, opts = {}) {
		const openActionsSheet = opts?.openActionsSheet === true;
		threadOpenFeedZapOnly = false;
		pendingZapCommentEv = null;
		threadOpenActionsOnMount = openActionsSheet;
		if (openActionsSheet) {
			threadOpenFeedActionsOnly = true;
			standaloneActionsOpenKey++;
		} else {
			threadOpenFeedActionsOnly = false;
		}
		threadInitialActionsTarget = openActionsSheet ? 'root' : null;
		pendingActionsCommentEv = null;

		let p;
		try {
			p = parseZapReceipt(zapEvent);
		} catch {
			threadOpenActionsOnMount = false;
			threadOpenFeedActionsOnly = false;
			threadInitialActionsTarget = null;
			return;
		}
		const aAddr = addrATagForAppStackZap(zapEvent, p);
		if (aAddr) {
			threadLoadGen++;
			const gen = threadLoadGen;
			openReplyOnMount = withReply;
			selectedThreadComments = [];
			selectedThreadZaps = [];
			threadModalKind = 'zap';
			threadModalRootId = null;
			threadModalRootEvent = null;
			threadModalAddrATag = aAddr;
			initialReplyTargetForModal = null;
			threadModalZapId = zapEvent.id;
			threadModalZapEvent = zapEvent;
			loadZapAddrThread(zapEvent.id, aAddr, gen);
			return;
		}

		const postId = forumPostIdForZapParsed(p);
		if (!postId) {
			threadOpenActionsOnMount = false;
			threadOpenFeedActionsOnly = false;
			threadInitialActionsTarget = null;
			return;
		}

		threadLoadGen++;
		const gen = threadLoadGen;
		openReplyOnMount = withReply;
		selectedThreadComments = [];
		selectedThreadZaps = [];
		threadModalKind = 'zap';
		threadModalRootId = null;
		threadModalRootEvent = null;
		threadModalAddrATag = null;
		initialReplyTargetForModal = null;
		threadModalZapId = zapEvent.id;
		threadModalZapEvent = zapEvent;

		loadZapForumThread(postId, zapEvent.id, gen);
	}

	async function loadZapForumThread(postId, zapId, gen) {
		try {
			const [lower, upper] = await Promise.all([
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#E': [postId], limit: 300 }),
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#e': [postId], limit: 300 })
			]);
			const merged = [];
			const seen = new Set();
			for (const e of [...lower, ...upper]) {
				if (!seen.has(e.id)) {
					seen.add(e.id);
					merged.push(e);
				}
			}
			const eTargets = [...new Set([postId, ...merged.map((c) => c.id)])];
			const [zLo, zUp] = await Promise.all([
				queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#e': eTargets, limit: 400 }),
				queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#E': eTargets, limit: 400 })
			]);
			const zMap = new Map();
			for (const z of [...zLo, ...zUp]) zMap.set(z.id, z);
			let poolZaps = Array.from(zMap.values());

			const zLower = zapId.toLowerCase();
			let commThread = collectCommentsUnderParent(zLower, merged);
			let zapThread = collectZapReceiptsUnderZap(zLower, poolZaps);

			fetchKind1111ByTagRef([ZAPSTORE_RELAY], 'e', postId, {
				since: activityRelaySince(),
				limit: 300,
				timeout: 5000,
				feature: 'activity-zap-thread-comments'
			})
				.then(async (relayComments) => {
					const pool = [...merged];
					for (const e of relayComments) {
						if (!pool.some((x) => x.id === e.id)) pool.push(e);
					}
					const et2 = [...new Set([postId, ...pool.map((c) => c.id)])];
					const rs = activityRelaySince();
					const zz = await fetchKind9735MatchingRefs(
						[ZAPSTORE_RELAY],
						{ eventIds: et2 },
						{ since: rs, limit: 400, timeout: 5000, feature: 'activity-zap-thread-zaps' }
					).catch(() => []);
					for (const z of zz) {
						if (!poolZaps.some((x) => x.id === z.id)) poolZaps.push(z);
					}
					await putEvents([...pool, ...poolZaps]).catch(() => {});
					if (gen !== threadLoadGen) return;
					commThread = collectCommentsUnderParent(zLower, pool);
					zapThread = collectZapReceiptsUnderZap(zLower, poolZaps);
					await enrichZapForumModalThread(zapId, gen, commThread, zapThread);
				})
				.catch(() => {});

			await enrichZapForumModalThread(zapId, gen, commThread, zapThread);
		} catch (err) {
			console.error('[Activity] zap thread load failed', err);
		}
	}

	async function loadZapAddrThread(zapId, aRoot, gen) {
		try {
			const mergeComments = async () => {
				const [lo, up] = await Promise.all([
					queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#A': [aRoot], limit: 500 }),
					queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#a': [aRoot], limit: 500 })
				]);
				const m = new Map();
				for (const e of [...lo, ...up]) m.set(e.id, e);
				return Array.from(m.values());
			};
			const mergeZaps = async () => {
				const [lo, up] = await Promise.all([
					queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#A': [aRoot], limit: 400 }),
					queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#a': [aRoot], limit: 400 })
				]);
				const m = new Map();
				for (const e of [...lo, ...up]) m.set(e.id, e);
				return Array.from(m.values());
			};
			const [poolComments, poolZaps] = await Promise.all([mergeComments(), mergeZaps()]);
			const zLower = zapId.toLowerCase();
			let commThread = collectCommentsUnderParent(zLower, poolComments);
			let zapThread = collectZapReceiptsUnderZap(zLower, poolZaps);

			Promise.all([
				fetchKind1111ByTagRef([ZAPSTORE_RELAY], 'a', aRoot, {
					since: activityRelaySince(),
					limit: 500,
					timeout: 5000,
					feature: 'activity-zap-addr-comments'
				}),
				fetchKind9735MatchingRefs(
					[ZAPSTORE_RELAY],
					{ aTag: aRoot },
					{
						since: activityRelaySince(),
						limit: 400,
						timeout: 5000,
						feature: 'activity-zap-addr-zaps'
					}
				)
			])
				.then(async ([cRelay, zRelay]) => {
					const pc = [...poolComments];
					const pz = [...poolZaps];
					for (const e of cRelay) {
						if (!pc.some((x) => x.id === e.id)) pc.push(e);
					}
					for (const e of zRelay) {
						if (!pz.some((x) => x.id === e.id)) pz.push(e);
					}
					await putEvents([...pc, ...pz]).catch(() => {});
					if (gen !== threadLoadGen) return;
					commThread = collectCommentsUnderParent(zLower, pc);
					zapThread = collectZapReceiptsUnderZap(zLower, pz);
					await enrichZapForumModalThread(zapId, gen, commThread, zapThread);
				})
				.catch(() => {});

			await enrichZapForumModalThread(zapId, gen, commThread, zapThread);
		} catch (err) {
			console.error('[Activity] addr zap thread load failed', err);
		}
	}

	async function enrichZapForumModalThread(zapRootId, gen, commentEvents, zapReceiptEvents) {
		const pks = [
			...new Set([
				...commentEvents.map((e) => e.pubkey),
				...zapReceiptEvents
					.map((ev) => {
						try {
							return parseZapReceipt(ev).senderPubkey;
						} catch {
							return null;
						}
					})
					.filter(Boolean)
			])
		];
		const profileResults = await fetchProfilesBatch(pks, { timeout: 4000 }).catch(() => new Map());
		const profileMap = new Map();
		for (const [pk, ev] of profileResults) {
			if (ev?.content) {
				try {
					const j = JSON.parse(ev.content);
					profileMap.set(pk, {
						displayName: j.display_name ?? j.name,
						name: j.name,
						picture: j.picture
					});
				} catch {
					/* ignore */
				}
			}
		}
		if (
			gen !== threadLoadGen ||
			(threadModalZapId ?? '').toLowerCase() !== (zapRootId ?? '').toLowerCase()
		)
			return;

		const commentsEnriched = commentEvents
			.map((e) => {
				const c = parseComment(e);
				const p = profileMap.get(e.pubkey) ?? activityProfiles.get(e.pubkey);
				let npub = '';
				try {
					npub = nip19.npubEncode(e.pubkey);
				} catch {
					/* ignore */
				}
				return {
					...c,
					displayName:
						p?.displayName ??
						p?.name ??
						(npub ? `npub1${npub.slice(5, 8)}…${npub.slice(-6)}` : e.pubkey.slice(0, 8)),
					avatarUrl: p?.picture ?? null,
					profileUrl: npub ? `/profile/${npub}` : '',
					profileLoading: false
				};
			})
			.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

		const zapsEnriched = zapReceiptEvents
			.map((ev) => {
				const z = parseZapReceipt(ev);
				const p = z.senderPubkey
					? (profileMap.get(z.senderPubkey) ?? activityProfiles.get(z.senderPubkey))
					: null;
				let npub = '';
				try {
					if (z.senderPubkey) npub = nip19.npubEncode(z.senderPubkey);
				} catch {
					/* ignore */
				}
				return {
					...z,
					id: ev.id,
					displayName:
						p?.displayName ??
						p?.name ??
						(npub
							? `npub1${npub.slice(5, 8)}…${npub.slice(-6)}`
							: (z.senderPubkey ?? '').slice(0, 8)),
					avatarUrl: p?.picture ?? null,
					profileUrl: npub ? `/profile/${npub}` : '',
					timestamp: z.createdAt,
					senderPubkey: z.senderPubkey
				};
			})
			.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

		selectedThreadComments = commentsEnriched;
		selectedThreadZaps = zapsEnriched;
	}

	$effect(() => {
		if (!browser) return;
		if (inboxEmbed) {
			activityReady = !!(inboxUserPubkey && inboxActive);
			if (activityReady && inboxUserPubkey) void seedInboxFromRelay(inboxUserPubkey);
			return;
		}
		if (!activityRouteActive) return;
		activityReady = true;
		activityInitialSeedDone = false;
		void seedActivityFromRelay();
	});

</script>

<div class="community-shell-root">
	<div class="community-shell-scroll" class:activity-inbox-scroll={inboxEmbed}>
<div
	class="panel-content activity-panel"
	class:activity-panel--inbox={inboxEmbed}
	class:scroll-locked={threadModalKind === 'comment'
		? !!threadModalRootId
		: threadModalKind === 'zap'
			? !!threadModalZapId
			: false}
>
	{#if !activityReady || !activityFeedQuerySettled || (!inboxEmbed && activityFeedItems.length === 0 && !activityHadCachedData && (!activityInitialSeedDone || activityLoading))}
		<div class="loading-wrap">
			<ActivityFeedSkeleton rows={6} />
		</div>
	{:else if activityError && activityFeedItems.length === 0}
		<div class="empty-state-wrap">
			<EmptyState message={activityError} minHeight={280} />
		</div>
	{:else if activityFeedItems.length === 0}
		<div class="empty-state-wrap">
			<EmptyState
				message={inboxUserPubkey ? 'Your inbox is empty' : 'No Activity yet'}
				minHeight={280}
			/>
		</div>
	{:else}
		<div class="activity-list">
			{#each activityFeedItems as item (item.kind === 'zap' ? `zap-${item.row.event.id}` : item.ev.id)}
				{#if item.kind === 'comment'}
					{@const commentEv = item.ev}
					{@const authorProfileRaw = activityProfiles.get(commentEv.pubkey)}
					{@const authorProfile = authorProfileRaw
						? {
								name: authorProfileRaw.displayName ?? authorProfileRaw.name,
								picture: authorProfileRaw.picture,
								pubkey: commentEv.pubkey
							}
						: { name: '', picture: '', pubkey: commentEv.pubkey }}
					{@const addrRootVal = addrTagFromComment(commentEv)}
					{@const eRootTag = commentEv.tags?.find((t) => t[0] === 'E' && t[1])}
					{@const rootKey = eRootTag?.[1] ?? null}
					{@const rootEvent =
						isAddressableActivityATag(addrRootVal) && addrRootVal
							? (activityAddrRootEvents.get(addrRootVal) ?? null)
							: rootKey
								? (activityRootEvents.get(rootKey) ??
									activityRootEvents.get(rootKey.toLowerCase()) ??
									null)
								: null}
					{@const feedAddrBadge = appBadgeFromAddrRoot(rootEvent)}
					{@const eParentTag = commentEv.tags?.find((t) => t[0] === 'e' && t[1])}
					{@const parentId = eParentTag?.[1] && eParentTag[1] !== rootKey ? eParentTag[1] : null}
					{@const parentComment = parentId
						? (activityCommentMap.get(parentId) ??
							activityCommentMap.get(parentId.toLowerCase()) ??
							null)
						: null}
					{@const parentAuthorRaw = parentComment
						? activityProfiles.get(parentComment.pubkey)
						: null}
					{@const parentCommentAuthor =
						parentComment && parentAuthorRaw
							? {
									name: parentAuthorRaw.displayName ?? parentAuthorRaw.name,
									picture: parentAuthorRaw.picture,
									pubkey: parentComment.pubkey
								}
							: null}
					{@const parentZapEv =
						!parentComment && parentId
							? (activityZapMap.get(parentId) ?? activityZapMap.get(parentId.toLowerCase()) ?? null)
							: null}
					{@const parentZapParsed = (() => {
						if (!parentZapEv) return null;
						try {
							return parseZapReceipt(parentZapEv);
						} catch {
							return null;
						}
					})()}
					{@const parentZapperRaw = parentZapParsed?.senderPubkey
						? activityProfiles.get(parentZapParsed.senderPubkey)
						: null}
					{@const parentZapperAuthor = parentZapParsed?.senderPubkey
						? {
								name: parentZapperRaw?.displayName ?? parentZapperRaw?.name ?? '',
								picture: parentZapperRaw?.picture ?? null,
								pubkey: parentZapParsed.senderPubkey
							}
						: null}
					{@const authorNpub = (() => {
						try {
							return nip19.npubEncode(commentEv.pubkey);
						} catch {
							return '';
						}
					})()}
					{@const _isDeeperReply = !!parentId}
					{@const expectsActivityRoot =
						(!!addrRootVal && isAddressableActivityATag(addrRootVal)) || !!rootKey}
					{@const rootMeta = activityRootKeyMetaFromComment(commentEv)}
					{@const deletedRootKind = rootMeta
						? (activityRootDeletedByKey.get(rootMeta.key) ?? null)
						: null}
					{@const rootBadgeSkeleton = !rootEvent && expectsActivityRoot && !deletedRootKind}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div
						class="activity-item"
						role="button"
						tabindex="0"
						onclick={() => {
							markInboxCardSeen(commentEv.id);
							openThread(commentEv);
						}}
						onkeydown={(e) => {
							if (e.key !== 'Enter') return;
							markInboxCardSeen(commentEv.id);
							openThread(commentEv);
						}}
					>
						<CommentCard
							event={commentEv}
							{authorProfile}
							{rootEvent}
							appBadge={feedAddrBadge}
							{rootBadgeSkeleton}
							{deletedRootKind}
							{parentComment}
							{parentCommentAuthor}
							{parentZapParsed}
							{parentZapperAuthor}
							profileUrl={authorNpub ? `/profile/${authorNpub}` : ''}
							resolveMentionLabel={(pk) =>
								activityProfiles.get(pk)?.displayName ??
								activityProfiles.get(pk)?.name ??
								pk?.slice(0, 8) ??
								''}
							onRootClick={rootEvent
								? () => {
										markInboxCardSeen(commentEv.id);
										openRootPost(rootEvent);
									}
								: null}
							showUnreadDot={inboxRowUnread(commentEv.id)}
							feedActions={{
								onReply: () => {
									markInboxCardSeen(commentEv.id);
									openThread(commentEv, true);
								},
								onZap: () => {
									markInboxCardSeen(commentEv.id);
									openThread(commentEv, false, { openZapOnly: true });
								},
								onOptions: () => {
									markInboxCardSeen(commentEv.id);
									openThread(commentEv, false, { openActionsSheet: true });
								}
							}}
						/>
					</div>
				{:else}
					{@const zapEv = item.row.event}
					{@const zParsed = item.row.parsed}
					{@const aZapRoot = addrATagForAppStackZap(zapEv, zParsed)}
					{@const postIdZ = forumPostIdForZapParsed(zParsed)}
					{@const rootEventZ = aZapRoot
						? (activityAddrRootEvents.get(aZapRoot) ?? null)
						: postIdZ
							? (activityRootEvents.get(postIdZ) ??
								activityRootEvents.get(postIdZ.toLowerCase()) ??
								null)
							: null}
					{@const zapAddrBadge = appBadgeFromAddrRoot(rootEventZ)}
					{@const zappedId = zParsed.zappedEventId}
					{@const parentCommentZ = zappedId ? (activityCommentMap.get(zappedId) ?? null) : null}
					{@const parentAuthorRZ = parentCommentZ
						? activityProfiles.get(parentCommentZ.pubkey)
						: null}
					{@const parentCommentAuthorZ =
						parentCommentZ && parentAuthorRZ
							? {
									name: parentAuthorRZ.displayName ?? parentAuthorRZ.name,
									picture: parentAuthorRZ.picture,
									pubkey: parentCommentZ.pubkey
								}
							: null}
					{@const zapperPk = zParsed.senderPubkey}
					{@const zapperProf = zapperPk ? activityProfiles.get(zapperPk) : null}
					{@const zapperAuthor = zapperProf
						? {
								name: zapperProf.displayName ?? zapperProf.name,
								picture: zapperProf.picture,
								pubkey: zapperPk
							}
						: { name: '', picture: '', pubkey: zapperPk ?? '' }}
					{@const zapperNpub = (() => {
						try {
							return zapperPk ? nip19.npubEncode(zapperPk) : '';
						} catch {
							return '';
						}
					})()}
					{@const zapExpectsRoot = !!aZapRoot || !!postIdZ}
					{@const rootMetaZap = activityRootKeyMetaFromZap(
						zapEv,
						zParsed,
						activityRootEvents,
						activityCommentMap
					)}
					{@const deletedRootKindZap = rootMetaZap
						? (activityRootDeletedByKey.get(rootMetaZap.key) ?? null)
						: null}
					{@const rootBadgeSkeletonZap = !rootEventZ && zapExpectsRoot && !deletedRootKindZap}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div
						class="activity-item"
						role="button"
						tabindex="0"
						onclick={() => {
							markInboxCardSeen(zapEv.id);
							openZapThreadForum(zapEv);
						}}
						onkeydown={(e) => {
							if (e.key !== 'Enter') return;
							markInboxCardSeen(zapEv.id);
							openZapThreadForum(zapEv);
						}}
					>
						<ZapActivityCard
							zapEvent={zapEv}
							parsed={zParsed}
							zapperPubkey={zapperPk}
							authorProfile={zapperAuthor}
							rootEvent={rootEventZ}
							parentComment={parentCommentZ}
							parentCommentAuthor={parentCommentAuthorZ}
							appBadge={zapAddrBadge}
							rootBadgeSkeleton={rootBadgeSkeletonZap}
							deletedRootKind={deletedRootKindZap}
							profileUrl={zapperNpub ? `/profile/${zapperNpub}` : ''}
							resolveMentionLabel={(pk) =>
								activityProfiles.get(pk)?.displayName ??
								activityProfiles.get(pk)?.name ??
								pk?.slice(0, 8) ??
								''}
							onRootClick={rootEventZ
								? () => {
										markInboxCardSeen(zapEv.id);
										openRootPost(rootEventZ);
									}
								: null}
							showUnreadDot={inboxRowUnread(zapEv.id)}
							feedActions={{
								onReply: () => {
									markInboxCardSeen(zapEv.id);
									openZapThreadForum(zapEv, true);
								},
								onZap: () => {
									markInboxCardSeen(zapEv.id);
									openZapThreadForum(zapEv);
								},
								onOptions: () => {
									markInboxCardSeen(zapEv.id);
									openZapThreadForum(zapEv, false, { openActionsSheet: true });
								}
							}}
						/>
					</div>
				{/if}
			{/each}
			{#if activityLikelyHasMore}
				<!-- Invisible anchor: intersection observer extends the merged timeline (no separate “load more” UX). -->
				<div
					class="activity-feed-sentinel"
					bind:this={activityLoadSentinel}
					aria-hidden="true"
				></div>
			{/if}
		</div>
	{/if}
</div>
	</div>
</div>

{#if threadModalKind === 'comment' && threadModalRootId && threadModalRootEvent}
	{@const _rootEv = threadModalRootEvent}
	{#key threadModalRootId}
		{@const _eRoot = _rootEv.tags?.find((t) => t[0] === 'E' && t[1])?.[1] ?? null}
		{@const _aRoot = addrTagFromComment(_rootEv)}
		{@const _forumDelKey = _eRoot ? `e:${_eRoot.toLowerCase()}` : null}
		{@const _addrDelKey = isAddressableActivityATag(_aRoot) && _aRoot ? `a:${_aRoot}` : null}
		{@const _rootPost = _eRoot ? (activityRootEvents.get(_eRoot) ?? null) : null}
		{@const _addrBannerEv =
			isAddressableActivityATag(_aRoot) && _aRoot
				? (activityAddrRootEvents.get(_aRoot) ?? null)
				: null}
		{@const _bannerEv = _rootPost ?? _addrBannerEv}
		{@const _bannerOneliner = getEventOneliner(_bannerEv)}
		{@const _bannerHref = hrefForActivityRootEvent(_bannerEv)}
		{@const _bannerBadge = appBadgeFromAddrRoot(_addrBannerEv)}
		{@const _bannerIsStack = _bannerEv?.kind === EVENT_KINDS.APP_STACK}
		{@const _bannerDeletedKind =
			!_bannerEv &&
			((_forumDelKey && activityRootDeletedByKey.get(_forumDelKey)) ||
				(_addrDelKey && activityRootDeletedByKey.get(_addrDelKey)) ||
				null)}
		{@const _authorRaw = activityProfiles.get(_rootEv.pubkey)}
		{@const _authorNpub = (() => {
			try {
				return nip19.npubEncode(_rootEv.pubkey);
			} catch {
				return '';
			}
		})()}
		{@const _postTitle =
			_rootPost?.tags?.find((t) => t[0] === 'title' && t[1])?.[1] ?? 'Forum Post'}
		{@const _evVersion = _rootEv.tags?.find((t) => t[0] === 'v' && t[1])?.[1] ?? ''}
		{@const _labelCommunityPk =
			_rootPost?.kind === EVENT_KINDS.FORUM_POST ? ZAPSTORE_COMMUNITY_PUBKEY : null}
		<RootComment
			hideRoot={true}
			openThreadOnMount={!threadOpenFeedActionsOnly && !threadOpenFeedZapOnly}
			openActionsOnMount={threadOpenActionsOnMount}
			initialActionsTarget={threadInitialActionsTarget}
			standaloneActionsOpenKey={standaloneActionsOpenKey}
			openZapOnMount={threadOpenFeedZapOnly}
			standaloneZapOpenKey={standaloneZapOpenKey}
			feedInitialZapTarget={pendingZapCommentEv ? enrichReplyTargetForModal(pendingZapCommentEv) : null}
			{openReplyOnMount}
			initialReplyTarget={initialReplyTargetForModal}
			modalLockBodyScroll={!inboxEmbed}
			modalZIndex={inboxEmbed ? 130 : 110}
			modalScopedInPanel={inboxEmbed}
			id={_rootEv.id}
			content={_rootEv.content ?? ''}
			version={_evVersion}
			emojiTags={(_rootEv.tags ?? [])
				.filter((t) => t[0] === 'emoji' && t[1] && t[2])
				.map((t) => ({ shortcode: t[1], url: t[2] }))}
			mediaUrls={(_rootEv.tags ?? []).filter((t) => t[0] === 'media' && t[1]).map((t) => t[1])}
			pictureUrl={_authorRaw?.picture ?? null}
			name={_authorRaw?.displayName ??
				_authorRaw?.name ??
				(_authorNpub ? `npub1${_authorNpub.slice(5, 8)}…${_authorNpub.slice(-6)}` : _rootEv.pubkey.slice(0, 8))}
			pubkey={_rootEv.pubkey}
			timestamp={_rootEv.created_at}
			profileUrl={_authorNpub ? `/profile/${_authorNpub}` : ''}
			threadComments={selectedThreadComments}
			threadZaps={[]}
			labelCommunityPubkey={_labelCommunityPk}
			rootContext={_bannerHref
				? {
						label: _rootPost ? _postTitle : _bannerOneliner.label,
						iconUrl: _bannerIsStack
							? null
							: (_bannerBadge?.iconUrl ?? _bannerOneliner.emoji ?? null),
						href: _bannerHref,
						isStack: !!_bannerIsStack
					}
				: _bannerDeletedKind
					? { label: activityDeletedRootLabel(_bannerDeletedKind), deleted: true }
					: null}
			onModalClose={() => {
				threadLoadGen++;
				threadModalKind = null;
				threadModalRootId = null;
				threadModalRootEvent = null;
				threadModalAddrATag = null;
				initialReplyTargetForModal = null;
				threadOpenActionsOnMount = false;
				threadOpenFeedActionsOnly = false;
				threadOpenFeedZapOnly = false;
				threadInitialActionsTarget = null;
				pendingActionsCommentEv = null;
				pendingZapCommentEv = null;
				selectedThreadComments = [];
				selectedThreadZaps = [];
			}}
			{signEvent}
			{searchProfiles}
			{searchEmojis}
			onReplySubmit={threadModalAddrATag
				? (e) => handleActivityThreadReply(null, null, e)
				: _rootPost
					? (e) => handleActivityThreadReply(_rootPost.id, _rootPost.pubkey, e)
					: undefined}
			onZapReceived={() => {}}
			onGetStarted={() => {}}
		/>
	{/key}
{/if}

{#if threadModalKind === 'zap' && threadModalZapId && threadModalZapEvent}
	{@const _zEv = threadModalZapEvent}
	{@const _zParsed = parseZapReceipt(_zEv)}
	{@const _aZap = addrATagForAppStackZap(_zEv, _zParsed)}
	{@const _postIdZ = forumPostIdForZapParsed(_zParsed)}
	{@const _rootPostZ = _aZap
		? (activityAddrRootEvents.get(_aZap) ?? null)
		: _postIdZ
			? (activityRootEvents.get(_postIdZ) ?? activityRootEvents.get(_postIdZ.toLowerCase()) ?? null)
			: null}
	{@const _zapperRaw = _zParsed.senderPubkey ? activityProfiles.get(_zParsed.senderPubkey) : null}
	{@const _zapperNpubZ = (() => {
		try {
			return _zParsed.senderPubkey ? nip19.npubEncode(_zParsed.senderPubkey) : '';
		} catch {
			return '';
		}
	})()}
	{@const _zapBadgeZ = appBadgeFromAddrRoot(_rootPostZ)}
	{@const _bannerIsStackZ = _rootPostZ?.kind === EVENT_KINDS.APP_STACK}
	{@const _bannerOnelinerZ = getEventOneliner(_rootPostZ)}
	{@const _bannerHrefZ = hrefForActivityRootEvent(_rootPostZ)}
	{@const _postTitleZ =
		_rootPostZ?.kind === EVENT_KINDS.FORUM_POST
			? (_rootPostZ.tags?.find((t) => t[0] === 'title' && t[1])?.[1] ?? 'Forum Post')
			: _bannerOnelinerZ.label}
	{@const _zapBannerDeletedKind =
		!_rootPostZ &&
		((_postIdZ && activityRootDeletedByKey.get(`e:${_postIdZ.toLowerCase()}`)) ||
			(_aZap && isAddressableActivityATag(_aZap) && activityRootDeletedByKey.get(`a:${_aZap}`)) ||
			null)}
	{@const _labelCommunityZ =
		_rootPostZ?.kind === EVENT_KINDS.FORUM_POST ? ZAPSTORE_COMMUNITY_PUBKEY : null}
	{#key threadModalZapId}
		<RootComment
			hideRoot={true}
			openThreadOnMount={!threadOpenFeedActionsOnly && !threadOpenFeedZapOnly}
			openActionsOnMount={threadOpenActionsOnMount}
			initialActionsTarget={threadInitialActionsTarget}
			standaloneActionsOpenKey={standaloneActionsOpenKey}
			openZapOnMount={threadOpenFeedZapOnly}
			standaloneZapOpenKey={standaloneZapOpenKey}
			feedInitialZapTarget={pendingZapCommentEv ? enrichReplyTargetForModal(pendingZapCommentEv) : null}
			{openReplyOnMount}
			initialReplyTarget={initialReplyTargetForModal}
			modalLockBodyScroll={!inboxEmbed}
			modalZIndex={inboxEmbed ? 130 : 110}
			modalScopedInPanel={inboxEmbed}
			isZapRoot={true}
			id={_zEv.id}
			content={_zParsed.comment ?? ''}
			zapAmount={_zParsed.amountSats ?? 0}
			emojiTags={_zParsed.emojiTags ?? []}
			mediaUrls={[]}
			pictureUrl={_zapperRaw?.picture ?? null}
			name={_zapperRaw?.displayName ??
				_zapperRaw?.name ??
				(_zapperNpubZ ? `npub1${_zapperNpubZ.slice(5, 8)}…${_zapperNpubZ.slice(-6)}` : '')}
			pubkey={_zParsed.senderPubkey ?? ''}
			timestamp={_zEv.created_at}
			profileUrl={_zapperNpubZ ? `/profile/${_zapperNpubZ}` : ''}
			authorPubkey={_rootPostZ?.pubkey ?? ''}
			threadComments={selectedThreadComments}
			threadZaps={selectedThreadZaps}
			labelCommunityPubkey={_labelCommunityZ}
			appIconUrl={_zapBadgeZ?.iconUrl ?? null}
			appName={_zapBadgeZ?.name ?? ''}
			appIdentifier={_zapBadgeZ?.identifier ?? ''}
			version=""
			rootContext={_bannerHrefZ
				? {
						label: _postTitleZ,
						iconUrl: _bannerIsStackZ
							? null
							: (_zapBadgeZ?.iconUrl ?? _bannerOnelinerZ.emoji ?? null),
						href: _bannerHrefZ,
						isStack: !!_bannerIsStackZ
					}
				: _zapBannerDeletedKind
					? { label: activityDeletedRootLabel(_zapBannerDeletedKind), deleted: true }
					: null}
			onModalClose={() => {
				threadLoadGen++;
				threadModalKind = null;
				threadModalZapId = null;
				threadModalZapEvent = null;
				threadModalAddrATag = null;
				initialReplyTargetForModal = null;
				threadOpenActionsOnMount = false;
				threadOpenFeedActionsOnly = false;
				threadOpenFeedZapOnly = false;
				threadInitialActionsTarget = null;
				pendingActionsCommentEv = null;
				pendingZapCommentEv = null;
				selectedThreadComments = [];
				selectedThreadZaps = [];
			}}
			{signEvent}
			{searchProfiles}
			{searchEmojis}
			onReplySubmit={threadModalAddrATag
				? (e) => handleActivityThreadReply(null, null, e)
				: _rootPostZ?.kind === EVENT_KINDS.FORUM_POST
					? (e) => handleActivityThreadReply(_rootPostZ.id, _rootPostZ.pubkey, e)
					: undefined}
			onZapReceived={() => {}}
			onGetStarted={() => {}}
		/>
	{/key}
{/if}

<style>
	.community-shell-root {
		flex: 1;
		min-height: 0;
		min-width: 0;
		width: 100%;
		display: flex;
		flex-direction: column;
	}

	/* Non-inbox: pass-through so .panel-content stays the flex child of the page */
	.community-shell-scroll:not(.activity-inbox-scroll) {
		display: contents;
	}

	.activity-inbox-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
	}

	.panel-content {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-content.activity-panel--inbox {
		flex: none;
		min-height: 0;
		overflow: visible;
	}

	.activity-panel {
		overflow-y: auto;
	}

	.activity-panel--inbox {
		overflow: visible;
		background: transparent;
	}

	.activity-panel--inbox .activity-list {
		padding: 0 0 8px;
	}

	/* Full-bleed dividers; same horizontal inset as main activity feed */
	.activity-panel--inbox .activity-item {
		padding: 12px 16px;
	}

	.activity-panel--inbox .empty-state-wrap {
		padding: 16px 0 0;
	}

	.activity-panel.scroll-locked {
		overflow-y: hidden;
	}

	.loading-wrap {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		justify-content: flex-start;
		min-height: 280px;
		width: 100%;
	}

	.empty-state-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		gap: 12px;
		padding: 16px 16px 0;
		width: 100%;
		box-sizing: border-box;
	}

	.activity-list {
		display: flex;
		flex-direction: column;
		padding: 0 0 16px;
	}

	.activity-item {
		padding: 12px 16px;
		border-bottom: 1px solid hsl(var(--white11));
		cursor: pointer;
	}

	.activity-item:last-child {
		border-bottom: none;
	}

	.activity-feed-sentinel {
		height: 1px;
		width: 100%;
		flex-shrink: 0;
		pointer-events: none;
	}
</style>
