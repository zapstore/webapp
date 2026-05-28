/**
 * Activity thread modals for profile pages — same openThread / zap-thread behavior as
 * CommunityActivityShell (forum E-tag roots, app/stack A-tag roots, zap modals).
 */
/* eslint-disable svelte/prefer-svelte-reactivity -- local Set workspaces here are short-lived batch/dedupe helpers, not component state */
import { SvelteMap } from 'svelte/reactivity';
import { nip19 } from 'nostr-tools';
import {
	addrTagFromComment,
	fetchKind1111ByTagRef,
	fetchKind9735MatchingRefs,
	fetchProfilesBatch,
	parseComment,
	parseZapReceipt,
	publishComment,
	putEvents,
	queryEvent,
	queryEvents
} from '$lib/purpleweb';
import {
	collectCommentSubtree,
	resolveAppDiscussionRootCommentId,
	resolveForumDiscussionRootCommentId,
	walkAppDiscussionRootInMap
} from '$lib/nostr/thread-discussion.js';
import {
	collectCommentsUnderParent,
	collectZapReceiptsUnderZap,
	findEnclosingZapReceiptForComment
} from '$lib/nostr/zap-thread.js';
import { parseApp, parseAppStack } from '$lib/nostr/models.js';
import {
	COMMENT_PUBLISH_RELAYS,
	EVENT_KINDS,
	ZAPSTORE_RELAY,
	commentZapRelayReadSince
} from '$lib/config.js';

function activityRelaySince() {
	return commentZapRelayReadSince();
}

function isAddressableActivityATag(a) {
	if (!a) return false;
	return a.startsWith(`${EVENT_KINDS.APP}:`) || a.startsWith(`${EVENT_KINDS.APP_STACK}:`);
}

