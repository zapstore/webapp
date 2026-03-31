<script lang="js">
	/**
	 * Comments on the signed-in developer's apps (NIP-22 root `A` / `a` = 32267:pubkey:d-tag).
	 * Local-first via Dexie liveQuery; background seed from Zapstore (`COMMENT_AND_ZAP_READ_RELAYS`) with bounded REQ.
	 */
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import {
		fetchCommentsByRootATags,
		fetchProfilesBatch,
		putEvents,
		queryEvents,
		queryEvent,
		liveQuery,
		encodeAppNaddr,
		parseComment,
		parseZapReceipt,
		publishComment
	} from '$lib/nostr';
	import {
		walkAppDiscussionRootInMap,
		resolveAppDiscussionRootCommentId,
		collectCommentSubtree
	} from '$lib/nostr/thread-discussion.js';
	import {
		collectCommentsUnderParent,
		collectZapReceiptsUnderZap,
		findEnclosingZapReceiptForComment
	} from '$lib/nostr/zap-thread.js';
	import { parseApp, parseProfile } from '$lib/nostr/models';
	import { EVENT_KINDS, COMMENT_AND_ZAP_READ_RELAYS, commentZapRelayReadSince } from '$lib/config';
	import { goto } from '$app/navigation';
	import CommentCard from '$lib/components/community/CommentCard.svelte';
	import ZapActivityCard from '$lib/components/community/ZapActivityCard.svelte';
	import RootComment from '$lib/components/social/RootComment.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import ActivityFeedSkeleton from '$lib/components/community/ActivityFeedSkeleton.svelte';
	import { DUMMY_MODE } from './studio-config.js';
	import { signEvent, getCurrentPubkey, getIsSignedIn } from '$lib/stores/auth.svelte.js';
	import { createSearchProfilesFunction } from '$lib/services/profile-search.js';
	import { createSearchEmojisFunction } from '$lib/services/emoji-search.js';

	/** @type {{ id: string, name: string, icon: string }[]} */
	let {
		devPubkey = null,
		apps = [],
		/** Bindable — set to true while the thread modal is open so parent can lock its scroll. */
		threadModalOpen = $bindable(false)
	} = $props();

	const appAddrs = $derived(
		devPubkey && apps.length ? apps.map((a) => `${EVENT_KINDS.APP}:${devPubkey}:${a.id}`) : []
	);

	const seedKey = $derived(appAddrs.slice().sort().join('|'));

	/** @type {Map<string, { id: string, name: string, icon: string }>} */
	const appByAddr = $derived.by(() => {
		const m = new Map();
		if (!devPubkey) return m;
		for (const a of apps) {
			m.set(`${EVENT_KINDS.APP}:${devPubkey}:${a.id}`, a);
		}
		return m;
	});

	/** @type {import('nostr-tools').NostrEvent[]} */
	let activityComments = $state([]);
	/** @type {import('nostr-tools').NostrEvent[]} */
	let activityZapEvents = $state([]);
	/** @type {Map<string, import('nostr-tools').NostrEvent>} root `a` value → kind 32267 app event */
	let rootAppEvents = $state(new Map());
	/** @type {Map<string, { displayName?: string, name?: string, picture?: string }>} */
	let activityProfiles = $state(new Map());

	const activityCommentMap = $derived.by(() => {
		const m = new Map();
		for (const ev of activityComments) {
			m.set(ev.id, ev);
			m.set(ev.id.toLowerCase(), ev);
		}
		return m;
	});

	const activityZapMap = $derived.by(() => {
		const m = new Map();
		for (const ev of activityZapEvents) {
			m.set(ev.id, ev);
			m.set(ev.id.toLowerCase(), ev);
		}
		return m;
	});

	let activityReady = $state(false);
	let activityLoading = $state(false);
	let activityError = $state('');

	/** @type {string} last `seedKey` we fetched from relays (non-reactive on purpose). */
	let lastActivitySeedKey = '';

	const activityQuery = $derived(
		browser && !DUMMY_MODE && devPubkey && appAddrs.length > 0 && activityReady
			? liveQuery(async () => {
					const [commentsA, commentsUpper] = await Promise.all([
						queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#a': appAddrs, limit: 500 }),
						queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#A': appAddrs, limit: 500 })
					]);
					const byId = new Map();
					for (const ev of [...commentsA, ...commentsUpper]) byId.set(ev.id, ev);
					return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
				})
			: null
	);

	const activityZapQuery = $derived(
		browser && !DUMMY_MODE && devPubkey && appAddrs.length > 0 && activityReady
			? liveQuery(async () => {
					const [zLo, zUp] = await Promise.all([
						queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#a': appAddrs, limit: 400 }),
						queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#A': appAddrs, limit: 400 })
					]);
					const byId = new Map();
					for (const ev of [...zLo, ...zUp]) byId.set(ev.id, ev);
					return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
				})
			: null
	);

	$effect(() => {
		if (!activityQuery) return;
		const sub = activityQuery.subscribe({
			next: (val) => {
				activityComments = (val ?? []).filter((ev) => ev.pubkey !== devPubkey);
				for (const ev of activityComments) {
					resolveRootAppEvent(ev);
					scheduleActivityProfileFetch(ev.pubkey);
					const parentTag = ev.tags?.find((t) => t[0] === 'e' && t[1]);
					if (parentTag?.[1]) {
						const parent = val?.find((c) => c.id === parentTag[1]);
						if (parent?.pubkey) scheduleActivityProfileFetch(parent.pubkey);
					}
				}
			},
			error: (e) => {
				console.error('[StudioActivity] liveQuery error', e);
				activityError = 'Failed to load activity.';
			}
		});
		return () => sub.unsubscribe();
	});

	$effect(() => {
		if (!activityZapQuery) return;
		const sub = activityZapQuery.subscribe({
			next: (val) => {
				activityZapEvents = val ?? [];
				for (const ev of activityZapEvents) {
					const aRoot =
						ev.tags?.find((t) => t[0] === 'A' && t[1])?.[1] ??
						ev.tags?.find((t) => t[0] === 'a' && t[1])?.[1] ??
						null;
					if (aRoot) resolveRootAppEvent({ tags: [['A', aRoot]] });
					try {
						const p = parseZapReceipt(ev);
						if (p.senderPubkey) scheduleActivityProfileFetch(p.senderPubkey);
					} catch {
						/* ignore */
					}
				}
			},
			error: (e) => {
				console.error('[StudioActivity] zap liveQuery error', e);
			}
		});
		return () => sub.unsubscribe();
	});

	$effect(() => {
		for (const ev of activityComments) {
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

	const activityZapsForFeed = $derived.by(() => {
		const rows = [];
		for (const ev of activityZapEvents) {
			let p;
			try {
				p = parseZapReceipt(ev);
			} catch {
				continue;
			}
			if (!p.senderPubkey) continue;
			if (p.senderPubkey === devPubkey) continue;
			rows.push({ event: ev, parsed: p });
		}
		return rows.sort((a, b) => b.event.created_at - a.event.created_at);
	});

	const inboxFeedItems = $derived.by(() => {
		const items = [];
		for (const ev of activityComments) items.push({ kind: 'comment', ts: ev.created_at, ev });
		for (const row of activityZapsForFeed)
			items.push({ kind: 'zap', ts: row.event.created_at, row });
		return items.sort((a, b) => b.ts - a.ts);
	});

	async function resolveRootAppEvent(commentEvent) {
		if (!commentEvent?.tags) return;
		const aRoot = commentEvent.tags.find((t) => t[0] === 'A' && t[1])?.[1];
		if (!aRoot || rootAppEvents.get(aRoot)) return;

		const parts = aRoot.split(':');
		if (parts.length < 3 || parts[0] !== String(EVENT_KINDS.APP)) return;
		const pk = parts[1];
		const dTag = parts.slice(2).join(':');

		const { DEFAULT_CATALOG_RELAYS, PLATFORM_FILTER } = await import('$lib/config.js');
		let appEv = await queryEvent({
			kinds: [EVENT_KINDS.APP],
			authors: [pk],
			'#d': [dTag],
			...PLATFORM_FILTER,
			limit: 1
		}).catch(() => null);

		if (appEv) {
			rootAppEvents = new Map(rootAppEvents).set(aRoot, appEv);
			return;
		}

		try {
			const { fetchFromRelays } = await import('$lib/nostr/service.js');
			const arr = await fetchFromRelays(
				DEFAULT_CATALOG_RELAYS,
				{
					kinds: [EVENT_KINDS.APP],
					authors: [pk],
					'#d': [dTag],
					...PLATFORM_FILTER,
					limit: 1
				},
				{ timeout: 5000, feature: 'studio-activity' }
			);
			if (arr?.[0]) {
				await putEvents([arr[0]]).catch(() => {});
				rootAppEvents = new Map(rootAppEvents).set(aRoot, arr[0]);
			}
		} catch {
			/* non-fatal */
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

	$effect(() => {
		if (!browser || !activityReady || DUMMY_MODE || !seedKey) return;
		if (seedKey === lastActivitySeedKey) return;
		lastActivitySeedKey = seedKey;
		let cancelled = false;
		activityLoading = true;
		activityError = '';
		(async () => {
			try {
				const { fetchFromRelays } = await import('$lib/nostr/service.js');
				const rs = commentZapRelayReadSince();
				const [evs, zLo, zUp] = await Promise.all([
					fetchCommentsByRootATags(appAddrs, { timeout: 8000 }),
					fetchFromRelays(
						COMMENT_AND_ZAP_READ_RELAYS,
						{ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#a': appAddrs, since: rs, limit: 400 },
						{ timeout: 8000, feature: 'studio-inbox-zaps' }
					).catch(() => []),
					fetchFromRelays(
						COMMENT_AND_ZAP_READ_RELAYS,
						{ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#A': appAddrs, since: rs, limit: 400 },
						{ timeout: 8000, feature: 'studio-inbox-zaps' }
					).catch(() => [])
				]);
				const zapEvs = [...zLo, ...zUp];
				if (!cancelled && evs?.length) await putEvents(evs).catch(() => {});
				if (!cancelled && zapEvs?.length) await putEvents(zapEvs).catch(() => {});
			} catch (err) {
				console.error('[StudioActivity] relay seed failed', err);
				if (!cancelled) activityError = 'Failed to sync comments from relays.';
			} finally {
				if (!cancelled) activityLoading = false;
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	/** Navigate to the app page (root label row click only). */
	function openAppForComment(aTagValue) {
		if (!aTagValue) return;
		const parts = aTagValue.split(':');
		if (parts.length < 3 || parts[0] !== String(EVENT_KINDS.APP)) return;
		const pk = parts[1];
		const dTag = parts.slice(2).join(':');
		try {
			const naddr = encodeAppNaddr(pk, dTag);
			goto(`/apps/${naddr}`);
		} catch {
			/* ignore */
		}
	}

	// ── In-feed thread modal (header = discussion root, not nested reply) ───
	/** Discussion root comment id — always the top comment of the thread under the app. */
	let threadModalRootId = $state(/** @type {string | null} */ (null));
	let threadModalRootEvent = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
	/** When opening via Reply on a nested comment, quote target for the composer. */
	let initialReplyTargetForModal = $state(/** @type {any} */ (null));
	let threadLoadGen = 0;
	/** Whether the reply composer should open immediately when the thread modal mounts. */
	let openReplyOnMount = $state(false);
	/** Enriched replies for the open thread modal (subtree under root). */
	let selectedThreadComments = $state(/** @type {any[]} */ ([]));
	/** Nested zap receipts when the open modal is a zap thread. */
	let selectedThreadZaps = $state(/** @type {any[]} */ ([]));
	/** `comment` | `zap` — which thread modal variant is active. */
	let threadModalKind = $state(/** @type {'comment' | 'zap' | null} */ (null));
	let threadModalZapId = $state(/** @type {string | null} */ (null));
	let threadModalZapEvent = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));

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

	function openThread(commentEv, withReply = false) {
		const aRoot = commentEv.tags?.find((t) => t[0] === 'A' && t[1])?.[1] ?? null;
		if (!aRoot) return;

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
		initialReplyTargetForModal = null;

		const cmap = new Map();
		for (const c of activityComments) cmap.set(c.id.toLowerCase(), c);

		(async () => {
			const zmap = activityZapMap;
			const encZap = await findEnclosingZapReceiptForComment(commentEv, cmap, zmap, (id) =>
				queryEvent({ ids: [id] }).catch(() => null)
			);
			if (gen !== threadLoadGen) return;

			if (encZap) {
				const aRootZ = appATagFromZapEvent(encZap) ?? aRoot;
				if (!aRootZ) return;
				threadModalKind = 'zap';
				threadModalRootId = null;
				threadModalRootEvent = null;
				threadModalZapId = encZap.id;
				threadModalZapEvent = encZap;
				initialReplyTargetForModal =
					withReply && commentEv.id.toLowerCase() !== encZap.id.toLowerCase()
						? enrichReplyTargetForModal(commentEv)
						: null;
				loadZapAppThread(encZap.id, aRootZ, gen);
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
			initialReplyTargetForModal =
				withReply && commentEv.id.toLowerCase() !== rootId.toLowerCase()
					? enrichReplyTargetForModal(commentEv)
					: null;

			await loadAppThread(rootId, aRoot, gen, rootEv);
		})();
	}

	$effect(() => {
		threadModalOpen =
			(threadModalKind === 'comment' && !!threadModalRootId) ||
			(threadModalKind === 'zap' && !!threadModalZapId);
	});

	function appATagFromZapEvent(ev) {
		return (
			ev?.tags?.find((t) => t[0] === 'A' && t[1])?.[1] ??
			ev?.tags?.find((t) => t[0] === 'a' && t[1])?.[1] ??
			null
		);
	}

	function openZapThread(zapEvent, withReply = false) {
		const aRoot = appATagFromZapEvent(zapEvent);
		if (!aRoot) return;

		threadLoadGen++;
		const gen = threadLoadGen;
		openReplyOnMount = withReply;
		selectedThreadComments = [];
		selectedThreadZaps = [];
		threadModalKind = 'zap';
		threadModalRootId = null;
		threadModalRootEvent = null;
		initialReplyTargetForModal = null;
		threadModalZapId = zapEvent.id;
		threadModalZapEvent = zapEvent;

		loadZapAppThread(zapEvent.id, aRoot, gen);
	}

	async function loadZapAppThread(zapId, aRoot, gen) {
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

			const { fetchFromRelays } = await import('$lib/nostr/service.js');
			const rs = commentZapRelayReadSince();
			Promise.all([
				fetchFromRelays(
					COMMENT_AND_ZAP_READ_RELAYS,
					{ kinds: [EVENT_KINDS.COMMENT], '#A': [aRoot], since: rs, limit: 500 },
					{ timeout: 5000, feature: 'studio-zap-thread' }
				),
				fetchFromRelays(
					COMMENT_AND_ZAP_READ_RELAYS,
					{ kinds: [EVENT_KINDS.COMMENT], '#a': [aRoot], since: rs, limit: 500 },
					{ timeout: 5000, feature: 'studio-zap-thread' }
				),
				fetchFromRelays(
					COMMENT_AND_ZAP_READ_RELAYS,
					{ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#A': [aRoot], since: rs, limit: 400 },
					{ timeout: 5000, feature: 'studio-zap-thread' }
				),
				fetchFromRelays(
					COMMENT_AND_ZAP_READ_RELAYS,
					{ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#a': [aRoot], since: rs, limit: 400 },
					{ timeout: 5000, feature: 'studio-zap-thread' }
				)
			])
				.then(async ([c1, c2, z1, z2]) => {
					const pc = [...poolComments];
					const pz = [...poolZaps];
					for (const e of [...c1, ...c2]) {
						if (!pc.some((x) => x.id === e.id)) pc.push(e);
					}
					for (const e of [...z1, ...z2]) {
						if (!pz.some((x) => x.id === e.id)) pz.push(e);
					}
					await putEvents([...pc, ...pz]).catch(() => {});
					if (gen !== threadLoadGen) return;
					commThread = collectCommentsUnderParent(zLower, pc);
					zapThread = collectZapReceiptsUnderZap(zLower, pz);
					await enrichZapModalThread(zapId, gen, commThread, zapThread);
				})
				.catch(() => {});

			await enrichZapModalThread(zapId, gen, commThread, zapThread);
		} catch (err) {
			console.error('[StudioActivity] zap thread load failed', err);
		}
	}

	async function enrichZapModalThread(zapRootId, gen, commentEvents, zapReceiptEvents) {
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

	async function loadAppThread(rootId, aRoot, gen, rootEv) {
		try {
			let pool = await queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#A': [aRoot], limit: 500 });
			const poolArr = [...pool];
			if (!poolArr.some((e) => e.id === rootEv.id)) poolArr.push(rootEv);

			let subtree = collectCommentSubtree(rootId, poolArr);
			let byId = new Map(subtree.map((e) => [e.id, e]));

			const { fetchFromRelays } = await import('$lib/nostr/service.js');
			const rs = commentZapRelayReadSince();
			Promise.all([
				fetchFromRelays(
					COMMENT_AND_ZAP_READ_RELAYS,
					{ kinds: [EVENT_KINDS.COMMENT], '#A': [aRoot], since: rs, limit: 500 },
					{ timeout: 5000, feature: 'studio-thread' }
				),
				fetchFromRelays(
					COMMENT_AND_ZAP_READ_RELAYS,
					{ kinds: [EVENT_KINDS.COMMENT], '#a': [aRoot], since: rs, limit: 500 },
					{ timeout: 5000, feature: 'studio-thread' }
				)
			])
				.then(async ([evsUp, evsLo]) => {
					const merged = [...poolArr];
					for (const e of [...evsUp, ...evsLo]) {
						if (!merged.some((x) => x.id === e.id)) merged.push(e);
					}
					const sub2 = collectCommentSubtree(rootId, merged);
					const m2 = new Map(sub2.map((e) => [e.id, e]));
					await putEvents([...m2.values()]).catch(() => {});
					if (gen !== threadLoadGen || threadModalKind !== 'comment') return;
					await enrichAndSetThread(rootId, gen, m2);
				})
				.catch(() => {});

			await enrichAndSetThread(rootId, gen, byId);
		} catch (err) {
			console.error('[StudioActivity] thread load failed', err);
		}
	}

	async function enrichAndSetThread(rootId, gen, byIdMap) {
		const evs = Array.from(byIdMap.values()).sort((a, b) => a.created_at - b.created_at);
		const pks = [...new Set(evs.map((e) => e.pubkey))];
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

	async function handleThreadReply(rootATag, e) {
		if (!rootATag || !e?.text?.trim()) return;
		const parts = rootATag.split(':');
		const appPubkey = parts[1];
		const appDTag = parts.slice(2).join(':');
		const signed = await publishComment(
			e.text,
			{ contentType: 'app', pubkey: appPubkey, identifier: appDTag },
			signEvent,
			e.emojiTags ?? [],
			e.parentId ?? null,
			e.replyToPubkey ?? null,
			e.parentKind ?? EVENT_KINDS.COMMENT,
			e.mentions ?? [],
			undefined,
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
	}

	onMount(() => {
		if (!browser) return;
		activityReady = true;
		return () => {
			lastActivitySeedKey = '';
		};
	});
</script>

{#if DUMMY_MODE}
	<div class="empty-state-wrap">
		<EmptyState message="Nothing here yet." minHeight={280} />
	</div>
{:else if !devPubkey || apps.length === 0}
	<div class="empty-state-wrap">
		<EmptyState
			message="Comments on your apps will show here once you publish an app."
			minHeight={280}
		/>
	</div>
{:else if !activityReady || (activityLoading && inboxFeedItems.length === 0)}
	<div class="inbox-feed-skeleton-wrap">
		<ActivityFeedSkeleton rows={6} />
	</div>
{:else if activityError && inboxFeedItems.length === 0}
	<div class="empty-state-wrap">
		<EmptyState message={activityError} minHeight={280} />
	</div>
{:else if inboxFeedItems.length === 0}
	<div class="empty-state-wrap">
		<EmptyState message="No comments or zaps on your apps yet." minHeight={280} />
	</div>
{:else}
	<div class="activity-list">
		{#each inboxFeedItems as item (item.kind === 'zap' ? `zap-${item.row.event.id}` : item.ev.id)}
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
				{@const aRootTag = commentEv.tags?.find((t) => t[0] === 'A' && t[1])}
				{@const rootATag = aRootTag?.[1] ?? null}
				{@const rootEvent = rootATag ? (rootAppEvents.get(rootATag) ?? null) : null}
				{@const rootEId = commentEv.tags?.find((t) => t[0] === 'E' && t[1])?.[1] ?? null}
				{@const eParentTag = commentEv.tags?.find((t) => t[0] === 'e' && t[1])}
				{@const parentId = eParentTag?.[1] && eParentTag[1] !== rootEId ? eParentTag[1] : null}
				{@const parentComment = parentId
					? (activityCommentMap.get(parentId) ??
						activityCommentMap.get(parentId.toLowerCase()) ??
						null)
					: null}
				{@const parentAuthorRaw = parentComment ? activityProfiles.get(parentComment.pubkey) : null}
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
				{@const isDeeperReply = !!parentId}
				{@const appMeta = rootATag ? appByAddr.get(rootATag) : null}
				{@const rootBadgeSkeleton = !!rootATag && !appMeta && !rootEvent}
				{@const appBadge = (() => {
					if (appMeta) {
						return {
							iconUrl: appMeta.icon || null,
							name: appMeta.name,
							identifier: appMeta.id
						};
					}
					if (rootEvent?.kind === EVENT_KINDS.APP) {
						const p = parseApp(rootEvent);
						return {
							iconUrl: p.icon ?? null,
							name: p.name,
							identifier: p.dTag
						};
					}
					return null;
				})()}
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div
					class="activity-item"
					role="button"
					tabindex="0"
					onclick={() => openThread(commentEv)}
					onkeydown={(e) => e.key === 'Enter' && openThread(commentEv)}
				>
					<CommentCard
						event={commentEv}
						{authorProfile}
						{rootEvent}
						{parentComment}
						{parentCommentAuthor}
						{parentZapParsed}
						{parentZapperAuthor}
						{appBadge}
						{rootBadgeSkeleton}
						profileUrl={authorNpub ? `/profile/${authorNpub}` : ''}
						resolveMentionLabel={(pk) =>
							activityProfiles.get(pk)?.displayName ??
							activityProfiles.get(pk)?.name ??
							pk?.slice(0, 8) ??
							''}
						onRootClick={rootATag ? () => openAppForComment(rootATag) : null}
						feedActions={{
							onReply: () => openThread(commentEv, true),
							onZap: () => openThread(commentEv),
							onOptions: () => openThread(commentEv)
						}}
					/>
				</div>
			{:else}
				{@const zapEv = item.row.event}
				{@const zParsed = item.row.parsed}
				{@const aRootZ = appATagFromZapEvent(zapEv)}
				{@const rootEventZ = aRootZ ? (rootAppEvents.get(aRootZ) ?? null) : null}
				{@const appMetaZ = aRootZ ? appByAddr.get(aRootZ) : null}
				{@const rootBadgeSkeletonZ = !!aRootZ && !appMetaZ && !rootEventZ}
				{@const appBadgeZ = (() => {
					if (appMetaZ) {
						return {
							iconUrl: appMetaZ.icon || null,
							name: appMetaZ.name,
							identifier: appMetaZ.id
						};
					}
					if (rootEventZ?.kind === EVENT_KINDS.APP) {
						const p = parseApp(rootEventZ);
						return {
							iconUrl: p.icon ?? null,
							name: p.name,
							identifier: p.dTag
						};
					}
					return null;
				})()}
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
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div
					class="activity-item"
					role="button"
					tabindex="0"
					onclick={() => openZapThread(zapEv)}
					onkeydown={(e) => e.key === 'Enter' && openZapThread(zapEv)}
				>
					<ZapActivityCard
						zapEvent={zapEv}
						parsed={zParsed}
						zapperPubkey={zapperPk}
						authorProfile={zapperAuthor}
						rootEvent={rootEventZ}
						parentComment={parentCommentZ}
						parentCommentAuthor={parentCommentAuthorZ}
						appBadge={appBadgeZ}
						rootBadgeSkeleton={rootBadgeSkeletonZ}
						profileUrl={zapperNpub ? `/profile/${zapperNpub}` : ''}
						resolveMentionLabel={(pk) =>
							activityProfiles.get(pk)?.displayName ??
							activityProfiles.get(pk)?.name ??
							pk?.slice(0, 8) ??
							''}
						onRootClick={aRootZ ? () => openAppForComment(aRootZ) : null}
						feedActions={{
							onReply: () => openZapThread(zapEv, true),
							onZap: () => openZapThread(zapEv),
							onOptions: () => openZapThread(zapEv)
						}}
					/>
				</div>
			{/if}
		{/each}
	</div>
{/if}

{#if threadModalKind === 'comment' && threadModalRootId && threadModalRootEvent}
	{@const _rootEv = threadModalRootEvent}
	{#key threadModalRootId}
		{@const _aRoot = _rootEv.tags?.find((t) => t[0] === 'A' && t[1])?.[1] ?? null}
		{@const _appMeta = _aRoot ? appByAddr.get(_aRoot) : null}
		{@const _authorRaw = activityProfiles.get(_rootEv.pubkey)}
		{@const _authorNpub = (() => {
			try {
				return nip19.npubEncode(_rootEv.pubkey);
			} catch {
				return '';
			}
		})()}
		{@const _parts = _aRoot?.split(':') ?? []}
		{@const _appPubkey = _parts[1] ?? ''}
		{@const _appDTag = _parts.slice(2).join(':') ?? ''}
		{@const _appNaddr = (() => {
			try {
				return _appPubkey && _appDTag ? encodeAppNaddr(_appPubkey, _appDTag) : null;
			} catch {
				return null;
			}
		})()}
		{@const _evVersion = _rootEv.tags?.find((t) => t[0] === 'v' && t[1])?.[1] ?? ''}
		<RootComment
			hideRoot={true}
			openThreadOnMount={true}
			{openReplyOnMount}
			initialReplyTarget={initialReplyTargetForModal}
			id={_rootEv.id}
			content={_rootEv.content ?? ''}
			version={_evVersion}
			emojiTags={(_rootEv.tags ?? [])
				.filter((t) => t[0] === 'emoji' && t[1] && t[2])
				.map((t) => ({ shortcode: t[1], url: t[2] }))}
			mediaUrls={(_rootEv.tags ?? []).filter((t) => t[0] === 'media' && t[1]).map((t) => t[1])}
			pictureUrl={_authorRaw?.picture ?? null}
			name={_authorRaw?.displayName ?? _authorRaw?.name ?? ''}
			pubkey={_rootEv.pubkey}
			timestamp={_rootEv.created_at}
			profileUrl={_authorNpub ? `/profile/${_authorNpub}` : ''}
			threadComments={selectedThreadComments}
			threadZaps={[]}
			appIconUrl={_appMeta?.icon ?? null}
			appName={_appMeta?.name ?? ''}
			appIdentifier={_appMeta?.id ?? _appDTag}
			rootContext={_appMeta || _appNaddr
				? {
						label: _appMeta?.name ?? _appDTag,
						iconUrl: _appMeta?.icon ?? null,
						href: _appNaddr ? `/apps/${_appNaddr}` : ''
					}
				: null}
			onModalClose={() => {
				threadLoadGen++;
				threadModalKind = null;
				threadModalRootId = null;
				threadModalRootEvent = null;
				initialReplyTargetForModal = null;
				selectedThreadComments = [];
				selectedThreadZaps = [];
			}}
			{signEvent}
			{searchProfiles}
			{searchEmojis}
			onReplySubmit={_aRoot ? (e) => handleThreadReply(_aRoot, e) : undefined}
			onZapReceived={() => {}}
			onGetStarted={() => {}}
		/>
	{/key}
{/if}

{#if threadModalKind === 'zap' && threadModalZapId && threadModalZapEvent}
	{@const _zEv = threadModalZapEvent}
	{@const _zParsed = parseZapReceipt(_zEv)}
	{@const _aRootZ = appATagFromZapEvent(_zEv)}
	{@const _appMetaZ = _aRootZ ? appByAddr.get(_aRootZ) : null}
	{@const _partsZ = _aRootZ?.split(':') ?? []}
	{@const _appPubkeyZ = _partsZ[1] ?? ''}
	{@const _appDTagZ = _partsZ.slice(2).join(':') ?? ''}
	{@const _appNaddrZ = (() => {
		try {
			return _appPubkeyZ && _appDTagZ ? encodeAppNaddr(_appPubkeyZ, _appDTagZ) : null;
		} catch {
			return null;
		}
	})()}
	{@const _zapperRaw = _zParsed.senderPubkey ? activityProfiles.get(_zParsed.senderPubkey) : null}
	{@const _zapperNpubZ = (() => {
		try {
			return _zParsed.senderPubkey ? nip19.npubEncode(_zParsed.senderPubkey) : '';
		} catch {
			return '';
		}
	})()}
	{#key threadModalZapId}
		<RootComment
			hideRoot={true}
			openThreadOnMount={true}
			{openReplyOnMount}
			initialReplyTarget={initialReplyTargetForModal}
			isZapRoot={true}
			id={_zEv.id}
			content={_zParsed.comment ?? ''}
			zapAmount={_zParsed.amountSats ?? 0}
			emojiTags={_zParsed.emojiTags ?? []}
			mediaUrls={[]}
			pictureUrl={_zapperRaw?.picture ?? null}
			name={_zapperRaw?.displayName ?? _zapperRaw?.name ?? ''}
			pubkey={_zParsed.senderPubkey ?? ''}
			timestamp={_zEv.created_at}
			profileUrl={_zapperNpubZ ? `/profile/${_zapperNpubZ}` : ''}
			authorPubkey={_appPubkeyZ}
			threadComments={selectedThreadComments}
			threadZaps={selectedThreadZaps}
			appIconUrl={_appMetaZ?.icon ?? null}
			appName={_appMetaZ?.name ?? ''}
			appIdentifier={_appMetaZ?.id ?? _appDTagZ}
			version=""
			rootContext={_appMetaZ || _appNaddrZ
				? {
						label: _appMetaZ?.name ?? _appDTagZ,
						iconUrl: _appMetaZ?.icon ?? null,
						href: _appNaddrZ ? `/apps/${_appNaddrZ}` : ''
					}
				: null}
			onModalClose={() => {
				threadLoadGen++;
				threadModalKind = null;
				threadModalZapId = null;
				threadModalZapEvent = null;
				initialReplyTargetForModal = null;
				selectedThreadComments = [];
				selectedThreadZaps = [];
			}}
			{signEvent}
			{searchProfiles}
			{searchEmojis}
			onReplySubmit={_aRootZ ? (e) => handleThreadReply(_aRootZ, e) : undefined}
			onZapReceived={() => {}}
			onGetStarted={() => {}}
		/>
	{/key}
{/if}

<style>
	.empty-state-wrap {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		justify-content: center;
		min-height: 280px;
		width: 100%;
	}

	/* Tight padding for EmptyState (match SocialTabs-style ~16–20px) */
	.empty-state-wrap :global(.empty-state-text) {
		padding: 16px 20px !important;
	}

	/* Match community Activity tab skeleton; negative margin aligns with .activity-list */
	.inbox-feed-skeleton-wrap {
		margin: 0 -20px;
	}

	.activity-list {
		display: flex;
		flex-direction: column;
		margin: 0 -20px;
	}

	.activity-item {
		padding: 12px 20px;
		border-bottom: 1px solid hsl(var(--white11));
		cursor: pointer;
	}

	.activity-item:last-child {
		border-bottom: none;
	}
</style>
