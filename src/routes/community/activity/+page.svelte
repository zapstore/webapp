<script lang="js">
	/**
	 * Activity feed — comments within the Zapstore forum (posts with #h tag).
	 * Uses same CommentCard as chateau; liveQuery from Dexie, seed from relay.
	 */
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import {
		fetchFromRelays,
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
		collectCommentSubtree
	} from '$lib/nostr/thread-discussion.js';
	import {
		collectCommentsUnderParent,
		collectZapReceiptsUnderZap,
		findEnclosingZapReceiptForComment
	} from '$lib/nostr/zap-thread.js';
	import { parseProfile } from '$lib/nostr/models';
	import { EVENT_KINDS, ZAPSTORE_COMMUNITY_NPUB, FORUM_RELAY } from '$lib/config';
	import { goto } from '$app/navigation';
	import CommentCard from '$lib/components/community/CommentCard.svelte';
	import ZapActivityCard from '$lib/components/community/ZapActivityCard.svelte';
	import RootComment from '$lib/components/social/RootComment.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';
	import { signEvent, getCurrentPubkey } from '$lib/stores/auth.svelte.js';
	import { createSearchProfilesFunction } from '$lib/services/profile-search.js';
	import { createSearchEmojisFunction } from '$lib/services/emoji-search.js';

	const COMMUNITY_PUBKEY = (() => {
		try {
			const d = nip19.decode(ZAPSTORE_COMMUNITY_NPUB);
			return d.type === 'npub' ? d.data : '';
		} catch {
			return '';
		}
	})();

	const RELAYS = [FORUM_RELAY];

	const FORUM_FILTER = { kinds: [EVENT_KINDS.FORUM_POST], '#h': [COMMUNITY_PUBKEY], limit: 500 };

	/** @type {import('nostr-tools').NostrEvent[]} */
	let activityComments = $state([]);
	/** @type {import('nostr-tools').NostrEvent[]} */
	let activityZapEvents = $state([]);
	/** @type {Map<string, import('nostr-tools').NostrEvent>} root id/addr -> root event */
	let activityRootEvents = $state(new Map());
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

	const activityZapsWithComment = $derived.by(() => {
		const rows = [];
		for (const ev of activityZapEvents) {
			let p;
			try {
				p = parseZapReceipt(ev);
			} catch {
				continue;
			}
			if (!p.comment?.trim() || !p.senderPubkey) continue;
			rows.push({ event: ev, parsed: p });
		}
		return rows.sort((a, b) => b.event.created_at - a.event.created_at);
	});

	const inboxFeedItems = $derived.by(() => {
		const items = [];
		for (const ev of activityComments) items.push({ kind: 'comment', ts: ev.created_at, ev });
		for (const row of activityZapsWithComment) items.push({ kind: 'zap', ts: row.event.created_at, row });
		return items.sort((a, b) => b.ts - a.ts);
	});

	function forumPostIdForZapParsed(parsed) {
		const zid = parsed?.zappedEventId;
		if (!zid) return null;
		if (activityRootEvents.has(zid)) return zid;
		const c = activityCommentMap.get(zid) ?? activityCommentMap.get(zid.toLowerCase());
		if (c) return c.tags?.find((t) => t[0] === 'E' && t[1])?.[1] ?? null;
		/* Direct zap on the forum post (e-tag = post id) */
		return zid;
	}

	let activityReady = $state(false);
	let activityLoading = $state(false);
	let activityError = $state('');

	// liveQuery: forum comments + zaps whose #e targets a post or comment in this community
	const activityQuery = $derived(
		browser && COMMUNITY_PUBKEY && activityReady
			? liveQuery(async () => {
					const forumEvs = await queryEvents(FORUM_FILTER);
					const rootIds = forumEvs.map((e) => e.id).filter(Boolean);
					if (rootIds.length === 0) return { comments: [], zaps: [] };

					const [commentsE, commentsEUpper] = await Promise.all([
						queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#E': rootIds, limit: 300 }),
						queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#e': rootIds, limit: 300 })
					]);
					const byId = new Map();
					for (const ev of [...commentsE, ...commentsEUpper]) byId.set(ev.id, ev);
					const commentList = Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);

					const eTargets = [...new Set([...rootIds, ...commentList.map((c) => c.id)])];
					const zById = new Map();
					if (eTargets.length > 0) {
						const [zLo, zUp] = await Promise.all([
							queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#e': eTargets, limit: 400 }),
							queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#E': eTargets, limit: 400 })
						]);
						for (const z of [...zLo, ...zUp]) zById.set(z.id, z);
					}
					return {
						comments: commentList,
						zaps: Array.from(zById.values()).sort((a, b) => b.created_at - a.created_at)
					};
				})
			: null
	);

	$effect(() => {
		if (!activityQuery) return;
		const sub = activityQuery.subscribe({
			next: (val) => {
				const comments = val?.comments ?? [];
				const zaps = val?.zaps ?? [];
				activityComments = comments;
				activityZapEvents = zaps;
				const commentById = new Map();
				for (const c of comments) {
					commentById.set(c.id, c);
					commentById.set(c.id.toLowerCase(), c);
				}
				for (const ev of comments) {
					resolveActivityRootEvent(ev);
					scheduleActivityProfileFetch(ev.pubkey);
					const parentTag = ev.tags?.find((t) => t[0] === 'e' && t[1]);
					if (parentTag?.[1]) {
						const parent = commentById.get(parentTag[1]) ?? commentById.get(parentTag[1].toLowerCase());
						if (parent?.pubkey) scheduleActivityProfileFetch(parent.pubkey);
					}
				}
				for (const zEv of zaps) {
					try {
						const zp = parseZapReceipt(zEv);
						if (zp.senderPubkey) scheduleActivityProfileFetch(zp.senderPubkey);
						const zapped = zp.zappedEventId;
						if (
							zapped &&
							!commentById.get(zapped) &&
							!commentById.get(zapped.toLowerCase()) &&
							!activityRootEvents.get(zapped)
						) {
							void queryEvent({ ids: [zapped] }).then((ev) => {
								if (ev?.kind === EVENT_KINDS.FORUM_POST) {
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
				activityError = 'Failed to load activity.';
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
			const arr = await fetchFromRelays(RELAYS, { ids: [rootId], limit: 1 }, { timeout: 4000 });
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

	async function seedActivityFromRelay() {
		if (!COMMUNITY_PUBKEY || !browser) return;
		activityLoading = true;
		activityError = '';
		try {
			const forumEvs = await queryEvents(FORUM_FILTER);
			const rootIds = forumEvs.map((e) => e.id).filter(Boolean);
			if (rootIds.length > 0) {
				const evs = await fetchFromRelays(
					RELAYS,
					{ kinds: [EVENT_KINDS.COMMENT], '#E': rootIds, limit: 500 },
					{ timeout: 7000 }
				);
				if (evs?.length) await putEvents(evs).catch(() => {});
				const byC = new Map();
				for (const e of evs ?? []) byC.set(e.id, e);
				const commentIds = [...byC.keys()];
				const eTargets = [...new Set([...rootIds, ...commentIds])];
				if (eTargets.length > 0) {
					const zEvs = await fetchFromRelays(
						RELAYS,
						{ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#e': eTargets, limit: 400 },
						{ timeout: 7000 }
					).catch(() => []);
					if (zEvs?.length) await putEvents(zEvs).catch(() => {});
				}
			}
		} catch (err) {
			console.error('[Activity] relay seed failed', err);
			activityError = 'Failed to sync activity.';
		} finally {
			activityLoading = false;
		}
	}

	/** Navigate to the forum post page (root label row click only). */
	function openRootPost(rootEvent) {
		if (!rootEvent?.id) return;
		try {
			const nevent = nip19.neventEncode({ id: rootEvent.id });
			goto(`/community/forum/${nevent}`);
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
	let selectedThreadComments = $state(/** @type {any[]} */ ([]));
	let selectedThreadZaps = $state(/** @type {any[]} */ ([]));
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
		const postId = commentEv.tags?.find((t) => t[0] === 'E' && t[1])?.[1] ?? null;
		if (!postId) return;

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
				threadModalZapId = encZap.id;
				threadModalZapEvent = encZap;
				initialReplyTargetForModal =
					withReply && commentEv.id.toLowerCase() !== encZap.id.toLowerCase()
						? enrichReplyTargetForModal(commentEv)
						: null;

				loadZapForumThread(postIdZap, encZap.id, gen);
				return;
			}

			const rootId = await resolveForumDiscussionRootCommentId(
				commentEv,
				postId,
				cmap,
				(id) => queryEvent({ ids: [id] }).catch(() => null)
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
			initialReplyTargetForModal =
				withReply && commentEv.id.toLowerCase() !== rootId.toLowerCase()
					? enrichReplyTargetForModal(commentEv)
					: null;

			await loadActivityThread(postId, rootId, gen, rootEv);
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

			fetchFromRelays(
				RELAYS,
				{ kinds: [EVENT_KINDS.COMMENT], '#E': [postId], limit: 300 },
				{ timeout: 5000 }
			)
				.then(async (evs) => {
					const pool = [...merged];
					for (const e of evs) {
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

	async function enrichAndSetActivityThread(rootId, gen, byIdMap) {
		const evs = Array.from(byIdMap.values()).sort((a, b) => a.created_at - b.created_at);
		const pks = [...new Set(evs.map((e) => e.pubkey))];
		const profileResults = await fetchProfilesBatch(pks, { timeout: 4000 }).catch(() => new Map());
		const profileMap = new Map();
		for (const [pk, ev] of profileResults) {
			if (ev?.content) {
				try {
					const j = JSON.parse(ev.content);
					profileMap.set(pk, { displayName: j.display_name ?? j.name, name: j.name, picture: j.picture });
				} catch { /* ignore */ }
			}
		}
		if (gen !== threadLoadGen || threadModalRootId !== rootId || threadModalKind !== 'comment') return;
		selectedThreadComments = evs.map((e) => {
			const c = parseComment(e);
			const p = profileMap.get(e.pubkey) ?? activityProfiles.get(e.pubkey);
			let npub = '';
			try { npub = nip19.npubEncode(e.pubkey); } catch { /* ignore */ }
			return {
				...c,
				displayName: p?.displayName ?? p?.name ?? (npub ? `npub1${npub.slice(5, 8)}…${npub.slice(-6)}` : e.pubkey.slice(0, 8)),
				avatarUrl: p?.picture ?? null,
				profileUrl: npub ? `/profile/${npub}` : '',
				profileLoading: false
			};
		});
	}

	async function handleActivityThreadReply(rootPostId, rootPostPubkey, e) {
		if (!rootPostId || !e?.text?.trim()) return;
		const signed = await publishComment(
			e.text,
			{ contentType: 'forum', pubkey: rootPostPubkey, id: rootPostId, kind: EVENT_KINDS.FORUM_POST },
			signEvent,
			e.emojiTags ?? [],
			e.parentId ?? null,
			e.replyToPubkey ?? null,
			e.parentKind ?? EVENT_KINDS.COMMENT,
			e.mentions ?? [],
			RELAYS,
			e.mediaUrls ?? []
		);
		const parsed = parseComment(signed);
		let npub = '';
		try { npub = nip19.npubEncode(signed.pubkey); } catch { /* ignore */ }
		const profile = activityProfiles.get(signed.pubkey);
		selectedThreadComments = [
			...selectedThreadComments,
			{
				...parsed,
				displayName: profile?.displayName ?? profile?.name ?? (npub ? `npub1${npub.slice(5, 8)}…${npub.slice(-6)}` : signed.pubkey.slice(0, 8)),
				avatarUrl: profile?.picture ?? null,
				profileUrl: npub ? `/profile/${npub}` : '',
				profileLoading: false
			}
		];
	}

	function openZapThreadForum(zapEvent, withReply = false) {
		let p;
		try {
			p = parseZapReceipt(zapEvent);
		} catch {
			return;
		}
		const postId = forumPostIdForZapParsed(p);
		if (!postId) return;

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

			fetchFromRelays(
				RELAYS,
				{ kinds: [EVENT_KINDS.COMMENT], '#E': [postId], limit: 300 },
				{ timeout: 5000 }
			)
				.then(async (evs) => {
					const pool = [...merged];
					for (const e of evs) {
						if (!pool.some((x) => x.id === e.id)) pool.push(e);
					}
					const et2 = [...new Set([postId, ...pool.map((c) => c.id)])];
					const [zz1, zz2] = await Promise.all([
						fetchFromRelays(
							RELAYS,
							{ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#e': et2, limit: 400 },
							{ timeout: 5000 }
						).catch(() => []),
						fetchFromRelays(
							RELAYS,
							{ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#E': et2, limit: 400 },
							{ timeout: 5000 }
						).catch(() => [])
					]);
					for (const z of [...zz1, ...zz2]) {
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
					profileMap.set(pk, { displayName: j.display_name ?? j.name, name: j.name, picture: j.picture });
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
				const p = z.senderPubkey ? profileMap.get(z.senderPubkey) ?? activityProfiles.get(z.senderPubkey) : null;
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
						(npub ? `npub1${npub.slice(5, 8)}…${npub.slice(-6)}` : (z.senderPubkey ?? '').slice(0, 8)),
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

	onMount(() => {
		if (!browser) return;
		activityReady = true;
		seedActivityFromRelay();
	});
</script>

<svelte:head>
	<title>Activity — Zapstore</title>
</svelte:head>

<div
	class="panel-content activity-panel"
	class:scroll-locked={threadModalKind === 'comment'
		? !!threadModalRootId
		: threadModalKind === 'zap'
			? !!threadModalZapId
			: false}
>
	{#if !activityReady || (activityLoading && inboxFeedItems.length === 0)}
		<div class="loading-wrap">
			<Spinner size={24} />
			<span>Loading activity…</span>
		</div>
	{:else if activityError && inboxFeedItems.length === 0}
		<div class="empty-state-wrap">
			<EmptyState message={activityError} minHeight={280} />
		</div>
	{:else if inboxFeedItems.length === 0}
		<div class="empty-state-wrap">
			<EmptyState message="No Activity yet" minHeight={280} />
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
				{@const eRootTag = commentEv.tags?.find((t) => t[0] === 'E' && t[1])}
				{@const rootKey = eRootTag?.[1] ?? null}
				{@const rootEvent = rootKey ? activityRootEvents.get(rootKey) ?? null : null}
				{@const eParentTag = commentEv.tags?.find((t) => t[0] === 'e' && t[1])}
				{@const parentId = eParentTag?.[1] && eParentTag[1] !== rootKey ? eParentTag[1] : null}
				{@const parentComment =
					parentId
						? activityCommentMap.get(parentId) ?? activityCommentMap.get(parentId.toLowerCase()) ?? null
						: null}
				{@const parentAuthorRaw = parentComment ? activityProfiles.get(parentComment.pubkey) : null}
				{@const parentCommentAuthor = parentComment && parentAuthorRaw
					? {
							name: parentAuthorRaw.displayName ?? parentAuthorRaw.name,
							picture: parentAuthorRaw.picture,
							pubkey: parentComment.pubkey
						}
					: null}
				{@const parentZapEv =
					!parentComment && parentId
						? activityZapMap.get(parentId) ?? activityZapMap.get(parentId.toLowerCase()) ?? null
						: null}
				{@const parentZapParsed = (() => {
					if (!parentZapEv) return null;
					try {
						return parseZapReceipt(parentZapEv);
					} catch {
						return null;
					}
				})()}
				{@const parentZapperRaw =
					parentZapParsed?.senderPubkey ? activityProfiles.get(parentZapParsed.senderPubkey) : null}
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
					profileUrl={authorNpub ? `/profile/${authorNpub}` : ''}
					resolveMentionLabel={(pk) =>
						activityProfiles.get(pk)?.displayName ?? activityProfiles.get(pk)?.name ?? pk?.slice(0, 8) ?? ''}
					onRootClick={rootEvent ? () => openRootPost(rootEvent) : null}
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
					{@const postIdZ = forumPostIdForZapParsed(zParsed)}
					{@const rootEventZ = postIdZ ? activityRootEvents.get(postIdZ) ?? null : null}
					{@const zappedId = zParsed.zappedEventId}
					{@const parentCommentZ = zappedId ? activityCommentMap.get(zappedId) ?? null : null}
					{@const parentAuthorRZ = parentCommentZ ? activityProfiles.get(parentCommentZ.pubkey) : null}
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
						onclick={() => openZapThreadForum(zapEv)}
						onkeydown={(e) => e.key === 'Enter' && openZapThreadForum(zapEv)}
					>
						<ZapActivityCard
							zapEvent={zapEv}
							parsed={zParsed}
							zapperPubkey={zapperPk}
							authorProfile={zapperAuthor}
							rootEvent={rootEventZ}
							parentComment={parentCommentZ}
							parentCommentAuthor={parentCommentAuthorZ}
							appBadge={null}
							profileUrl={zapperNpub ? `/profile/${zapperNpub}` : ''}
							resolveMentionLabel={(pk) =>
								activityProfiles.get(pk)?.displayName ??
								activityProfiles.get(pk)?.name ??
								pk?.slice(0, 8) ??
								''}
							onRootClick={rootEventZ ? () => openRootPost(rootEventZ) : null}
							feedActions={{
								onReply: () => openZapThreadForum(zapEv, true),
								onZap: () => openZapThreadForum(zapEv),
								onOptions: () => openZapThreadForum(zapEv)
							}}
						/>
					</div>
				{/if}
		{/each}
		</div>
	{/if}
</div>

{#if threadModalKind === 'comment' && threadModalRootId && threadModalRootEvent}
	{@const _rootEv = threadModalRootEvent}
	{#key threadModalRootId}
		{@const _eRoot = _rootEv.tags?.find((t) => t[0] === 'E' && t[1])?.[1] ?? null}
		{@const _rootPost = _eRoot ? activityRootEvents.get(_eRoot) ?? null : null}
		{@const _authorRaw = activityProfiles.get(_rootEv.pubkey)}
		{@const _authorNpub = (() => { try { return nip19.npubEncode(_rootEv.pubkey); } catch { return ''; } })()}
		{@const _postTitle = _rootPost?.tags?.find((t) => t[0] === 'title' && t[1])?.[1] ?? 'Forum Post'}
		{@const _postNevent = (() => { try { return _rootPost ? nip19.neventEncode({ id: _rootPost.id }) : null; } catch { return null; } })()}
		{@const _evVersion = _rootEv.tags?.find((t) => t[0] === 'v' && t[1])?.[1] ?? ''}
		<RootComment
			hideRoot={true}
			openThreadOnMount={true}
			openReplyOnMount={openReplyOnMount}
			initialReplyTarget={initialReplyTargetForModal}
			id={_rootEv.id}
			content={_rootEv.content ?? ''}
			version={_evVersion}
			emojiTags={(_rootEv.tags ?? []).filter((t) => t[0] === 'emoji' && t[1] && t[2]).map((t) => ({ shortcode: t[1], url: t[2] }))}
			mediaUrls={(_rootEv.tags ?? []).filter((t) => t[0] === 'media' && t[1]).map((t) => t[1])}
			pictureUrl={_authorRaw?.picture ?? null}
			name={_authorRaw?.displayName ?? _authorRaw?.name ?? ''}
			pubkey={_rootEv.pubkey}
			timestamp={_rootEv.created_at}
			profileUrl={_authorNpub ? `/profile/${_authorNpub}` : ''}
			threadComments={selectedThreadComments}
			threadZaps={[]}
			rootContext={_postNevent
				? { label: _postTitle, iconUrl: null, href: `/community/forum/${_postNevent}` }
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
			onReplySubmit={_rootPost ? (e) => handleActivityThreadReply(_rootPost.id, _rootPost.pubkey, e) : undefined}
			onZapReceived={() => {}}
			onGetStarted={() => {}}
		/>
	{/key}
{/if}

{#if threadModalKind === 'zap' && threadModalZapId && threadModalZapEvent}
	{@const _zEv = threadModalZapEvent}
	{@const _zParsed = parseZapReceipt(_zEv)}
	{@const _postIdZ = forumPostIdForZapParsed(_zParsed)}
	{@const _rootPostZ = _postIdZ ? activityRootEvents.get(_postIdZ) ?? null : null}
	{@const _zapperRaw = _zParsed.senderPubkey ? activityProfiles.get(_zParsed.senderPubkey) : null}
	{@const _zapperNpubZ = (() => {
		try {
			return _zParsed.senderPubkey ? nip19.npubEncode(_zParsed.senderPubkey) : '';
		} catch {
			return '';
		}
	})()}
	{@const _postTitleZ = _rootPostZ?.tags?.find((t) => t[0] === 'title' && t[1])?.[1] ?? 'Forum Post'}
	{@const _postNeventZ = (() => {
		try {
			return _rootPostZ ? nip19.neventEncode({ id: _rootPostZ.id }) : null;
		} catch {
			return null;
		}
	})()}
	{#key threadModalZapId}
		<RootComment
			hideRoot={true}
			openThreadOnMount={true}
			openReplyOnMount={openReplyOnMount}
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
			authorPubkey={_rootPostZ?.pubkey ?? ''}
			threadComments={selectedThreadComments}
			threadZaps={selectedThreadZaps}
			appIconUrl={null}
			appName=""
			appIdentifier=""
			version=""
			rootContext={_postNeventZ
				? { label: _postTitleZ, iconUrl: null, href: `/community/forum/${_postNeventZ}` }
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
			onReplySubmit={_rootPostZ
				? (e) => handleActivityThreadReply(_rootPostZ.id, _rootPostZ.pubkey, e)
				: undefined}
			onZapReceived={() => {}}
			onGetStarted={() => {}}
		/>
	{/key}
{/if}

<style>
	.panel-content {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.activity-panel {
		overflow-y: auto;
	}

	.activity-panel.scroll-locked {
		overflow-y: hidden;
	}

	.loading-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 40px 24px;
		min-height: 280px;
	}

	.loading-wrap span {
		color: hsl(var(--white66));
		font-size: 0.9375rem;
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
</style>