/** @param {import('nostr-tools').NostrEvent} ev */
export function parseZapWrapper(ev) {
	const zTag = ev.tags?.find((t) => t[0] === 'z' && typeof t[1] === 'string' && t[1]);
	if (!zTag) return null;
	const receiptId = String(zTag[1]).trim().toLowerCase();
	if (!/^[a-f0-9]{64}$/.test(receiptId)) return null;

	let amountSats = 0;
	const amtStr = String(zTag[3] ?? '').trim();
	if (amtStr) {
		const unit = String(zTag[4] ?? 'sats').trim().toLowerCase();
		const n = parseFloat(amtStr);
		if (Number.isFinite(n) && n > 0) {
			amountSats = unit === 'msats' || unit === 'msat' ? Math.round(n / 1000) : Math.round(n);
		}
	}
	const recipientPubkey = ev.tags?.find((t) => t[0] === 'P' && t[1])?.[1]?.toLowerCase() ?? null;
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

/** @param {import('nostr-tools').NostrEvent | null} ev */
export function appATagFromZapEvent(ev) {
	return (
		ev?.tags?.find((t) => t[0] === 'A' && t[1])?.[1] ??
		ev?.tags?.find((t) => t[0] === 'a' && t[1])?.[1] ??
		null
	);
}

/** @param {ReturnType<typeof parseZapReceipt>} parsed @param {Map<string, import('nostr-tools').NostrEvent>} roots @param {Map<string, import('nostr-tools').NostrEvent>} commentMap */
function resolveForumPostIdForZapActivity(parsed, roots, commentMap) {
	const zid = parsed?.zappedEventId;
	if (!zid) return null;
	if (roots.has(zid) || roots.has(zid.toLowerCase())) return zid;
	const c = commentMap.get(zid) ?? commentMap.get(zid.toLowerCase());
	if (c) return c.tags?.find((t) => t[0] === 'E' && t[1])?.[1] ?? null;
	return zid;
}

/** @param {import('nostr-tools').NostrEvent} zapEv @param {ReturnType<typeof parseZapReceipt>} parsed @param {Map<string, import('nostr-tools').NostrEvent>} commentMap @param {Map<string, import('nostr-tools').NostrEvent>} forumRoots */
export function addrATagForAppStackZap(zapEv, parsed, commentMap) {
	const direct = appATagFromZapEvent(zapEv);
	if (isAddressableActivityATag(direct)) return direct;
	const zid = parsed?.zappedEventId;
	if (!zid) return null;
	const c = commentMap.get(zid) ?? commentMap.get(zid.toLowerCase());
	if (!c) return null;
	const a = addrTagFromComment(c);
	return isAddressableActivityATag(a) ? a : null;
}

/** @param {ReturnType<typeof parseZapReceipt>} parsed @param {Map<string, import('nostr-tools').NostrEvent>} forumRoots @param {Map<string, import('nostr-tools').NostrEvent>} commentMap */
export function forumPostIdForZapParsed(parsed, forumRoots, commentMap) {
	return resolveForumPostIdForZapActivity(parsed, forumRoots, commentMap);
}

/** @param {import('nostr-tools').NostrEvent | null} ev */
export function appBadgeFromAddrRoot(ev) {
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

/** @param {'forum' | 'app' | 'stack'} kind */
export function activityDeletedRootLabel(kind) {
	if (kind === 'forum') return 'Publication not found';
	if (kind === 'app') return 'App not found';
	return 'Stack not found';
}

/** @param {import('nostr-tools').NostrEvent | null} ev */
export function hrefForActivityRootEvent(ev) {
	if (!ev?.id) return null;
	try {
		if (ev.kind === EVENT_KINDS.FORUM_POST) {
			return `/community/forum/${nip19.neventEncode({ id: ev.id })}`;
		}
		const dTag = ev.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
		if (!dTag) return null;
		const naddr = nip19.naddrEncode({ kind: ev.kind, pubkey: ev.pubkey, identifier: dTag });
		return ev.kind === EVENT_KINDS.APP ? `/apps/${naddr}` : `/stacks/${naddr}`;
	} catch {
		return null;
	}
}

/**
 * @param {() => ReturnType<import('$lib/purpleweb/svelte/profile-activity.svelte.js').createProfileActivityQuery>} getActivity
 * @param {() => import('$lib/stores/auth.svelte.js').signEvent} getSignEvent
 */
export function createProfileActivityThreadModal(getActivity, getSignEvent) {
	let threadModalRootId = $state(/** @type {string | null} */ (null));
	let threadModalRootEvent = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
	let threadModalAddrATag = $state(/** @type {string | null} */ (null));
	let threadModalExpandCommentId = $state(/** @type {string | null} */ (null));
	let initialReplyTargetForModal = $state(/** @type {Record<string, unknown> | null} */ (null));
	let threadLoadGen = 0;
	let openReplyOnMount = $state(false);
	let threadOpenActionsOnMount = $state(false);
	let threadOpenFeedActionsOnly = $state(false);
	let threadOpenFeedZapOnly = $state(false);
	let standaloneActionsOpenKey = $state(0);
	let standaloneZapOpenKey = $state(0);
	let threadInitialActionsTarget = $state(/** @type {'root' | Record<string, unknown> | null} */ (null));
	let pendingActionsCommentEv = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
	let pendingZapCommentEv = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
	let selectedThreadComments = $state(/** @type {any[]} */ ([]));
	let selectedThreadZaps = $state(/** @type {any[]} */ ([]));
	let threadModalKind = $state(/** @type {'comment' | 'zap' | null} */ (null));
	let threadModalZapId = $state(/** @type {string | null} */ (null));
	let threadModalZapEvent = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));

	function buildCommentMap() {
		const activity = getActivity();
		const cmap = new SvelteMap();
		for (const c of activity.comments) {
			cmap.set(c.id.toLowerCase(), c);
		}
		for (const parent of activity.parentCommentMap.values()) {
			cmap.set(parent.id.toLowerCase(), parent);
		}
		return cmap;
	}

	function buildForumRootsMap() {
		const activity = getActivity();
		const roots = new SvelteMap();
		for (const c of activity.comments) {
			const eRoot = c.tags?.find((t) => t[0] === 'E' && t[1])?.[1];
			if (!eRoot) continue;
			const ev = activity.lookupRootEvent({ type: 'id', value: eRoot });
			if (ev) {
				roots.set(eRoot, ev);
				roots.set(eRoot.toLowerCase(), ev);
			}
		}
		return roots;
	}

	async function fetchEventById(id) {
		const local = await queryEvent({ ids: [id] });
		if (local) return local;
		const { fetchFromRelays } = await import('$lib/purpleweb');
		const fetched = await fetchFromRelays(
			[ZAPSTORE_RELAY],
			{ ids: [id], limit: 1 },
			{ timeout: 4000, feature: 'profile-thread-parent' }
		);
		return fetched[0] ?? null;
	}

	async function buildZapMap(postId, aRoot, _commentMap) {
		const zmap = new SvelteMap();
		if (postId) {
			const [lo, up] = await Promise.all([
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#E': [postId], limit: 300 }),
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#e': [postId], limit: 300 })
			]);
			const seen = new SvelteMap();
			for (const e of [...lo, ...up]) seen.set(e.id, e);
			const comments = [...seen.values()];
			const eTargets = [...new Set([postId, ...comments.map((c) => c.id)])];
			const [zLo, zUp] = await Promise.all([
				queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#e': eTargets, limit: 400 }),
				queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#E': eTargets, limit: 400 })
			]);
			for (const z of [...zLo, ...zUp]) {
				zmap.set(z.id.toLowerCase(), z);
			}
		}
		if (aRoot && isAddressableActivityATag(aRoot)) {
			const [zLo, zUp] = await Promise.all([
				queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#A': [aRoot], limit: 400 }),
				queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#a': [aRoot], limit: 400 })
			]);
			for (const z of [...zLo, ...zUp]) {
				zmap.set(z.id.toLowerCase(), z);
			}
		}
		return zmap;
	}

	function enrichReplyTargetForModal(commentEv) {
		const activity = getActivity();
		const c = parseComment(commentEv);
		const p = activity.mentionProfiles.get(commentEv.pubkey);
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

	function getProfile(pk) {
		return getActivity().mentionProfiles.get(pk);
	}

	async function enrichAndSetActivityThread(rootId, gen, byIdMap) {
		const evs = Array.from(byIdMap.values()).sort((a, b) => a.created_at - b.created_at);
		const pks = [...new Set(evs.map((e) => e.pubkey))];
		const profileResults = await fetchProfilesBatch(pks, { timeout: 4000 }).catch(() => new SvelteMap());
		const profileMap = new SvelteMap();
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
		if (gen !== threadLoadGen || threadModalRootId !== rootId || threadModalKind !== 'comment') return;
		selectedThreadComments = evs.map((e) => {
			const c = parseComment(e);
			const p = profileMap.get(e.pubkey) ?? getProfile(e.pubkey);
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
			const byId = new SvelteMap(subtree.map((e) => [e.id, e]));

			fetchKind1111ByTagRef([ZAPSTORE_RELAY], 'e', postId, {
				since: activityRelaySince(),
				limit: 300,
				timeout: 5000,
				feature: 'profile-thread-forum'
			})
				.then(async (relayComments) => {
					const pool = [...merged];
					for (const e of relayComments) {
						if (!pool.some((x) => x.id === e.id)) pool.push(e);
					}
					const sub2 = collectCommentSubtree(rootId, pool);
					const m2 = new SvelteMap(sub2.map((e) => [e.id, e]));
					await putEvents([...m2.values()]).catch(() => {});
					if (gen !== threadLoadGen || threadModalKind !== 'comment') return;
					await enrichAndSetActivityThread(rootId, gen, m2);
				})
				.catch(() => {});

			await enrichAndSetActivityThread(rootId, gen, byId);
		} catch (err) {
			console.error('[ProfileActivity] forum thread load failed', err);
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
			const byId = new SvelteMap(subtree.map((e) => [e.id, e]));

			fetchKind1111ByTagRef([ZAPSTORE_RELAY], 'a', aRoot, {
				since: activityRelaySince(),
				limit: 500,
				timeout: 5000,
				feature: 'profile-thread-addr'
			})
				.then(async (relayComments) => {
					const pool = [...merged];
					for (const e of relayComments) {
						if (!pool.some((x) => x.id === e.id)) pool.push(e);
					}
					const sub2 = collectCommentSubtree(rootId, pool);
					const m2 = new SvelteMap(sub2.map((e) => [e.id, e]));
					await putEvents([...m2.values()]).catch(() => {});
					if (gen !== threadLoadGen || threadModalKind !== 'comment') return;
					await enrichAndSetActivityThread(rootId, gen, m2);
				})
				.catch(() => {});

			await enrichAndSetActivityThread(rootId, gen, byId);
		} catch (err) {
			console.error('[ProfileActivity] addr thread load failed', err);
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
		const profileResults = await fetchProfilesBatch(pks, { timeout: 4000 }).catch(() => new SvelteMap());
		const profileMap = new SvelteMap();
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
		if (
			gen !== threadLoadGen ||
			(threadModalZapId ?? '').toLowerCase() !== (zapRootId ?? '').toLowerCase()
		)
			return;

		selectedThreadComments = commentEvents
			.map((e) => {
				const c = parseComment(e);
				const p = profileMap.get(e.pubkey) ?? getProfile(e.pubkey);
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

		selectedThreadZaps = zapReceiptEvents
			.map((ev) => {
				const z = parseZapReceipt(ev);
				const p = z.senderPubkey
					? (profileMap.get(z.senderPubkey) ?? getProfile(z.senderPubkey))
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
			const zMap = new SvelteMap();
			for (const z of [...zLo, ...zUp]) zMap.set(z.id, z);
			let poolZaps = [...zMap.values()];

			const zLower = zapId.toLowerCase();
			let commThread = collectCommentsUnderParent(zLower, merged);
			let zapThread = collectZapReceiptsUnderZap(zLower, poolZaps);

			fetchKind1111ByTagRef([ZAPSTORE_RELAY], 'e', postId, {
				since: activityRelaySince(),
				limit: 300,
				timeout: 5000,
				feature: 'profile-zap-thread-comments'
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
						{ since: rs, limit: 400, timeout: 5000, feature: 'profile-zap-thread-zaps' }
					).catch(() => []);
					for (const z of zz) {
						if (!poolZaps.some((x) => x.id === z.id)) poolZaps.push(z);
					}
					await putEvents([...pool, ...poolZaps]).catch(() => {});
					if (gen !== threadLoadGen) return;
					commThread = collectCommentsUnderParent(zLower, pool);
					zapThread = collectZapReceiptsUnderZap(zLower, poolZaps);
					await enrichZapModalThread(zapId, gen, commThread, zapThread);
				})
				.catch(() => {});

			await enrichZapModalThread(zapId, gen, commThread, zapThread);
		} catch (err) {
			console.error('[ProfileActivity] zap forum thread load failed', err);
		}
	}

	async function loadZapAddrThread(zapId, aRoot, gen) {
		try {
			const mergeComments = async () => {
				const [lo, up] = await Promise.all([
					queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#A': [aRoot], limit: 500 }),
					queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#a': [aRoot], limit: 500 })
				]);
				const m = new SvelteMap();
				for (const e of [...lo, ...up]) m.set(e.id, e);
				return [...m.values()];
			};
			const mergeZaps = async () => {
				const [lo, up] = await Promise.all([
					queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#A': [aRoot], limit: 400 }),
					queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#a': [aRoot], limit: 400 })
				]);
				const m = new SvelteMap();
				for (const e of [...lo, ...up]) m.set(e.id, e);
				return [...m.values()];
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
					feature: 'profile-zap-addr-comments'
				}),
				fetchKind9735MatchingRefs(
					[ZAPSTORE_RELAY],
					{ aTag: aRoot },
					{ since: activityRelaySince(), limit: 400, timeout: 5000, feature: 'profile-zap-addr-zaps' }
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
					await enrichZapModalThread(zapId, gen, commThread, zapThread);
				})
				.catch(() => {});

			await enrichZapModalThread(zapId, gen, commThread, zapThread);
		} catch (err) {
			console.error('[ProfileActivity] zap addr thread load failed', err);
		}
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

		const cmap = buildCommentMap();
		const forumRoots = buildForumRootsMap();

		if (postId) {
			(async () => {
				const zmap = await buildZapMap(postId, null, cmap);
				const encZap = await findEnclosingZapReceiptForComment(
					commentEv,
					cmap,
					zmap,
					fetchEventById
				);
				if (gen !== threadLoadGen) return;

				if (encZap) {
					let zp;
					try {
						zp = parseZapReceipt(encZap);
					} catch {
						return;
					}
					const postIdZap = forumPostIdForZapParsed(zp, forumRoots, cmap);
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
						const isRoot =
							pendingActionsCommentEv.id.toLowerCase() === encZap.id.toLowerCase();
						threadInitialActionsTarget = isRoot
							? 'root'
							: enrichReplyTargetForModal(pendingActionsCommentEv);
					}

					loadZapForumThread(postIdZap, encZap.id, gen);
					return;
				}

				const rootId = await resolveForumDiscussionRootCommentId(
					commentEv,
					postId,
					cmap,
					fetchEventById
				);
				if (gen !== threadLoadGen) return;

				let rootEv = cmap.get(rootId.toLowerCase());
				if (!rootEv) {
					rootEv = await fetchEventById(rootId);
					if (rootEv) cmap.set(rootEv.id.toLowerCase(), rootEv);
				}
				if (!rootEv || gen !== threadLoadGen) return;

				threadModalKind = 'comment';
				threadModalRootId = rootId;
				threadModalRootEvent = rootEv;
				threadModalAddrATag = null;
				threadModalExpandCommentId =
					!openActionsSheet &&
					!openZapOnly &&
					commentEv.id.toLowerCase() !== rootId.toLowerCase()
						? commentEv.id
						: null;
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
			const zmap = await buildZapMap(null, aRoot, cmap);
			const encZap = await findEnclosingZapReceiptForComment(
				commentEv,
				cmap,
				zmap,
				fetchEventById
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
					const isRoot =
						pendingActionsCommentEv.id.toLowerCase() === encZap.id.toLowerCase();
					threadInitialActionsTarget = isRoot
						? 'root'
						: enrichReplyTargetForModal(pendingActionsCommentEv);
				}

				loadZapAddrThread(encZap.id, aRootZ, gen);
				return;
			}

			let rootId = walkAppDiscussionRootInMap(commentEv, cmap);
			if (!rootId) {
				rootId = await resolveAppDiscussionRootCommentId(commentEv, cmap, fetchEventById);
			}
			if (gen !== threadLoadGen) return;

			let rootEv = cmap.get(rootId.toLowerCase());
			if (!rootEv) {
				rootEv = await fetchEventById(rootId);
				if (rootEv) cmap.set(rootEv.id.toLowerCase(), rootEv);
			}
			if (!rootEv || gen !== threadLoadGen) return;

			threadModalKind = 'comment';
			threadModalRootId = rootId;
			threadModalRootEvent = rootEv;
			threadModalAddrATag = aRoot;
			threadModalExpandCommentId =
				!openActionsSheet &&
				!openZapOnly &&
				commentEv.id.toLowerCase() !== rootId.toLowerCase()
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
			}

			await loadAddrActivityThread(rootId, aRoot, gen, rootEv);
		})();
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

		const cmap = buildCommentMap();
		const forumRoots = buildForumRootsMap();
		const aAddr = addrATagForAppStackZap(zapEvent, p, cmap);
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

		const postId = forumPostIdForZapParsed(p, forumRoots, cmap);
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

	function closeThread() {
		threadLoadGen++;
		threadModalKind = null;
		threadModalRootId = null;
		threadModalRootEvent = null;
		threadModalAddrATag = null;
		threadModalExpandCommentId = null;
		threadModalZapId = null;
		threadModalZapEvent = null;
		initialReplyTargetForModal = null;
		threadOpenActionsOnMount = false;
		threadOpenFeedActionsOnly = false;
		threadOpenFeedZapOnly = false;
		threadInitialActionsTarget = null;
		pendingActionsCommentEv = null;
		pendingZapCommentEv = null;
		selectedThreadComments = [];
		selectedThreadZaps = [];
		openReplyOnMount = false;
	}

	async function handleActivityThreadReply(rootPostId, rootPostPubkey, e) {
		if (!e?.text?.trim()) return;
		const signEvent = getSignEvent();

		if (threadModalAddrATag) {
			const parts = threadModalAddrATag.split(':');
			const kindNum = parseInt(parts[0] ?? '', 10);
			const pk = parts[1];
			const identifier = parts.slice(2).join(':');
			if (
				!pk ||
				!identifier ||
				(kindNum !== EVENT_KINDS.APP && kindNum !== EVENT_KINDS.APP_STACK)
			)
				return;
			const contentType = kindNum === EVENT_KINDS.APP ? 'app' : 'stack';
			const signed = await publishComment(
				e.text,
				{ contentType, pubkey: pk, identifier },
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
			const profile = getProfile(signed.pubkey);
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
		const profile = getProfile(signed.pubkey);
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

	return {
		get threadModalKind() {
			return threadModalKind;
		},
		get threadModalRootId() {
			return threadModalRootId;
		},
		get threadModalRootEvent() {
			return threadModalRootEvent;
		},
		get threadModalAddrATag() {
			return threadModalAddrATag;
		},
		get threadModalExpandCommentId() {
			return threadModalExpandCommentId;
		},
		get threadModalZapId() {
			return threadModalZapId;
		},
		get threadModalZapEvent() {
			return threadModalZapEvent;
		},
		get selectedThreadComments() {
			return selectedThreadComments;
		},
		get selectedThreadZaps() {
			return selectedThreadZaps;
		},
		get openReplyOnMount() {
			return openReplyOnMount;
		},
		get threadOpenActionsOnMount() {
			return threadOpenActionsOnMount;
		},
		get threadOpenFeedActionsOnly() {
			return threadOpenFeedActionsOnly;
		},
		get threadOpenFeedZapOnly() {
			return threadOpenFeedZapOnly;
		},
		get standaloneActionsOpenKey() {
			return standaloneActionsOpenKey;
		},
		get standaloneZapOpenKey() {
			return standaloneZapOpenKey;
		},
		get threadInitialActionsTarget() {
			return threadInitialActionsTarget;
		},
		get pendingZapCommentEv() {
			return pendingZapCommentEv;
		},
		get initialReplyTargetForModal() {
			return initialReplyTargetForModal;
		},
		openThread,
		openZapThreadForum,
		closeThread,
		handleActivityThreadReply,
		enrichReplyTargetForModal,
		buildCommentMap,
		buildForumRootsMap
	};
}
