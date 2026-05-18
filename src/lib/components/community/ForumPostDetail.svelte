<script lang="js">
/**
 * ForumPostDetail - Chateau-style forum post detail view.
 * Simpler than chateau: enforcing relay, all comments allowed, no filtering.
 */
import { browser } from '$app/environment';
import { untrack } from 'svelte';
import { nip19 } from 'nostr-tools';
import {
	queryEvents,
	queryEvent,
	liveQuery,
	queryForumThreadCommentsByPostId,
	queryZapReceiptsByTargetEventId,
	fetchComments,
	fetchProfilesBatch,
	fetchZapsByEventIds,
	fetchZapReceiptsByPubkeys,
	fetchLabelEvents,
	parseProfile,
	parseComment,
	parseZapReceipt,
	publishComment
} from '$lib/nostr';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import {
	EVENT_KINDS,
	ZAPSTORE_COMMUNITY_NPUB,
	DEFAULT_SOCIAL_RELAYS,
	COMMENT_PUBLISH_RELAYS,
	commentZapRelayReadSince
} from '$lib/config';
import { getIsSignedIn, getCurrentPubkey, signEvent } from '$lib/stores/auth.svelte.js';
import { createSearchProfilesFunction } from '$lib/services/profile-search.js';
import { createSearchEmojisFunction } from '$lib/services/emoji-search.js';
import DetailHeader from '$lib/components/layout/DetailHeader.svelte';
import SocialTabs from '$lib/components/social/SocialTabs.svelte';
import BottomBar from '$lib/components/social/BottomBar.svelte';
import EmptyState from '$lib/components/common/EmptyState.svelte';
import ShortTextContent from '$lib/components/common/ShortTextContent.svelte';
import MediaLightboxModal from '$lib/components/modals/MediaLightboxModal.svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

let {
	post: postProp = null,
	relays = [],
	onBack = () => {},
	getStartedModalOpen = $bindable(false),
	/** When set (e.g. from Activity ?comment=id), SocialTabs opens the thread modal that contains this comment */
	openCommentId = null
} = $props();

/** Clears stale thread rows when navigating between posts (liveQuery may emit a tick later). */
let lastCommentThreadPostId = $state('');

let post = $derived.by(() => postProp ? { ...postProp } : null);
/** Stable id for thread effects — avoids re-fetch when other post fields change. */
const threadPostId = $derived(post?.id ?? '');
let authorProfile = $state(null);
let comments = $state([]);
/** False when there is no thread yet; true only until the first Dexie snapshot for the active `threadPostId`. */
let commentsLoading = $state(false);
let commentsSyncing = $state(false);
let commentsError = $state('');
let zaps = $state([]);
/**
 * NIP-22 z-tag wrappers parsed from the comment-thread query — surfaced as
 * zaps so deep zaps render without an extra kind-9735 fetch.
 * @type {Array<ReturnType<typeof parseZapFromCommentWrapper>>}
 */
let zapsLoading = $state(false);
let profiles = $state({});
let profilesLoading = $state(false);
let zapperProfiles = new SvelteMap();
const otherZaps = $derived(
	zaps.map((z) => {
		const prof = z.senderPubkey ? zapperProfiles.get(z.senderPubkey) : undefined;
		return {
			amount: z.amountSats,
			profile: z.senderPubkey
				? { pictureUrl: prof?.picture, name: prof?.displayName ?? prof?.name, pubkey: z.senderPubkey }
				: undefined,
		};
	})
);
let rawPostEvent = $derived(postProp?._raw ?? null);
/** @type {Array<{ label: string, pubkeys: string[] }>} */
let labelEntries = $state([]);
let labelsLoading = $state(false);
/** Bumped when ActionsModal publishes/removes a label so the labels effect re-fetches */
let labelFetchNonce = $state(0);
let lightboxOpen = $state(false);
let lightboxUrls = $state([]);
let lightboxIndex = $state(0);

// ── Reactive comment list ──────────────────────────────────────────────────
// Single Dexie `_tags` anyOf(e,E) + liveQuery — replaces dual queryEvents + duplicate load effect.
const commentQuery = $derived(
	browser && threadPostId
		? liveQuery(() => queryForumThreadCommentsByPostId(threadPostId))
		: null
);

