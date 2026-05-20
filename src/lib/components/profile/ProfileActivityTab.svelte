<script lang="js">
/**
 * ProfileActivityTab — kind:1111 comments authored by a profile.
 * Data: createProfileActivityQuery (Dexie liveQuery + batched root hydration).
 */
import { SvelteMap } from 'svelte/reactivity';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { nip19 } from 'nostr-tools';
import {
	createProfileActivityQuery,
	fetchFromRelays,
	queryEvents,
	queryEvent,
	putEvents,
	parseComment,
	publishComment
} from '$lib/purpleweb';
import { getEventOneliner } from '$lib/nostr';
import { resolveAppDiscussionRootCommentId, collectCommentSubtree } from '$lib/nostr/thread-discussion.js';
import { EVENT_KINDS, ZAPSTORE_RELAY, COMMENT_PUBLISH_RELAYS } from '$lib/config';
import { signEvent, getCurrentPubkey } from '$lib/stores/auth.svelte.js';
import { createSearchProfilesFunction } from '$lib/services/profile-search.js';
import { createSearchEmojisFunction } from '$lib/services/emoji-search.js';
import CommentCard from '$lib/components/community/CommentCard.svelte';
import RootComment from '$lib/components/social/RootComment.svelte';
import EmptyState from '$lib/components/common/EmptyState.svelte';
import ActivityFeedSkeleton from '$lib/components/community/ActivityFeedSkeleton.svelte';

let { pubkey = '', profileName = '', profilePicture = '' } = $props();

const activity = createProfileActivityQuery(() => pubkey);

let loadSentinel = $state(/** @type {HTMLElement | null} */ (null));

const searchProfilesFn = $derived(createSearchProfilesFunction(() => getCurrentPubkey()));
const searchEmojisFn = $derived(createSearchEmojisFunction(() => getCurrentPubkey()));

// ── Thread modal state ────────────────────────────────────────────────────────
let threadRootId = $state(/** @type {string | null} */ (null));
let threadRootCommentEv = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
let threadContextEv = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
let threadAddrATag = $state(/** @type {string | null} */ (null));
let threadExpandId = $state(/** @type {string | null} */ (null));
let threadComments = $state(/** @type {any[]} */ ([]));
let openReplyOnMount = $state(false);
let threadOpenActionsOnMount = $state(false);
let threadOpenFeedActionsOnly = $state(false);
let threadOpenFeedZapOnly = $state(false);
let standaloneActionsOpenKey = $state(0);
let standaloneZapOpenKey = $state(0);
let threadInitialActionsTarget = $state(/** @type {'root' | Record<string, unknown> | null} */ (null));
let pendingActionsCommentEv = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
let pendingZapCommentEv = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
let initialReplyTargetForModal = $state(/** @type {Record<string, unknown> | null} */ (null));

function getRootRef(event) {
	const aTag =
		event.tags?.find((t) => t[0] === 'A' && t[1])?.[1] ??
		event.tags?.find((t) => t[0] === 'a' && t[1])?.[1] ??
		null;
	if (aTag) return { type: 'addr', value: aTag };
	const eTag = event.tags?.find((t) => t[0] === 'E' && t[1])?.[1] ?? null;
	if (eTag) return { type: 'id', value: eTag };
	return null;
}

