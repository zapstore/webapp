<script lang="js">
	/**
	 * Activity: local-first from Dexie. Relay `since` is unified via {@link activityRelaySince}.
	 * **Activity tab** list: kind **1111** only (plain comments + z-wrappers); no bulk 9735 in the feed.
	 * **Inbox embed** (`#p`): kind **1111** plus raw **9735** zap receipts (seed + Dexie merge).
	 * Scroll sentinel extends the window; no “load more” button.
	 */
	import { browser } from '$app/environment';
	import { tick, untrack } from 'svelte';
	import { page } from '$app/stores';
	import { nip19 } from 'nostr-tools';
	import {
		fetchFromRelays,
		fetchKind1111ByTagRef,
		fetchKind1111ReferencingEventIds,
		fetchKind9735MatchingRefs,
		fetchProfilesBatch,
		hydrateFilters,
		putEvents,
		queryEvents,
		queryEvent,
		queryProfilesForPubkeys,
		liveQuery,
		parseComment,
		parseZapReceipt,
		publishComment,
		isUserInboxLiveUpdatesActive
	} from '$lib/purpleweb';
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
	import {
		parseProfile,
		parseApp,
		parseAppStack,
		parseForumPost,
		getEventOneliner
	} from '$lib/nostr/models';
	import {
		EVENT_KINDS,
		SAVED_APPS_STACK_D_TAG,
		COMMENT_PUBLISH_RELAYS,
		PROFILE_FETCH_RELAYS,
		commentZapRelayReadSince,
		ZAPSTORE_COMMUNITY_PUBKEY,
		ZAPSTORE_RELAY
	} from '$lib/config';
	import { goto } from '$app/navigation';
	import { setCached } from '$lib/stores/query-cache.js';
	import RelayLoadingBar from '$lib/components/common/RelayLoadingBar.svelte';
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

	// App/stack/comment events live only on the zapstore relay — vertexlab is profiles-only.
	const ACTIVITY_CATALOG_RELAYS = [ZAPSTORE_RELAY];

	/** Embedded header inbox: #p-filtered feed + same thread modals as Activity. */
	let {
		inboxUserPubkey = null,
		inboxEmbed = false,
		inboxActive = true,
		/** Called when user taps "Mark All as Read"; parent can use this to update UI. */
		onMarkAllRead = null,
		/** Called with (loading: boolean) when the inbox relay fetch starts/ends. */
		onRelayLoadingChange = null
	} = $props();

	/** Re-seed when user opens Activity (shell can stay mounted while they use Forum). */
	const activityRouteActive = $derived(
		$page.url.pathname === '/community/activity' ||
			$page.url.pathname.startsWith('/community/activity/')
	);

	/** Initial visible window — scroll sentinel extends it. Start small; first paint is the bottleneck. */
	let activityFeedVisibleLimit = $state(30);
	const ACTIVITY_FEED_VISIBLE_MAX = 2500;
	/** `queryEvents({ ids })` batch size — avoid huge `anyOf` lists. */
	const ACTIVITY_IDS_CHUNK = 80;
	/** Batch `authors` + `#d` addr-root lookups (Dexie + relay). */
	const ACTIVITY_ADDR_D_CHUNK = 45;
	/**
	 * Same `since` as live subs + other comment/zap reads (`COMMENT_ZAP_RELAY_READ_LOOKBACK_SEC`).
	 * Kind 1111/9735 never use `#f` — only catalog app/stack roots do (`PLATFORM_FILTER`).
	 */
	/** Safety cap for bulk 1111/9735 one-shots. */
	const ACTIVITY_BULK_RELAY_TIMEOUT_MS = 12_000;
	/** Keep first seed tight; scroll/backfill handles deeper history. */
	const ACTIVITY_INITIAL_SEED_LIMIT = 60;
	/**
	 * After Dexie + relay root fetch (~4s) still no root event — treat as likely deleted; show label, don't block feed.
	 */
	const ACTIVITY_ROOT_MISSING_AFTER_MS = 14000;

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
	 * Parse a kind-1111 z-wrapper event into the same shape as parseZapReceipt output.
	 * Returns null when the event has no valid `z` tag (i.e. it is a plain comment, not a wrapper).
	 * @param {import('nostr-tools').NostrEvent} ev
	 * @returns {{ senderPubkey: string, recipientPubkey: string|null, amountSats: number, comment: string, emojiTags: {shortcode:string,url:string}[], createdAt: number, zappedEventId: string|null, zapReceiptId: string } | null}
	 */
	function parseZapWrapper(ev) {
		const zTag = ev.tags?.find((t) => t[0] === 'z' && typeof t[1] === 'string' && t[1]);
		if (!zTag) return null;
		const receiptId = String(zTag[1]).trim().toLowerCase();
		if (!/^[a-f0-9]{64}$/.test(receiptId)) return null;

		// Amount: ['z', receiptId, hint, amount, unit]
		let amountSats = 0;
		const amtStr = String(zTag[3] ?? '').trim();
		if (amtStr) {
			const unit = String(zTag[4] ?? 'sats').trim().toLowerCase();
			const n = parseFloat(amtStr);
			if (Number.isFinite(n) && n > 0) {
				amountSats = unit === 'msats' || unit === 'msat' ? Math.round(n / 1000) : Math.round(n);
			}
		}
		// Recipient: uppercase P tag (root author per NIP-22)
		const recipientPubkey = ev.tags?.find((t) => t[0] === 'P' && t[1])?.[1]?.toLowerCase() ?? null;
		// Zapped event: lowercase e tag (the thing being zapped, for root tracing)
		const zappedEventId = ev.tags?.find((t) => t[0] === 'e' && t[1])?.[1]?.toLowerCase() ?? null;
		const emojiTags = [];
		for (const t of ev.tags ?? []) {
			if (t[0] === 'emoji' && t[1] && t[2]) emojiTags.push({ shortcode: t[1], url: t[2] });
		}
		return {
			senderPubkey: ev.pubkey,
			recipientPubkey,
			amountSats,
			comment: ev.content ?? '',
			emojiTags,
			createdAt: ev.created_at,
			zappedEventId,
			zapReceiptId: receiptId
		};
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
	 * Forum kind-11 roots: one batch Dexie lookup using the uppercase E tag.
	 * NIP-22 mandates uppercase E → root event ID. We trust it and do a single
	 * batch lookup. If the ID isn't a kind-11 post (or isn't in Dexie), the card
	 * shows the "root not found" state after the timeout — no chain traversal.
	 * @param {import('nostr-tools').NostrEvent[]} comments
	 * @param {import('nostr-tools').NostrEvent[]} zaps
	 */
	async function batchResolveForumRootsByIdFromDexie(comments, zaps) {
		/** @type {Map<string, import('nostr-tools').NostrEvent>} */
		const forumRootById = new Map();
		const pending = new Set();
		for (const c of comments) {
			const id = c.tags?.find((t) => t[0] === 'E' && t[1])?.[1];
			if (id) pending.add(id.toLowerCase());
		}
		for (const z of zaps) {
			const zw = parseZapWrapper(z);
			if (zw?.zappedEventId) {
				pending.add(zw.zappedEventId.toLowerCase());
			} else {
				try {
					const p = parseZapReceipt(z);
					if (p.zappedEventId) pending.add(p.zappedEventId.toLowerCase());
				} catch { /* skip */ }
			}
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
			if ((name === 'a' || name === 'A') && isAddressableActivityATag(val) && aTags.has(low)) {
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
		const posts = await queryEvents({ kinds: [EVENT_KINDS.FORUM_POST], limit: 400 }).catch(
			() => []
		);
		for (const fp of posts) {
			if (fp?.id) refIds.add(fp.id.toLowerCase());
		}
	}

	/**
	 * Full iterative zap filter for relay-fetched results (not for liveQuery).
	 * Use the indexed liveQuery path (#K + #a) for Dexie reads; this runs only in backfill/seed.
	 * @param {import('nostr-tools').NostrEvent[]} zapRows
	 * @param {import('nostr-tools').NostrEvent[]} scopedComments
	 */
	async function _filterZapsForActivityFeed(zapRows, scopedComments) {
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
	let activityRootDeletedByKey = $state(
		/** @type {Map<string, 'forum' | 'app' | 'stack'>} */ (new Map())
	);

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

	const activityProfilePubkeys = $derived.by(() => {
		const pks = new Set();
		for (const item of activityFeedItems) {
			if (item.kind === 'comment') {
				const pk = item.ev.pubkey?.toLowerCase();
				if (pk) pks.add(pk);
				const parentTag = item.ev.tags?.find((t) => t[0] === 'e' && t[1]);
				if (parentTag?.[1]) {
					const parent =
						activityCommentMap.get(parentTag[1]) ??
						activityCommentMap.get(parentTag[1].toLowerCase());
					if (parent?.pubkey) pks.add(parent.pubkey.toLowerCase());
				}
			} else if (item.kind === 'zap') {
				const sp = item.row.parsed.senderPubkey?.toLowerCase();
				if (sp) pks.add(sp);
			}
		}
		for (const ev of activityThreadComments) {
			if (ev.pubkey) pks.add(ev.pubkey.toLowerCase());
		}
		for (const ev of activityThreadZaps) {
			const zw = parseZapWrapper(ev);
			const sp =
				zw?.senderPubkey ??
				(() => {
					try {
						return parseZapReceipt(ev).senderPubkey;
					} catch {
						return null;
					}
				})();
			if (sp) pks.add(sp.toLowerCase());
		}
		for (const ev of activityRootEvents.values()) {
			if (ev.pubkey) pks.add(ev.pubkey.toLowerCase());
		}
		for (const ev of activityAddrRootEvents.values()) {
			if (ev.pubkey) pks.add(ev.pubkey.toLowerCase());
		}
		return [...pks];
	});

	$effect(() => {
		if (!browser) return;
		const pubkeys = activityProfilePubkeys;
		if (pubkeys.length === 0) {
			activityProfiles = new Map();
			return;
		}
		const hydrated = Object.create(null);
		const observable = liveQuery(() => queryProfilesForPubkeys(pubkeys));
		const sub = observable.subscribe({
			next({ profiles, missingProfilePubkeys }) {
				const m = new Map();
				for (const [pk, profile] of Object.entries(profiles ?? {})) {
					m.set(pk, profile);
				}
				activityProfiles = m;
				if (!isOnline()) return;
				const missing = (missingProfilePubkeys ?? []).filter((pk) => !hydrated[pk]);
				if (missing.length === 0) return;
				for (const pk of missing) hydrated[pk] = true;
				hydrateFilters(
					PROFILE_FETCH_RELAYS,
					{ kinds: [EVENT_KINDS.PROFILE], authors: missing, limit: missing.length * 2 },
					{ timeout: 4000, feature: 'activity-profiles' }
				).catch(() => {});
			}
		});
		return () => sub.unsubscribe();
	});

	/** Parsed zap events (both z-wrappers and raw kind 9735) for deleted-root logic and sorting. */
	const activityZapsForFeed = $derived.by(() => {
		const rows = [];
		for (const ev of activityThreadZaps) {
			const zp = parseZapWrapper(ev);
			if (zp) {
				rows.push({ event: ev, parsed: zp });
			} else {
				try {
					const p = parseZapReceipt(ev);
					rows.push({ event: ev, parsed: p });
				} catch { continue; }
			}
		}
		return rows.sort((a, b) => b.event.created_at - a.event.created_at);
	});

	$effect(() => {
		if (!browser || !activityReady || (!inboxEmbed && !activityRouteActive)) return;
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
			const next = recomputeActivityRootDeleted(
				roots,
				addrRoots,
				comments,
				zapsForFeed,
				commentMap,
				readyForDeletedTimer
			);
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
		activityFeedItems.length > 0 &&
			activityFeedVisibleLimit < ACTIVITY_FEED_VISIBLE_MAX &&
			(activityHasMoreTimeline || (!inboxUserPubkey && activityBackfillInFlight))
	);

	function loadMoreActivity() {
		activityFeedVisibleLimit = Math.min(ACTIVITY_FEED_VISIBLE_MAX, activityFeedVisibleLimit + 160);
		if (!inboxUserPubkey && activityRouteActive) void seedActivityFromRelay();
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

	/**
	 * Fallback inbox relay seed when background inbox live subs are not running (e.g. before
	 * auth hydrates). While signed in + online, `ensureUserInboxLiveUpdates` backfills once and
	 * streams new `#p` events — header popover reads Dexie via liveQuery instead of re-seeding.
	 */
	let _inboxSeedFlight = /** @type {Promise<void> | null} */ (null);

	async function seedInboxFromRelay(pk) {
		if (!browser || !pk) return;
		if (isUserInboxLiveUpdatesActive(pk)) return;
		if (_inboxSeedFlight) return _inboxSeedFlight;

		_inboxSeedFlight = (async () => {
			activityLoading = true;
			activityError = '';
			try {
				activityAddrRelayAttempted.clear();
				const sinceSec = commentZapRelayReadSince();
				await fetchFromRelays(
					[ZAPSTORE_RELAY],
					[
						{
							kinds: [EVENT_KINDS.COMMENT],
							'#p': [pk],
							since: sinceSec,
							limit: 500
						},
						{
							kinds: [EVENT_KINDS.ZAP_RECEIPT],
							'#p': [pk],
							since: sinceSec,
							limit: 400
						}
					],
					{ timeout: ACTIVITY_BULK_RELAY_TIMEOUT_MS, feature: 'inbox-1111-9735-p' }
				);
			} catch (err) {
				console.error('[Inbox] relay seed failed', err);
				activityError = 'Failed to sync inbox.';
			} finally {
				activityLoading = false;
			}
		})();

		void _inboxSeedFlight.finally(() => {
			_inboxSeedFlight = null;
		});

		return _inboxSeedFlight;
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
	/** Inbox: same gate as liveQuery — avoids skeleton stuck before activityReady effect runs. */
	const feedUiReady = $derived(
		inboxEmbed ? !!(inboxUserPubkey && inboxActive) : activityReady
	);
	let activityLoading = $state(false);
	/** True while backfillActivityThreadsScoped is running (after initial seed settles). */
	let activityBackfillInFlight = $state(false);
	/**
	 * Set true when backfill completes; cleared by the next liveQuery emission + tick
	 * so the skeleton stays until the new rows are actually on screen.
	 */
	let activityBackfillSettlePending = false;
	/** Fallback timer handle — hides skeleton if no liveQuery emission arrives after backfill. */
	let activityBackfillFallbackTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
	/** First relay seed for this route-entry finished (success or failure). */
	let activityInitialSeedDone = $state(false);
	let activityError = $state('');
	/** First Dexie `liveQuery` emission — avoids “No Activity yet” between seed finishing and reactive query. */
	let activityFeedQuerySettled = $state(false);
	/**
	 * True when Dexie already had activity events before the current seed started (return visit).
	 * On a return visit: show local data immediately (local-first).
	 * On a fresh/cleared DB: hold the skeleton until the initial relay seed finishes.
	 */
	let activityHadCachedData = $state(false);
	/** Footer target for intersection-based “load more” (throttled). */
	let activityLoadSentinel = $state(/** @type {HTMLElement | null} */ (null));
	let activityScrollLoadLastAt = 0;
	const ACTIVITY_SCROLL_LOAD_GAP_MS = 1400;

	const activityAddrRelayAttempted = new Set();
	let activityAddrRelayInFlight = false;

	/**
	 * Top shimmer bar — only while the feed has nothing to show yet (first load / empty Dexie).
	 * Background thread backfill and app-badge addr fetches keep running silently once cards are visible.
	 */
	const activityRelayBarLoading = $derived(
		activityFeedItems.length === 0 &&
			(activityLoading || activityBackfillInFlight || !activityFeedQuerySettled)
	);

	// Inbox popover bar: seed only — not addr-root/backfill (those can run continuously).
	$effect(() => {
		if (!inboxEmbed || !onRelayLoadingChange) return;
		const loading = activityLoading;
		untrack(() => onRelayLoadingChange(loading));
	});

	$effect(() => {
		const feedAddrReady = inboxEmbed
			? !!(inboxUserPubkey && inboxActive)
			: activityReady && activityRouteActive;
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
				// App/stack events are now in Dexie — re-hydrate so badges resolve
				// immediately instead of waiting for the next liveQuery emission.
				void hydrateActivityRootsForVisibleFeed(activityFeedItems);
			});
	});

	// Subscribe in $effect (not $derived.by): Svelte 5 + liveQuery Observable must not be recreated opaquely; `filter` tolerates kind stored as string.
	$effect(() => {
		const feedLive = inboxEmbed
			? !!(inboxUserPubkey && inboxActive)
			: activityReady && activityRouteActive;
		if (!browser || !feedLive) return;
		const visibleLimitSnap = Math.min(ACTIVITY_FEED_VISIBLE_MAX, activityFeedVisibleLimit);

		const obs = liveQuery(async () => {
			// Inbox: indexed #p lookup (fast) instead of full 2000-comment scan.
			// We also batch-fetch the parent events referenced by those inbox items so
			// quoted-message resolution works (activityCommentMap needs the parents).
			// Activity: kind index over all scoped comments (unchanged).
			let commentRows;
			if (inboxUserPubkey) {
			const mentions = await queryEvents({
				kinds: [EVENT_KINDS.COMMENT],
				'#p': [inboxUserPubkey],
				limit: Math.min(visibleLimitSnap + 20, 800)
			});
				// Collect every e-tag parent ID from inbox items for quote context.
				const parentIds = [
					...new Set(
						mentions.flatMap(
							(c) => c.tags?.filter((t) => t[0] === 'e' && t[1]).map((t) => t[1].toLowerCase()) ?? []
						)
					)
				];
				const parentEvs =
					parentIds.length > 0
						? await queryEvents({ ids: parentIds, limit: Math.min(parentIds.length + 10, 200) })
						: [];
				const byId = new Map();
				for (const e of [...mentions, ...parentEvs]) byId.set(e.id, e);
				commentRows = Array.from(byId.values());
			} else {
				commentRows = await queryEvents({ kinds: [EVENT_KINDS.COMMENT], limit: 2000 });
			}
			const scopedComments = commentRows.filter(eventMatchesActivityNip22KComment);
			scopedComments.sort((a, b) => b.created_at - a.created_at);

			// Split kind 1111 into z-wrappers (have z tag + comment) and plain comments.
			/** @type {Array<{ ev: import('nostr-tools').NostrEvent, parsed: ReturnType<typeof parseZapWrapper> }>} */
			const zapWrapperParsedList = [];
			/** @type {import('nostr-tools').NostrEvent[]} */
			const regularCommentEvents = [];
			for (const ev of scopedComments) {
				const zp = parseZapWrapper(ev);
				if (zp) zapWrapperParsedList.push({ ev, parsed: zp });
				else regularCommentEvents.push(ev);
			}

			// Raw 9735 dedup: skip receipts already represented by a kind-1111 z-wrapper (inbox only loads both).
			const coveredReceiptIds = new Set(
				zapWrapperParsedList.map(({ parsed }) => parsed.zapReceiptId).filter(Boolean)
			);
			let uncoveredZapReceipts = /** @type {import('nostr-tools').NostrEvent[]} */ ([]);
			if (inboxUserPubkey) {
				const rawZaps = await queryEvents({
					kinds: [EVENT_KINDS.ZAP_RECEIPT],
					'#p': [inboxUserPubkey],
					limit: Math.min(visibleLimitSnap + 20, 800)
				});
				uncoveredZapReceipts = rawZaps.filter(
					(ev) => !coveredReceiptIds.has(ev.id.toLowerCase())
				);
			}

			let merged;
			/** @type {import('nostr-tools').NostrEvent[]} */
			let threadCommentsForMap;

			if (inboxUserPubkey) {
				const pk = inboxUserPubkey;
				const inboxComments = regularCommentEvents.filter(
					(c) => c.pubkey !== pk && c.tags?.some((t) => t[0] === 'p' && t[1] === pk)
				);
				inboxComments.sort((a, b) => b.created_at - a.created_at);
				merged = [];
				for (const ev of inboxComments) merged.push({ kind: 'comment', ts: ev.created_at, ev });
				// Z-wrapper zaps targeting the user.
				for (const { ev, parsed } of zapWrapperParsedList) {
					if (!ev.tags?.some((t) => t[0] === 'p' && t[1] === pk)) continue;
					if (ev.pubkey === pk) continue; // own wrapper
					merged.push({ kind: 'zap', ts: ev.created_at, row: { event: ev, parsed, isWrapper: true } });
				}
				for (const ev of uncoveredZapReceipts) {
					let p;
					try {
						p = parseZapReceipt(ev);
					} catch {
						continue;
					}
					merged.push({ kind: 'zap', ts: ev.created_at, row: { event: ev, parsed: p, isWrapper: false } });
				}
				merged.sort((a, b) => b.ts - a.ts);

			// Use ALL commentRows for parent resolution — not just scopedComments.
			// Parents may lack a K tag when published by third-party clients (e.g. Grimoire),
			// so the strict eventMatchesActivityNip22KComment filter must not gate the map.
			const threadMergeById = new Map();
			for (const c of commentRows) threadMergeById.set(c.id, c);
			threadCommentsForMap = Array.from(threadMergeById.values());
			} else {
				merged = [];
				for (const ev of regularCommentEvents) {
					merged.push({ kind: 'comment', ts: ev.created_at, ev });
				}
				// Z-wrappers (kind 1111 with z tag) as feed rows. Raw kind 9735 is not in this list.
				for (const { ev, parsed } of zapWrapperParsedList) {
					merged.push({ kind: 'zap', ts: ev.created_at, row: { event: ev, parsed, isWrapper: true } });
				}
				merged.sort((a, b) => b.ts - a.ts);
				threadCommentsForMap = scopedComments;
			}

			const feedLimit = Math.min(ACTIVITY_FEED_VISIBLE_MAX, visibleLimitSnap);
			const hasMoreTimeline = merged.length > feedLimit;
			const feedItems = merged.slice(0, feedLimit);

			return {
				feedItems,
				threadComments: threadCommentsForMap,
				threadZaps: inboxUserPubkey
					? [...zapWrapperParsedList.map(({ ev }) => ev), ...uncoveredZapReceipts]
					: zapWrapperParsedList.map(({ ev }) => ev),
				hasMoreTimeline
			};
		});

		const sub = obs.subscribe({
			next: (val) => {
				const feedItems = val?.feedItems ?? [];
				// On the very first emission: if Dexie already had data we're on a return visit
				// and should show it immediately (local-first). On a fresh/cleared DB the first
				// emission is empty → hold the skeleton until the initial relay seed finishes.
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
			// If backfill just finished, wait one tick for Svelte to flush the new
			// rows into the DOM, then drop the skeleton — content is now on screen.
			if (activityBackfillSettlePending) {
				activityBackfillSettlePending = false;
				if (activityBackfillFallbackTimer) {
					clearTimeout(activityBackfillFallbackTimer);
					activityBackfillFallbackTimer = null;
				}
				tick().then(() => { activityBackfillInFlight = false; });
			}
			void hydrateActivityRootsForVisibleFeed(feedItems);
				const threadCommentById = new Map();
				for (const c of threadComments) {
					threadCommentById.set(c.id, c);
					threadCommentById.set(c.id.toLowerCase(), c);
				}
				for (const it of feedItems) {
					if (it.kind !== 'comment') continue;
					resolveActivityRootEvent(it.ev);
				}
			// Collect all missing zapped-event IDs in one pass, then resolve in a
			// single Dexie batch + one relay round-trip instead of N individual requests.
			const missingZappedIds = [];
			for (const it of feedItems) {
				if (it.kind !== 'zap') continue;
				const zp = it.row.parsed;
				const zapped = zp.zappedEventId;
				if (
					zapped &&
					!threadCommentById.get(zapped) &&
					!threadCommentById.get(zapped.toLowerCase()) &&
					!activityRootEvents.get(zapped)
				) {
					missingZappedIds.push(zapped);
				}
			}
			if (missingZappedIds.length > 0) {
				void (async () => {
					// 1. One Dexie batch lookup for all missing IDs.
					const found = await queryEvents({ ids: missingZappedIds, limit: missingZappedIds.length }).catch(() => []);
					const foundIds = new Set(found.map((ev) => ev.id.toLowerCase()));
					const stillMissing = missingZappedIds.filter((id) => !foundIds.has(id.toLowerCase()));
					const allEvs = [...found];
					// 2. One relay request for all remaining missing IDs.
					if (stillMissing.length > 0) {
						try {
							const arr = await fetchFromRelays(
								[ZAPSTORE_RELAY],
								{ ids: stillMissing, limit: stillMissing.length },
								{ timeout: 4000, feature: 'activity-zwrap-root-batch' }
							);
							if (arr?.length) {
								await putEvents(arr).catch(() => {});
								allEvs.push(...arr);
							}
						} catch {
							/* non-fatal */
						}
					}
					// Process all found events, batch the state updates.
					let newRootEvents = null;
					let newAddrRootEvents = null;
					for (const ev of allEvs) {
						if (!ev) continue;
						const id = ev.id;
						if (ev.kind === EVENT_KINDS.FORUM_POST) {
							if (!newRootEvents) newRootEvents = new Map(activityRootEvents);
							newRootEvents.set(id, ev);
						} else if (ev.kind === EVENT_KINDS.APP || ev.kind === EVENT_KINDS.APP_STACK) {
							const d = ev.tags?.find((t) => t[0] === 'd')?.[1];
							if (d) {
								if (!newAddrRootEvents) newAddrRootEvents = new Map(activityAddrRootEvents);
								newAddrRootEvents.set(`${ev.kind}:${ev.pubkey}:${d}`, ev);
							}
							if (!newRootEvents) newRootEvents = new Map(activityRootEvents);
							newRootEvents.set(id, ev);
						}
					}
					if (newRootEvents) activityRootEvents = newRootEvents;
					if (newAddrRootEvents) activityAddrRootEvents = newAddrRootEvents;
				})();
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
		// Z-wrappers (kind: 'zap' with isWrapper) carry an A tag pointing to the app/stack root.
		// Pass all feed events so batchResolveAddrRootsFromDexie picks up z-wrapper A tags too.
		await batchResolveAddrRootsFromDexie([...commentsInFeed, ...zapsInFeed], addrRootByATag);
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
		// Works for both Activity tab and inbox embed.
		const ioReady = inboxEmbed
			? !!(inboxUserPubkey && inboxActive)
			: activityReady && activityRouteActive;
		if (!browser || !ioReady) return;
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

	/**
	 * Inbox: fetch parent comments that weren't in Dexie when liveQuery ran.
	 * These are older events outside the relay subscription's `since` window.
	 * Tracked per component instance so each ID is only attempted once.
	 */
	const _inboxParentFetchAttempted = new Set();
	$effect(() => {
		if (!browser || !inboxUserPubkey || !isOnline()) return;
		const missing = [];
		for (const item of activityFeedItems) {
			if (item.kind !== 'comment') continue;
			const ev = item.ev;
			const eTag = ev.tags?.find((t) => t[0] === 'e' && t[1]);
			const pid = eTag?.[1]?.toLowerCase();
			if (!pid) continue;
			// If the e-tag IS the root (E tag matches), this is a direct root reply — no quoted parent needed.
			const rootTag = ev.tags?.find((t) => t[0] === 'E' && t[1]);
			if (rootTag?.[1]?.toLowerCase() === pid) continue;
			if (activityCommentMap.has(pid)) continue;
			if (activityZapMap.has(pid)) continue;
			if (_inboxParentFetchAttempted.has(pid)) continue;
			missing.push(pid);
			_inboxParentFetchAttempted.add(pid);
		}
		if (missing.length === 0) return;
		fetchFromRelays(
			ACTIVITY_CATALOG_RELAYS,
			{ ids: missing, limit: missing.length + 5 },
			{ timeout: 5000, feature: 'inbox-parent-resolve' }
		)
			.then((evs) => { if (evs.length > 0) void putEvents(evs); })
			.catch(() => {});
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

	const ACTIVITY_BACKFILL_REF_COMMENT_CAP = 300;
	const ACTIVITY_BACKFILL_FORUM_ID_BATCH = 40;
	const ACTIVITY_BACKFILL_FORUM_WAVE = 4;

	/**
	 * Pull kind-1111 comments by thread refs (`#e`/`#E` for forum posts, `#a`/`#A` for app/stack)
	 * so older threads surface in the Activity feed. Kind 9735 is no longer fetched — the feed
	 * is exclusively kind 1111 (z-wrappers + plain comments).
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
		const posts = await queryEvents({ kinds: [EVENT_KINDS.FORUM_POST], limit: 400 }).catch(
			() => []
		);
		for (const fp of posts) {
			if (fp?.id) eventIds.add(fp.id.toLowerCase());
		}

		const idList = [...eventIds].filter((id) => /^[a-f0-9]{64}$/.test(id));
		const aList = [...aTagByLower.values()].slice(0, 96);
		const aChunk = 6;

	// Backfill kind 1111 comments by thread refs. Kind 9735 is seeded separately in seedActivityFromRelay.
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

		await Promise.allSettled([commentBackfillByEventIds, commentBackfillByATags]);
	}

	/** Coalesce concurrent activity seeds — one merged REQ (1111 K + forum #h) plus thread backfill. */
	let _activitySeedFlight = /** @type {Promise<void> | null} */ (null);

	async function seedActivityFromRelay() {
		if (!browser) return;
		if (!activityRouteActive) return;
		if (_activitySeedFlight) return _activitySeedFlight;

		_activitySeedFlight = (async () => {
			activityLoading = true;
			activityError = '';
			try {
				activityAddrRelayAttempted.clear();
				const sinceSec = activityRelaySince();
				const lim = ACTIVITY_INITIAL_SEED_LIMIT;
				const seedFilters = [
					{
						kinds: [EVENT_KINDS.COMMENT],
						'#K': ACTIVITY_NIP22_K_TAGS,
						since: sinceSec,
						limit: lim
					},
					{
						kinds: [EVENT_KINDS.FORUM_POST],
						'#h': [ZAPSTORE_COMMUNITY_PUBKEY],
						since: sinceSec,
						limit: lim
					}
				];
				const combinedPromise = fetchFromRelays([ZAPSTORE_RELAY], seedFilters, {
					timeout: ACTIVITY_BULK_RELAY_TIMEOUT_MS,
					feature: 'activity-1111-post-K'
				});
				combinedPromise
					.catch(() => {})
					.then(async () => {
						activityBackfillInFlight = true;
						try {
							await backfillActivityThreadsScoped();
							// Signal that the NEXT liveQuery emission should dismiss the skeleton
							// (after one tick so Svelte flushes the new rows first).
							// This is more precise than a fixed timeout: the skeleton stays until
							// the data is literally on screen.
							activityBackfillSettlePending = true;
							// Fallback: if no liveQuery emission arrives within 1s, hide anyway.
							if (activityBackfillFallbackTimer) clearTimeout(activityBackfillFallbackTimer);
							activityBackfillFallbackTimer = setTimeout(() => {
								if (activityBackfillSettlePending) {
									activityBackfillSettlePending = false;
									activityBackfillInFlight = false;
								}
								activityBackfillFallbackTimer = null;
							}, 1000);
						} catch (err) {
							console.error('[Activity] thread backfill failed', err);
							activityBackfillSettlePending = false;
							activityBackfillInFlight = false;
						}
					});
				await combinedPromise;
			} catch (err) {
				console.error('[Activity] relay seed failed', err);
				activityError = 'Failed to sync activity.';
			} finally {
				activityLoading = false;
				activityInitialSeedDone = true;
			}
		})();

		void _activitySeedFlight.finally(() => {
			_activitySeedFlight = null;
		});

		return _activitySeedFlight;
	}

	/** @param {import('nostr-tools').NostrEvent | null} ev */
	/** @param {'forum' | 'app' | 'stack'} kind */
	function activityDeletedRootLabel(kind) {
		if (kind === 'forum') return 'Publication not found';
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
	/** Feed ⋯: show only ActionsModal first (no thread modal behind it). */
	let threadOpenFeedActionsOnly = $state(false);
	/** Feed zap icon: load thread data but show zap slider only (no thread modal). */
	let threadOpenFeedZapOnly = $state(false);
	let standaloneActionsOpenKey = $state(0);
	let standaloneZapOpenKey = $state(0);
	let threadInitialActionsTarget = $state(/** @type {'root' | any | null} */ (null));
	let pendingActionsCommentEv = $state(
		/** @type {import('nostr-tools').NostrEvent | null} */ (null)
	);
	let pendingZapCommentEv = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
	let selectedThreadComments = $state(/** @type {any[]} */ ([]));
	let selectedThreadZaps = $state(/** @type {any[]} */ ([]));
	let threadModalKind = $state(/** @type {'comment' | 'zap' | null} */ (null));
	let threadModalZapId = $state(/** @type {string | null} */ (null));
	let threadModalZapEvent = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
	/** App/stack thread: NIP-33 `a` value (32267:… or 30267:…). Null when modal is forum-only. */
	let threadModalAddrATag = $state(/** @type {string | null} */ (null));
	/** When set, auto-expand that reply's content in the thread modal (activity-feed click on a nested comment). */
	let threadModalExpandCommentId = $state(/** @type {string | null} */ (null));

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
		threadModalExpandCommentId = null;
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
					threadModalExpandCommentId =
						!openActionsSheet &&
						!openZapOnly &&
						commentEv.id.toLowerCase() !== encZap.id.toLowerCase()
							? commentEv.id
							: null;
					initialReplyTargetForModal =
						withReply && commentEv.id.toLowerCase() !== encZap.id.toLowerCase()
							? enrichReplyTargetForModal(commentEv)
							: null;

					if (threadOpenActionsOnMount && pendingActionsCommentEv) {
						const isRoot = pendingActionsCommentEv.id.toLowerCase() === encZap.id.toLowerCase();
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
				threadModalExpandCommentId =
					!openActionsSheet && !openZapOnly && commentEv.id.toLowerCase() !== rootId.toLowerCase()
						? commentEv.id
						: null;
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
				threadModalExpandCommentId =
					!openActionsSheet &&
					!openZapOnly &&
					commentEv.id.toLowerCase() !== encZap.id.toLowerCase()
						? commentEv.id
						: null;
				initialReplyTargetForModal =
					withReply && commentEv.id.toLowerCase() !== encZap.id.toLowerCase()
						? enrichReplyTargetForModal(commentEv)
						: null;

				if (threadOpenActionsOnMount && pendingActionsCommentEv) {
					const isRoot = pendingActionsCommentEv.id.toLowerCase() === encZap.id.toLowerCase();
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
			threadModalExpandCommentId =
				!openActionsSheet && !openZapOnly && commentEv.id.toLowerCase() !== rootId.toLowerCase()
					? commentEv.id
					: null;
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
			else if (activityRouteActive) void seedActivityFromRelay();
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
		else if (activityRouteActive) void seedActivityFromRelay();
	}

	function openZapThreadForum(zapEvent, withReply = false, opts = {}) {
		const openActionsSheet = opts?.openActionsSheet === true;
		const openZapOnly = opts?.openZapOnly === true;
		threadOpenFeedZapOnly = openZapOnly;
		pendingZapCommentEv = null;
		if (openZapOnly) {
			standaloneZapOpenKey++;
			threadOpenActionsOnMount = false;
			threadOpenFeedActionsOnly = false;
			threadInitialActionsTarget = null;
		} else {
			threadOpenActionsOnMount = openActionsSheet;
			if (openActionsSheet) {
				threadOpenFeedActionsOnly = true;
				standaloneActionsOpenKey++;
			} else {
				threadOpenFeedActionsOnly = false;
			}
			threadInitialActionsTarget = openActionsSheet ? 'root' : null;
		}
		pendingActionsCommentEv = null;

		const p = parseZapWrapper(zapEvent);
		if (!p) {
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

	let inboxWasActive = false;

	$effect(() => {
		if (!browser) return;
		if (inboxEmbed) {
			const active = !!(inboxUserPubkey && inboxActive);
			activityReady = active;
			if (active && inboxUserPubkey && !inboxWasActive) {
				void seedInboxFromRelay(inboxUserPubkey);
			}
			inboxWasActive = active;
			return;
		}
		inboxWasActive = false;
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
			<!-- Relay sync bar: first paint only — bg backfill/badge fetches do not show the top bar. -->
		{#if !inboxEmbed}
			<RelayLoadingBar loading={activityRelayBarLoading} />
		{/if}
		{#if !feedUiReady || !activityFeedQuerySettled || (!inboxEmbed && activityFeedItems.length === 0 && !activityHadCachedData && (!activityInitialSeedDone || activityLoading))}
			<div class="loading-wrap">
				<ActivityFeedSkeleton rows={6} />
			</div>
		{:else if activityError && activityFeedItems.length === 0}
			<div class="empty-state-wrap">
				<EmptyState message={activityError} minHeight={280} />
			</div>
		{:else if activityFeedItems.length === 0 && activityLoading}
			<!-- Still seeding from relay; show skeleton instead of "empty" to avoid false negative -->
			<div class="loading-wrap">
				<ActivityFeedSkeleton rows={4} />
			</div>
		{:else if activityFeedItems.length === 0}
			<div class="empty-state-wrap">
				<EmptyState
					message={inboxUserPubkey ? 'Your inbox is empty' : 'No Activity yet'}
					minHeight={280}
					topAlign={inboxEmbed}
				/>
			</div>
			{:else}
				<div class="activity-list">
				{#each activityFeedItems as item (item.kind === 'zap' ? `zap-${item.row.event.id}` : item.ev.id)}
					{#if item.kind === 'comment'}
						{@const commentEv = item.ev}
						{@const _parsedComment = parseComment(commentEv)}
						{@const isZWrapper = _parsedComment.isWrapper}
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
							{@const parentId =
								eParentTag?.[1] && eParentTag[1] !== rootKey ? eParentTag[1] : null}
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
									? (activityZapMap.get(parentId) ??
										activityZapMap.get(parentId.toLowerCase()) ??
										null)
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
							{#if isZWrapper}
								<ZapActivityCard
									zapEvent={commentEv}
									parsed={{
										amountSats: _parsedComment.zapAmountSats,
										senderPubkey: commentEv.pubkey,
										comment: commentEv.content ?? '',
										zappedEventId: _parsedComment.parentId,
										emojiTags: _parsedComment.emojiTags ?? []
									}}
									zapperPubkey={commentEv.pubkey}
									{authorProfile}
									{rootEvent}
									appBadge={feedAddrBadge}
									{rootBadgeSkeleton}
									{deletedRootKind}
									{parentComment}
									{parentCommentAuthor}
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
							{:else}
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
							{/if}
							</div>
					{:else}
						{@const zapEv = item.row.event}
						{@const zParsed = item.row.parsed}
						{@const zapIsWrapper = item.row.isWrapper === true}
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
							if (!zapIsWrapper) {
								if (rootEventZ) openRootPost(rootEventZ);
							} else {
								openZapThreadForum(zapEv);
							}
						}}
						onkeydown={(e) => {
							if (e.key !== 'Enter') return;
							markInboxCardSeen(zapEv.id);
							if (!zapIsWrapper) {
								if (rootEventZ) openRootPost(rootEventZ);
							} else {
								openZapThreadForum(zapEv);
							}
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
							feedActions={zapIsWrapper
								? {
										onReply: () => {
											markInboxCardSeen(zapEv.id);
											openZapThreadForum(zapEv, true);
										},
										onZap: () => {
											markInboxCardSeen(zapEv.id);
											openZapThreadForum(zapEv, false, { openZapOnly: true });
										},
										onOptions: () => {
											markInboxCardSeen(zapEv.id);
											openZapThreadForum(zapEv, false, { openActionsSheet: true });
										}
									}
								: null}
					/>
					</div>
					{/if}
				{/each}
				{#if activityBackfillInFlight}
					<!-- Skeleton rows while the backfill wave runs so the feed never looks stuck. -->
					<ActivityFeedSkeleton rows={3} />
					{/if}
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
			expandCommentId={threadModalExpandCommentId}
			openActionsOnMount={threadOpenActionsOnMount}
			initialActionsTarget={threadInitialActionsTarget}
			{standaloneActionsOpenKey}
			openZapOnMount={threadOpenFeedZapOnly}
			{standaloneZapOpenKey}
			feedInitialZapTarget={pendingZapCommentEv
				? enrichReplyTargetForModal(pendingZapCommentEv)
				: null}
			{openReplyOnMount}
			initialReplyTarget={initialReplyTargetForModal}
			modalLockBodyScroll={!inboxEmbed}
			modalZIndex={inboxEmbed ? 130 : 110}
			modalScopedInPanel={inboxEmbed}
			disableMediaLightbox={inboxEmbed}
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
				(_authorNpub
					? `npub1${_authorNpub.slice(5, 8)}…${_authorNpub.slice(-6)}`
					: _rootEv.pubkey.slice(0, 8))}
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
						isStack: !!_bannerIsStack,
						isApp: !!(_bannerBadge && !_bannerIsStack),
						identifier: _bannerBadge?.identifier ?? null
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
				threadModalExpandCommentId = null;
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
		resolveMentionLabel={(pk) =>
			activityProfiles.get(pk)?.displayName ?? activityProfiles.get(pk)?.name ?? null}
	/>
	{/key}
{/if}

{#if threadModalKind === 'zap' && threadModalZapId && threadModalZapEvent}
	{@const _zEv = threadModalZapEvent}
	{@const _zParsed = parseZapWrapper(_zEv) ?? parseZapReceipt(_zEv)}
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
			expandCommentId={threadModalExpandCommentId}
			openActionsOnMount={threadOpenActionsOnMount}
			initialActionsTarget={threadInitialActionsTarget}
			{standaloneActionsOpenKey}
			openZapOnMount={threadOpenFeedZapOnly}
			{standaloneZapOpenKey}
			feedInitialZapTarget={pendingZapCommentEv
				? enrichReplyTargetForModal(pendingZapCommentEv)
				: null}
			{openReplyOnMount}
			initialReplyTarget={initialReplyTargetForModal}
			modalLockBodyScroll={!inboxEmbed}
			modalZIndex={inboxEmbed ? 130 : 110}
			modalScopedInPanel={inboxEmbed}
			disableMediaLightbox={inboxEmbed}
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
						isStack: !!_bannerIsStackZ,
						isApp: !!(_zapBadgeZ && !_bannerIsStackZ),
						identifier: _zapBadgeZ?.identifier ?? null
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
				threadModalExpandCommentId = null;
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
		resolveMentionLabel={(pk) =>
			activityProfiles.get(pk)?.displayName ?? activityProfiles.get(pk)?.name ?? null}
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
		border-bottom: 1px solid var(--shell-border);
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