$effect(() => {
	const id = threadPostId;
	if (!id) {
		commentsLoading = false;
		return;
	}
	if (lastCommentThreadPostId !== id) {
		lastCommentThreadPostId = id;
		comments = [];
		commentsLoading = true;
	}
});

$effect(() => {
	if (post?.id) commentsError = '';
});

/** Eager IndexedDB read on thread change — same query as liveQuery, fills rows before liveQuery's first async tick. */
$effect(() => {
	const id = threadPostId;
	if (!browser || !id) return;
	let cancelled = false;
	void (async () => {
		try {
			const evs = await queryForumThreadCommentsByPostId(id);
			if (cancelled || threadPostId !== id) return;
			const realIds = new Set(evs.map((e) => e.id));
			const optimistic = untrack(() =>
				comments.filter((c) => c.pending && !realIds.has(c.id))
			);
			const parsed = evs.map((e) => {
				const c = parseComment(e);
				try {
					c.npub = nip19.npubEncode(e.pubkey);
				} catch {
					c.npub = '';
				}
				return c;
			});
			comments = [...parsed, ...optimistic];
		} catch (err) {
			console.error('[ForumPostDetail] Eager thread load:', err);
			commentsLoading = false;
		} finally {
			if (!cancelled && threadPostId === id) commentsLoading = false;
		}
	})();
	return () => {
		cancelled = true;
	};
});

$effect(() => {
	if (!commentQuery) return;
	const sub = commentQuery.subscribe({
		next: (evs) => {
			const all = evs ?? [];
			const realIds = new Set(all.map((e) => e.id));
			const optimistic = comments.filter((c) => c.pending && !realIds.has(c.id));
			const parsed = all.map((e) => {
				const c = parseComment(e);
				try {
					c.npub = nip19.npubEncode(e.pubkey);
				} catch {
					c.npub = '';
				}
				return c;
			});
			comments = [...parsed, ...optimistic];
			commentsLoading = false;
		},
		error: (err) => {
			console.error('[ForumPostDetail] Comment liveQuery:', err);
			commentsError = 'Failed to load comments';
			commentsLoading = false;
		}
	});
	return () => sub.unsubscribe();
});

/** Post author from Dexie for fast header paint (parallel to thread liveQuery). */
$effect(() => {
	const pk = post?.pubkey;
	if (!pk) {
		authorProfile = null;
		return;
	}
	let cancelled = false;
	(async () => {
		const authorLocal = await queryEvent({ kinds: [0], authors: [pk], limit: 1 });
		if (cancelled) return;
		if (authorLocal?.content) {
			try {
				authorProfile = parseProfile(authorLocal);
			} catch {
				/* ignore */
			}
		} else {
			authorProfile = null;
		}
	})();
	return () => {
		cancelled = true;
	};
});

/** Relay NIP-22 thread refresh — puts events into Dexie; liveQuery picks them up. */
$effect(() => {
	const pk = post?.pubkey;
	const id = post?.id;
	if (!pk || !id) return;
	commentsSyncing = true;
	const rs = commentZapRelayReadSince();
	void fetchComments(pk, null, { eventId: id, since: rs, timeout: 6000 })
		.catch((err) => {
			console.warn('[ForumPostDetail] Relay comment fetch:', err);
		})
		.finally(() => {
			commentsSyncing = false;
		});
});

const npub = $derived(post?.pubkey ? (() => { try { return nip19.npubEncode(post.pubkey); } catch { return ''; } })() : '');
const postNevent = $derived(post?.id ? (() => { try { return nip19.neventEncode({ id: post.id }); } catch { return ''; } })() : '');
const communityPubkey = $derived((() => {
	try {
		const d = nip19.decode(ZAPSTORE_COMMUNITY_NPUB);
		return d?.type === 'npub' ? d.data : '';
	} catch { return ''; }
})());
const publisherName = $derived(
	(authorProfile?.displayName ?? authorProfile?.name ?? '').trim() || 'Author'
);
const zapTarget = $derived(
	post && communityPubkey
		? {
				name: publisherName,
				pubkey: post.pubkey,
				id: post.id,
				pictureUrl: authorProfile?.picture,
				communityPubkey
			}
		: null
);
const searchProfiles = $derived(
	createSearchProfilesFunction(
		() => getCurrentPubkey(),
		() => (post?.pubkey ? [post.pubkey] : [])
	)
);
const searchEmojis = $derived(createSearchEmojisFunction(() => getCurrentPubkey()));
const catalogs = $derived(communityPubkey ? [{ name: 'Zapstore', pictureUrl: undefined, pubkey: communityPubkey }] : []);
const postEmojiTags = $derived(
	post?.emojiTags ?? (rawPostEvent?.tags ?? [])
		.filter((t) => t[0] === 'emoji' && t[1] && t[2])
		.map((t) => ({ shortcode: t[1], url: t[2] }))
);