/** Link for thread modal root banner (forum / app / stack). */
function hrefForThreadRootContext(ev) {
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

/** Precompute per-row props once per displayed slice — avoids N× lookups on every map touch. */
const feedRows = $derived.by(() => {
	const rows = [];
	for (const event of activity.displayedComments) {
		const rootRef = getRootRef(event);
		const rootMeta = activity.activityRootKeyMetaFromComment(event);
		const rootEvent = rootRef ? activity.lookupRootEvent(rootRef) : null;
		const rootInfo = rootRef?.type === 'addr' ? activity.lookupRootInfo(rootRef.value) : null;
		const deletedRootKind = rootMeta ? (activity.rootDeletedByKey.get(rootMeta.key) ?? null) : null;
		const expectsRoot = !!rootMeta;
		rows.push({
			event,
			rootRef,
			rootEvent,
			rootInfo,
			deletedRootKind,
			rootBadgeSkeleton: expectsRoot && !rootEvent && !deletedRootKind,
			parentComment: activity.parentCommentMap.get(event.id) ?? null
		});
	}
	return rows;
});

function toThreadComment(e) {
	const c = parseComment(e);
	const p = activity.mentionProfiles.get(e.pubkey);
	let npub = '';
	try {
		npub = nip19.npubEncode(e.pubkey);
	} catch {
		/* ignore */
	}
	return {
		...c,
		id: e.id,
		pubkey: e.pubkey,
		createdAt: e.created_at,
		displayName:
			p?.displayName ??
			p?.name ??
			(npub ? `npub1${npub.slice(5, 8)}…${npub.slice(-6)}` : e.pubkey.slice(0, 8)),
		avatarUrl: p?.picture ?? null,
		profileUrl: npub ? `/profile/${npub}` : '',
		profileLoading: false
	};
}

function enrichReplyTargetForModal(commentEv) {
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

$effect(() => {
	if (!browser || activity.loading || !activity.likelyHasMore) return;
	const el = loadSentinel;
	if (!el) return;
	const obs = new IntersectionObserver(
		(entries) => {
			for (const ent of entries) {
				if (!ent.isIntersecting) continue;
				activity.loadMoreVisible();
				break;
			}
		},
		{ rootMargin: '120px', threshold: 0 }
	);
	obs.observe(el);
	return () => obs.disconnect();
});

async function fetchEvent(id) {
	const local = await queryEvent({ ids: [id] });
	if (local) return local;
	const fetched = await fetchFromRelays(
		[ZAPSTORE_RELAY],
		{ ids: [id], limit: 1 },
		{ timeout: 4000, feature: 'profile-thread-parent' }
	);
	return fetched[0] ?? null;
}

async function openThread(commentEv, withReply = false, opts = {}) {
	const ref = getRootRef(commentEv);
	if (!ref) return;

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
	openReplyOnMount = withReply;
	initialReplyTargetForModal = null;

	const commentMap = new SvelteMap(activity.comments.map((c) => [c.id.toLowerCase(), c]));
	const rootId = await resolveAppDiscussionRootCommentId(commentEv, commentMap, fetchEvent);
	const contextEv = activity.lookupRootEvent(ref);
	const addrATag = ref.type === 'addr' ? ref.value : null;
	let rootCommentEv = commentMap.get(rootId.toLowerCase()) ?? (await fetchEvent(rootId));

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

	threadRootId = rootId;
	threadRootCommentEv = rootCommentEv;
	threadContextEv = contextEv;
	threadAddrATag = addrATag;
	threadExpandId =
		!openActionsSheet && !openZapOnly && commentEv.id !== rootId ? commentEv.id : null;
	threadComments = [];
	loadThreadComments(rootId, addrATag);
}

async function loadThreadComments(rootId, addrATag) {
	let pool = [];
	if (addrATag) {
		pool = await queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#A': [addrATag], limit: 300 });
		if (pool.length === 0)
			pool = await queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#a': [addrATag], limit: 300 });
	} else {
		pool = await queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#E': [rootId], limit: 300 });
		if (pool.length === 0)
			pool = await queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#e': [rootId], limit: 300 });
	}

	const subtree = collectCommentSubtree(rootId, pool);
	const filtered = subtree.filter((e) => e.id !== rootId);

	if (threadRootId === rootId) {
		threadComments = filtered.map(toThreadComment);
	}

	const relayFilter = addrATag
		? { kinds: [EVENT_KINDS.COMMENT], '#A': [addrATag], limit: 300 }
		: { kinds: [EVENT_KINDS.COMMENT], '#E': [rootId], limit: 300 };

	fetchFromRelays([ZAPSTORE_RELAY], relayFilter, {
		timeout: 6000,
		feature: 'profile-thread-comments'
	})
		.then(async (more) => {
			if (!more.length || threadRootId !== rootId) return;
			await putEvents(more);
			const combined = new SvelteMap();
			for (const e of [...pool, ...more]) combined.set(e.id, e);
			const subtree2 = collectCommentSubtree(rootId, Array.from(combined.values()));
			const all = subtree2.filter((e) => e.id !== rootId);
			if (threadRootId === rootId) threadComments = all.map(toThreadComment);
		})
		.catch(() => {});
}

function closeThread() {
	threadRootId = null;
	threadRootCommentEv = null;
	threadContextEv = null;
	threadAddrATag = null;
	threadExpandId = null;
	threadComments = [];
	openReplyOnMount = false;
	threadOpenActionsOnMount = false;
	threadOpenFeedActionsOnly = false;
	threadOpenFeedZapOnly = false;
	threadInitialActionsTarget = null;
	pendingActionsCommentEv = null;
	pendingZapCommentEv = null;
	initialReplyTargetForModal = null;
}

async function handleThreadReply(e) {
	if (!e?.text?.trim() || !threadRootId) return;

	/** @type {any} */
	let contentTarget = null;
	if (threadAddrATag) {
		const parts = threadAddrATag.split(':');
		const kindNum = Number(parts[0]);
		const pk = parts[1];
		const identifier = parts.slice(2).join(':');
		if (kindNum === EVENT_KINDS.APP) contentTarget = { contentType: 'app', pubkey: pk, identifier };
		else if (kindNum === EVENT_KINDS.APP_STACK)
			contentTarget = { contentType: 'stack', pubkey: pk, identifier };
	} else if (threadContextEv) {
		contentTarget = { contentType: 'forum', eventId: threadContextEv.id, pubkey: threadContextEv.pubkey };
	}

	if (!contentTarget) return;

	const signed = await publishComment(
		e.text,
		contentTarget,
		signEvent,
		e.emojiTags ?? [],
		e.parentId ?? null,
		e.replyToPubkey ?? null,
		e.parentKind ?? EVENT_KINDS.COMMENT,
		e.mentions ?? [],
		COMMENT_PUBLISH_RELAYS,
		e.mediaUrls ?? []
	);

	if (signed) threadComments = [...threadComments, toThreadComment(signed)];
}
</script>

<div class="profile-activity">
	{#if activity.loading && activity.comments.length === 0}
		<ActivityFeedSkeleton />
	{:else if activity.error}
		<EmptyState message={activity.error} minHeight={200} topAlign={true} />
	{:else if activity.comments.length === 0}
		<EmptyState message="No activity yet" minHeight={200} topAlign={true} />
	{:else}
		<div class="activity-feed">
			{#each feedRows as row (row.event.id)}
				<div
					class="activity-item"
					role="button"
					tabindex="0"
					onclick={() => openThread(row.event)}
					onkeydown={(e) => {
						if (e.key === 'Enter') openThread(row.event);
					}}
				>
					<CommentCard
						event={row.event}
						rootEvent={row.rootEvent}
						rootBadgeSkeleton={row.rootBadgeSkeleton}
						deletedRootKind={row.deletedRootKind}
						authorProfile={{ name: profileName, picture: profilePicture || undefined, pubkey }}
						parentComment={row.parentComment}
						appBadge={row.rootInfo && !row.rootInfo.isStack
							? {
									iconUrl: row.rootInfo.icon,
									name: row.rootInfo.name,
									identifier: row.rootInfo.identifier
								}
							: null}
						onRootClick={row.rootInfo?.href
							? () => goto(row.rootInfo.href)
							: row.rootEvent?.kind === EVENT_KINDS.FORUM_POST
								? () => {
										try {
											const nevent = nip19.neventEncode({ id: row.rootEvent.id });
											goto(`/community/forum/${nevent}`);
										} catch {
											/* ignore */
										}
									}
								: null}
						resolveMentionLabel={(pk) =>
							activity.mentionProfiles.get(pk)?.displayName ??
							activity.mentionProfiles.get(pk)?.name ??
							null}
						feedActions={{
							onReply: () => openThread(row.event, true),
							onZap: () => openThread(row.event, false, { openZapOnly: true }),
							onOptions: () => openThread(row.event, false, { openActionsSheet: true })
						}}
					/>
				</div>
			{/each}
			{#if activity.likelyHasMore}
				<div bind:this={loadSentinel} class="profile-activity-load-sentinel" aria-hidden="true"></div>
			{/if}
			{#if activity.showLoadMoreSkeleton}
				<div class="profile-activity-loading-more" aria-busy="true">
					<ActivityFeedSkeleton rows={2} />
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if threadRootId}
	{@const rootInfo = threadAddrATag ? activity.lookupRootInfo(threadAddrATag) : null}
	{@const contextOneliner = getEventOneliner(threadContextEv)}
	{@const threadBannerHref = threadContextEv ? hrefForThreadRootContext(threadContextEv) : null}
	{@const forumPostTitle =
		threadContextEv?.kind === EVENT_KINDS.FORUM_POST
			? (threadContextEv.tags?.find((t) => t[0] === 'title' && t[1])?.[1] ?? contextOneliner.label)
			: contextOneliner.label}
	{@const rootContext = rootInfo
		? {
				label: rootInfo.name,
				iconUrl: rootInfo.icon ?? null,
				href: rootInfo.href ?? null,
				isStack: rootInfo.isStack
			}
		: threadBannerHref && threadContextEv
			? {
					label: forumPostTitle,
					iconUrl:
						threadContextEv.kind === EVENT_KINDS.APP_STACK ? null : (contextOneliner.emoji ?? null),
					href: threadBannerHref,
					isStack: threadContextEv.kind === EVENT_KINDS.APP_STACK
				}
			: null}
	{@const wrapperRoot = threadAddrATag
		? (() => {
				const p = threadAddrATag.split(':');
				return { kind: Number(p[0]), pubkey: p[1], identifier: p.slice(2).join(':') };
			})()
		: threadContextEv
			? { kind: threadContextEv.kind, pubkey: threadContextEv.pubkey, eventId: threadContextEv.id }
			: null}
	{@const rootNpub = (() => {
		try {
			return threadRootCommentEv ? nip19.npubEncode(threadRootCommentEv.pubkey) : '';
		} catch {
			return '';
		}
	})()}
	{@const rootEmojiTags = (threadRootCommentEv?.tags ?? [])
		.filter((t) => t[0] === 'emoji' && t[1] && t[2])
		.map((t) => ({ shortcode: t[1], url: t[2] }))}
	{@const rootMediaUrls = (threadRootCommentEv?.tags ?? [])
		.filter((t) => t[0] === 'media' && t[1])
		.map((t) => t[1])}
	{#key threadRootId}
		<RootComment
			hideRoot={true}
			openThreadOnMount={!threadOpenFeedActionsOnly && !threadOpenFeedZapOnly}
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
			id={threadRootId}
			pubkey={threadRootCommentEv?.pubkey ?? null}
			content={threadRootCommentEv?.content ?? ''}
			emojiTags={rootEmojiTags}
			mediaUrls={rootMediaUrls}
			timestamp={threadRootCommentEv?.created_at ?? null}
			name={rootNpub ? `npub1${rootNpub.slice(5, 8)}…${rootNpub.slice(-6)}` : ''}
			pictureUrl={null}
			{threadComments}
			expandCommentId={threadExpandId}
			appIconUrl={rootInfo?.icon ?? null}
			appName={rootInfo?.name ?? ''}
			appIdentifier={rootInfo?.identifier ?? null}
			{rootContext}
			{wrapperRoot}
			onModalClose={closeThread}
			{signEvent}
			searchProfiles={searchProfilesFn}
			searchEmojis={searchEmojisFn}
			onReplySubmit={handleThreadReply}
			resolveMentionLabel={(pk) =>
				activity.mentionProfiles.get(pk)?.displayName ?? activity.mentionProfiles.get(pk)?.name ?? null}
		/>
	{/key}
{/if}

<style>
	.profile-activity {
		display: flex;
		flex-direction: column;
	}

	.activity-feed {
		display: flex;
		flex-direction: column;
	}

	.activity-item {
		padding: 12px 16px;
		border-bottom: 1px solid var(--shell-border);
		cursor: pointer;
	}

	.activity-item:last-child {
		border-bottom: none;
	}

	.profile-activity-load-sentinel {
		height: 1px;
		width: 100%;
		pointer-events: none;
	}

	.profile-activity-loading-more :global(.activity-feed-skeleton) {
		padding-top: 0;
	}
</style>