function parseZapRows(events, postId) {
	const pid = String(postId ?? '').toLowerCase();
	const out = [];
	for (const ev of events ?? []) {
		if (!ev?.id) continue;
		try {
			const z = parseZapReceipt(ev);
			const topETag =
				ev.tags?.find((t) => (t[0] === 'e' || t[0] === 'E') && t[1])?.[1]?.toLowerCase() ?? '';
			const parsedTarget = String(z.zappedEventId ?? '').toLowerCase();
			// Accept either explicit receipt e/E tag or parsed description e tag.
			if (parsedTarget !== pid && topETag !== pid) continue;
			out.push({ ...z, id: ev.id });
		} catch {
			/* ignore malformed zap receipt */
		}
	}
	return out;
}

function mergeParsedZapRows(existing, incoming) {
	const byId = /** @type {Record<string, (typeof existing)[number]>} */ ({});
	for (const z of existing) {
		if (z?.id) byId[z.id] = z;
	}
	for (const z of incoming) {
		if (z?.id && byId[z.id] === undefined) byId[z.id] = z;
	}
	return Object.values(byId).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/** One Dexie `_tags` read for e/E + relay by event id. Recipient fallback runs idle (see zaps effect). */
async function loadForumPostZapsPhase1(postId) {
	const pid = String(postId ?? '').toLowerCase();
	if (!pid) return [];
	const byId = /** @type {Record<string, ReturnType<typeof parseZapRows>[number]>} */ ({});
	const addEvents = (events) => {
		for (const z of parseZapRows(events, pid)) {
			if (!byId[z.id]) byId[z.id] = z;
		}
	};
	addEvents(await queryZapReceiptsByTargetEventId(pid));
	try {
		addEvents(await fetchZapsByEventIds([pid], { timeout: 5000 }));
	} catch {
		/* keep local */
	}
	return Object.values(byId).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/** Full local + relay merge — used by explicit refetch after publish/zap. */
async function loadForumPostZapsFull(postId, postPubkey) {
	const phase1 = await loadForumPostZapsPhase1(postId);
	if (!postPubkey) return phase1;
	const byId = /** @type {Record<string, (typeof phase1)[number]>} */ ({});
	for (const z of phase1) {
		if (z?.id) byId[z.id] = z;
	}
	const addEvents = (events) => {
		for (const z of parseZapRows(events, String(postId ?? '').toLowerCase())) {
			if (!byId[z.id]) byId[z.id] = z;
		}
	};
	try {
		const byRecipient = await fetchZapReceiptsByPubkeys([postPubkey], { timeout: 6000, limit: 500 });
		addEvents(byRecipient);
	} catch {
		/* keep partial */
	}
	return Object.values(byId).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/** Kind 0 from IndexedDB — only authors still missing from `profiles`. */
async function mergeProfilesFromDexie(pubkeys) {
	const uniq = [...new Set(pubkeys.filter((pk) => typeof pk === 'string' && /^[0-9a-f]{64}$/i.test(pk)))];
	const need = uniq.filter((pk) => !profiles[pk]);
	if (need.length === 0) return;
	const CHUNK = 40;
	/** @type {Record<string, { displayName?: string, name?: string, picture?: string }>} */
	const patch = {};
	for (let i = 0; i < need.length; i += CHUNK) {
		const chunk = need.slice(i, i + CHUNK);
		const evs = await queryEvents({ kinds: [0], authors: chunk, limit: chunk.length });
		for (const ev of evs) {
			if (!ev?.pubkey || !ev.content) continue;
			try {
				const j = JSON.parse(ev.content);
				patch[ev.pubkey] = {
					displayName: j.display_name ?? j.displayName ?? j.name,
					name: j.name,
					picture: j.picture
				};
			} catch {
				/* skip */
			}
		}
	}
	if (Object.keys(patch).length > 0) profiles = { ...profiles, ...patch };
}

$effect(() => {
	const pid = post?.id;
	const ppk = post?.pubkey;
	const pars = comments;
	if (!pid) return;

	const uniq = [
		...new Set([...(ppk ? [ppk] : []), ...pars.map((c) => c.pubkey).filter(Boolean)])
	];
	if (uniq.length === 0) return;

	let cancelled = false;

	(async () => {
		profilesLoading = true;
		try {
			await mergeProfilesFromDexie(uniq);
			if (cancelled) return;
			const missing = uniq.filter((pk) => !profiles[pk]);
			if (missing.length > 0) {
				const batch = await fetchProfilesBatch(missing, { timeout: 3000 });
				if (cancelled) return;
				const next = { ...profiles };
				for (const [pub, ev] of batch) {
					if (ev?.content) {
						try {
							const j = JSON.parse(ev.content);
							next[pub] = { displayName: j.display_name ?? j.name, name: j.name, picture: j.picture };
						} catch {
							/* skip */
						}
					}
				}
				profiles = next;
			}
			if (cancelled) return;
			if (ppk && !authorProfile) {
				const ev = (await fetchProfilesBatch([ppk], { timeout: 3000 })).get(ppk);
				if (ev?.content) {
					try {
						authorProfile = parseProfile(ev);
					} catch {
						/* ignore */
					}
				}
			}
		} catch (err) {
			console.error('[ForumPostDetail] Profile merge failed:', err);
		} finally {
			if (!cancelled) profilesLoading = false;
		}
	})();

	return () => {
		cancelled = true;
	};
});

$effect(() => {
	const pid = post?.id;
	const ppk = post?.pubkey;
	if (!pid) return;
	let cancelled = false;
	/** @type {ReturnType<typeof setTimeout> | number} */
	let idleHandle = 0;

	(async () => {
		zapsLoading = true;
		try {
			const phase1 = await loadForumPostZapsPhase1(pid);
			if (cancelled) return;
			zaps = phase1;
			const senders = [...new Set(zaps.map((z) => z.senderPubkey).filter(Boolean))];
			const batch = await fetchProfilesBatch(senders, { timeout: 3000 });
			if (cancelled) return;
			const next = new SvelteMap(zapperProfiles);
			for (const pk of senders) {
				const ev = batch.get(pk);
				if (ev?.content) {
					try {
						const j = JSON.parse(ev.content);
						next.set(pk, {
							displayName: j.display_name ?? j.name,
							name: j.name,
							picture: j.picture
						});
					} catch {
						/* skip */
					}
				}
			}
			zapperProfiles = next;
		} catch (err) {
			console.error('[ForumPostDetail] Zaps failed:', err);
		} finally {
			if (!cancelled) zapsLoading = false;
		}

		if (!ppk || cancelled) return;

		const runRecipientFallback = async () => {
			if (cancelled) return;
			try {
				const byRecipient = await fetchZapReceiptsByPubkeys([ppk], { timeout: 6000, limit: 500 });
				if (cancelled) return;
				const extra = parseZapRows(byRecipient, pid);
				zaps = mergeParsedZapRows(zaps, extra);
				const newSenders = [...new Set(extra.map((z) => z.senderPubkey).filter(Boolean))].filter(
					(p) => p && !zapperProfiles.has(p)
				);
				if (newSenders.length === 0) return;
				const batch = await fetchProfilesBatch(newSenders, { timeout: 3000 });
				if (cancelled) return;
				const zm = new SvelteMap(zapperProfiles);
				for (const senderPk of newSenders) {
					const ev = batch.get(senderPk);
					if (ev?.content) {
						try {
							const j = JSON.parse(ev.content);
							zm.set(senderPk, {
								displayName: j.display_name ?? j.name,
								name: j.name,
								picture: j.picture
							});
						} catch {
							/* skip */
						}
					}
				}
				zapperProfiles = zm;
			} catch {
				/* keep phase-1 zaps */
			}
		};

		if (typeof requestIdleCallback === 'function') {
			idleHandle = requestIdleCallback(runRecipientFallback, { timeout: 4000 });
		} else {
			idleHandle = setTimeout(runRecipientFallback, 0);
		}
	})();

	return () => {
		cancelled = true;
		if (idleHandle) {
			if (typeof cancelIdleCallback === 'function') {
				cancelIdleCallback(/** @type {number} */ (idleHandle));
			} else {
				clearTimeout(idleHandle);
			}
		}
	};
});

// Labels: merge self-labels (t tags) with kind 1985 events from relay
$effect(() => {
	labelFetchNonce;
	const pid = post?.id;
	const postPubkey = post?.pubkey;
	const selfLabels = post?.labels ?? [];
	const cpk = communityPubkey;
	if (!pid || !cpk) {
		labelEntries = [];
		return;
	}
	labelsLoading = true;
	(async () => {
		try {
			/** @type {SvelteMap<string, SvelteSet<string>>} */
			const labelMap = new SvelteMap();
			for (const label of selfLabels) {
				if (!labelMap.has(label)) labelMap.set(label, new SvelteSet());
				if (postPubkey) labelMap.get(label)?.add(postPubkey);
			}
			const labelRelays = [...new Set([...(relays ?? []), ...DEFAULT_SOCIAL_RELAYS])];
			const labelEvents = await fetchLabelEvents(labelRelays, pid, cpk, { enforced: true });
			for (const ev of labelEvents) {
				const lTags = ev.tags.filter((t) => t[0] === 'l' && t[1]);
				for (const lt of lTags) {
					const lv = lt[1];
					if (!labelMap.has(lv)) labelMap.set(lv, new SvelteSet());
					labelMap.get(lv)?.add(ev.pubkey);
				}
			}
			const allLabelerPubkeys = [...new Set([...labelMap.values()].flatMap((s) => [...s]))];
			if (allLabelerPubkeys.length > 0) {
				const batch = await fetchProfilesBatch(allLabelerPubkeys, { timeout: 3000 });
				const next = { ...profiles };
				for (const [pk, ev] of batch) {
					if (ev?.content) {
						try {
							const j = JSON.parse(ev.content);
							next[pk] = { displayName: j.display_name ?? j.name, name: j.name, picture: j.picture };
						} catch {
							/* ignore */
						}
					}
				}
				profiles = next;
			}
			const entries = [...labelMap.entries()].map(([label, pubkeys]) => ({
				label,
				pubkeys: [...pubkeys]
			}));
			entries.sort((a, b) => {
				const aHasSelf = postPubkey ? a.pubkeys.includes(postPubkey) : false;
				const bHasSelf = postPubkey ? b.pubkeys.includes(postPubkey) : false;
				if (aHasSelf !== bHasSelf) return aHasSelf ? -1 : 1;
				return a.label.localeCompare(b.label);
			});
			labelEntries = entries;
		} catch (err) {
			console.error('[ForumPostDetail] Labels failed:', err);
		} finally {
			labelsLoading = false;
		}
	})();
});

async function handleCommentSubmit(e) {
	if (!post || !e?.text?.trim()) return;
	const target = { contentType: 'forum', pubkey: post.pubkey, id: post.id, kind: EVENT_KINDS.FORUM_POST };
	const userPubkey = getCurrentPubkey();
	const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	let optimisticAdded = false;
	if (userPubkey) {
		let npub = '';
		try {
			npub = nip19.npubEncode(userPubkey);
		} catch {
			npub = '';
		}
		comments = [
			...comments,
			{
				id: tempId,
				pubkey: userPubkey,
				content: e.text,
				contentHtml: '',
				emojiTags: e.emojiTags ?? [],
				mediaUrls: e.mediaUrls ?? [],
				createdAt: Math.floor(Date.now() / 1000),
				parentId: e.parentId ?? null,
				isReply: e.parentId != null,
				pending: true,
				npub
			}
		];
		optimisticAdded = true;
	}
	try {
		const signed = await publishComment(
			e.text,
			target,
			signEvent,
			e.emojiTags ?? [],
			e.parentId ?? null,
			e.replyToPubkey ?? post.pubkey,
			e.parentId ? 1111 : EVENT_KINDS.FORUM_POST,
			e.mentions ?? [],
			COMMENT_PUBLISH_RELAYS,
			e.mediaUrls ?? []
		);
		const parsed = parseComment(signed);
		parsed.npub = nip19.npubEncode(signed.pubkey);
		if (e.parentId) parsed.parentId = e.parentId;
		if (optimisticAdded) {
			comments = comments.filter((c) => c.id !== tempId);
		}
		comments = [...comments, parsed];
		// Ensure current user's profile is loaded so name/pic show on the new comment
		const myPk = signed.pubkey;
		if (myPk && !profiles[myPk]) {
			try {
				const existing = await queryEvent({ kinds: [0], authors: [myPk], limit: 1 });
				if (existing?.content) {
					const j = JSON.parse(existing.content);
					profiles = { ...profiles, [myPk]: { displayName: j.display_name ?? j.name, name: j.name, picture: j.picture } };
				} else {
					const batch = await fetchProfilesBatch([myPk], { timeout: 3000 });
					const ev = batch.get(myPk);
					if (ev?.content) {
						const j = JSON.parse(ev.content);
						profiles = { ...profiles, [myPk]: { displayName: j.display_name ?? j.name, name: j.name, picture: j.picture } };
					}
				}
			} catch {
				/* ignore */
			}
		}
	} catch (err) {
		console.error('[ForumPostDetail] Comment failed:', err);
		if (optimisticAdded) {
			comments = comments.filter((c) => c.id !== tempId);
		}
		commentsError = err?.message ?? 'Failed to publish comment. Try again.';
	}
}

function refetchZaps() {
	if (!post?.id) return;
	loadForumPostZapsFull(post.id, post.pubkey).then((rows) => {
		zaps = rows;
	});
}
function handleForumZapPending(payload) {
	if (!payload?.tempId) return;
	const userPubkey = getCurrentPubkey();
	const optimistic = {
		id: payload.tempId,
		senderPubkey: userPubkey || undefined,
		amountSats: payload.amountSats,
		comment: payload.comment ?? '',
		emojiTags: payload.emojiTags ?? [],
		createdAt: Math.floor(Date.now() / 1000),
		zappedEventId: payload.zappedEventId,
		pending: true
	};
	zaps = [optimistic, ...zaps];
	if (userPubkey && profiles[userPubkey]) {
		const p = profiles[userPubkey];
		zapperProfiles.set(userPubkey, {
			displayName: p.displayName ?? p.name,
			name: p.name,
			picture: p.picture
		});
	}
}
function handleForumZapPendingClear(tempId) {
	if (!tempId) return;
	zaps = zaps.filter((z) => z.id !== tempId);
}
function handleForumBottomBarZap(event) {
	const { zapReceipt, pendingTempId } = event ?? {};
	if (pendingTempId) {
		zaps = zaps.filter((z) => z.id !== pendingTempId);
	}
	if (zapReceipt?.id) {
		const z = parseZapReceipt(zapReceipt);
		z.id = zapReceipt.id;
		const pid = String(z.id).toLowerCase();
		if (!zaps.some((x) => String(x.id).toLowerCase() === pid)) {
			zaps = [z, ...zaps];
		}
	}
	refetchZaps();
	setTimeout(refetchZaps, 2500);
}


</script>

<div class="forum-post-detail">
	{#if !post && postProp}
		<EmptyState message="Loading…" minHeight={200} />
	{:else if !post}
		<EmptyState message="Post not found" minHeight={200} />
	{:else}
		<div class="detail-header-wrap">
			<DetailHeader
				publisherPic={authorProfile?.picture}
				{publisherName}
				publisherPubkey={post.pubkey}
				publisherUrl={npub ? `/profile/${npub}` : '#'}
				timestamp={post.createdAt}
				{catalogs}
				catalogText="Zapstore"
				showPublisher={true}
				showMenu={false}
				showBackButton={true}
				{onBack}
				scrollThreshold={undefined}
				compactPadding={true}
				catalogDisplayOnly={true}
				bind:getStartedModalOpen
			/>
		</div>

		<div class="content-scroll">
			<div class="content-inner">
				<h1 class="post-title">{post.title}</h1>
			<div class="description-container">
				<ShortTextContent
					content={post.content ?? ''}
					emojiTags={postEmojiTags}
					mediaUrls={post.mediaUrls ?? []}
					onMediaClick={({ url: u, urls: list }) => {
						const urls = list?.length ? list : (post.mediaUrls ?? []);
						lightboxUrls = urls;
						lightboxIndex = Math.max(0, urls.indexOf(u));
						lightboxOpen = true;
					}}
					class="post-detail-body"
				/>
			</div>

				<div class="social-tabs-wrap">
					<SocialTabs
						app={{}}
						includeReceiptZapsInCommentsFeed={false}
						mainEventIds={[post.id]}
						openCommentId={openCommentId}
						signEvent={signEvent}
						showDetailsTab={true}
						detailsShareableId={postNevent}
						detailsPublicationLabel="Post"
						detailsNpub={npub}
						detailsPubkey={post.pubkey ?? ''}
						detailsRawData={rawPostEvent ? (() => { const c = { ...rawPostEvent }; delete c._tags; return c; })() : null}
						wrapperRoot={post?.id && post?.pubkey
							? { kind: post?.kind ?? EVENT_KINDS.FORUM_POST, pubkey: post.pubkey, eventId: post.id }
							: null}
						{comments}
						{commentsLoading}
						{commentsSyncing}
						{commentsError}
					{zaps}
						{zapsLoading}
						{zapperProfiles}
						{profiles}
						{profilesLoading}
						pubkeyToNpub={(pk) => (pk ? nip19.npubEncode(pk) : '')}
						{searchProfiles}
						{searchEmojis}
						onCommentSubmit={handleCommentSubmit}
						onZapPending={handleForumZapPending}
						onZapPendingClear={handleForumZapPendingClear}
						onZapReceived={handleForumBottomBarZap}
						onGetStarted={() => (getStartedModalOpen = true)}
						{labelEntries}
						{labelsLoading}
					/>
				</div>
			</div>
		</div>

	{#if post && zapTarget}
		<BottomBar
			publisherName={publisherName}
			contentType="forum"
			{zapTarget}
			{otherZaps}
			isSignedIn={getIsSignedIn()}
			isMember={true}
			onJoinRequired={() => {}}
			onGetStarted={() => { getStartedModalOpen = true; }}
			getCurrentPubkey={getCurrentPubkey}
			signEvent={signEvent}
			{searchProfiles}
			{searchEmojis}
			oncommentSubmit={handleCommentSubmit}
			onzapReceived={handleForumBottomBarZap}
			onZapPending={handleForumZapPending}
			onZapPendingClear={handleForumZapPendingClear}
			onoptions={() => {}}
			onLabelPublished={() => {
				labelFetchNonce += 1;
			}}
			onOwnContentDeleted={() => {
				goto(resolve('/community/forum'));
			}}
		/>
	{/if}
	{/if}
</div>

<MediaLightboxModal bind:isOpen={lightboxOpen} urls={lightboxUrls} initialIndex={lightboxIndex} />

<style>
	.forum-post-detail {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		overflow: hidden;
	}
	.detail-header-wrap {
		flex-shrink: 0;
	}
	.content-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding-top: 16px;
		padding-bottom: 120px;
	}
	.content-inner {
		padding: 0 16px 16px;
		max-width: 100%;
	}
	.post-title {
		font-size: 1.5rem;
		font-weight: 700;
		padding-top: 0;
		margin: 0 0 6px;
		line-height: 1.3;
		color: var(--white);
	}
	.description-container {
		margin-bottom: 0.5rem;
		font-size: 0.9375rem;
		line-height: 1.6;
		color: var(--white);
	}

	.description-container :global(a) {
		color: var(--blurpleColor);
		text-decoration: underline;
	}

	.description-container :global(a:hover) {
		text-decoration-thickness: 2px;
	}
	.social-tabs-wrap {
		margin-top: 16px;
	}
</style>
