<script lang="js">
/**
 * ProfileActivityTab — kind:1111 comments authored by a profile.
 * Data: createProfileActivityQuery (Dexie liveQuery + batched root hydration).
 */
import { browser } from '$app/environment';
import { tick } from 'svelte';
import { goto } from '$app/navigation';
import { nip19 } from 'nostr-tools';
import {
	createProfileActivityQuery,
	parseComment,
	parseZapReceipt,
	addrTagFromComment
} from '$lib/purpleweb';
import { getEventOneliner } from '$lib/nostr';
import { EVENT_KINDS, ZAPSTORE_COMMUNITY_PUBKEY } from '$lib/config';
import { signEvent, getCurrentPubkey } from '$lib/stores/auth.svelte.js';
import { createSearchProfilesFunction } from '$lib/services/profile-search.js';
import { createSearchEmojisFunction } from '$lib/services/emoji-search.js';
import CommentCard from '$lib/components/community/CommentCard.svelte';
import ZapActivityCard from '$lib/components/community/ZapActivityCard.svelte';
import RootComment from '$lib/components/social/RootComment.svelte';
import ActivityFeedSkeleton from '$lib/components/community/ActivityFeedSkeleton.svelte';
import RelayLoadingBar from '$lib/components/common/RelayLoadingBar.svelte';
import {
	createProfileActivityThreadModal,
	parseZapWrapper,
	addrATagForAppStackZap,
	forumPostIdForZapParsed,
	appBadgeFromAddrRoot,
	activityDeletedRootLabel,
	hrefForActivityRootEvent
} from '$lib/components/profile/profile-activity-thread.svelte.js';
import '$lib/styles/profile-section-empty.css';

let { pubkey = '', profileName = '', profilePicture = '' } = $props();

const activity = createProfileActivityQuery(() => pubkey);
const thread = createProfileActivityThreadModal(() => activity, () => signEvent);

let loadSentinel = $state(/** @type {HTMLElement | null} */ (null));

/** Distance from scroll bottom (px) that triggers the next batch. */
const LOAD_MARGIN_PX = 240;
const PUMP_MAX = 12;

/** @param {Element | null | undefined} scrollRoot */
function getScrollRoot(scrollRoot) {
	if (scrollRoot instanceof HTMLElement) return scrollRoot;
	if (typeof document === 'undefined') return null;
	const el = document.querySelector('.profile-detail-scroll[data-main-scroll]');
	return el instanceof HTMLElement ? el : null;
}

/** @param {HTMLElement} scrollRoot */
function isNearScrollEnd(scrollRoot) {
	return (
		scrollRoot.scrollTop + scrollRoot.clientHeight >= scrollRoot.scrollHeight - LOAD_MARGIN_PX
	);
}

/** True when the sentinel sits inside the scrollport. */
function isSentinelInScrollView(el, scrollRoot, marginPx = LOAD_MARGIN_PX) {
	if (!el || !(scrollRoot instanceof HTMLElement)) return false;
	const rootRect = scrollRoot.getBoundingClientRect();
	const elRect = el.getBoundingClientRect();
	return elRect.top <= rootRect.bottom + marginPx && elRect.bottom >= rootRect.top - marginPx;
}

/** @param {HTMLElement} scrollRoot */
function shouldLoadMore(scrollRoot) {
	if (isNearScrollEnd(scrollRoot)) return true;
	const el = loadSentinel;
	return el ? isSentinelInScrollView(el, scrollRoot, LOAD_MARGIN_PX) : false;
}

/** @param {HTMLElement} scrollRoot */
async function pumpLoadMore(scrollRoot) {
	for (let i = 0; i < PUMP_MAX; i++) {
		if (!activity.likelyHasMore || activity.loading) return;
		await tick();
		if (!shouldLoadMore(scrollRoot)) return;
		const prevShown = activity.displayedComments.length;
		activity.loadMoreVisible();
		await tick();
		if (!activity.likelyHasMore) return;
		if (activity.displayedComments.length === prevShown && !activity.loadingMore) return;
	}
}

/** @param {HTMLElement} scrollRoot */
function onScrollNearEnd(scrollRoot) {
	if (!activity.likelyHasMore || activity.loading) return;
	if (!shouldLoadMore(scrollRoot)) return;
	void pumpLoadMore(scrollRoot);
}

const searchProfilesFn = $derived(createSearchProfilesFunction(() => getCurrentPubkey()));
const searchEmojisFn = $derived(createSearchEmojisFunction(() => getCurrentPubkey()));

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

/** Precompute per-row props once per displayed slice — avoids N× lookups on every map touch. */
const feedRows = $derived.by(() => {
	const commentMap = thread.buildCommentMap();
	const rows = [];
	for (const event of activity.displayedComments) {
		const rootRef = getRootRef(event);
		const rootMeta = activity.activityRootKeyMetaFromComment(event);
		const rootEvent = rootRef ? activity.lookupRootEvent(rootRef) : null;
		const rootInfo = rootRef?.type === 'addr' ? activity.lookupRootInfo(rootRef.value) : null;
		const deletedRootKind = rootMeta ? (activity.rootDeletedByKey.get(rootMeta.key) ?? null) : null;
		const expectsRoot = !!rootMeta;
		const parsedComment = parseComment(event);
		const eParentTag = event.tags?.find((t) => t[0] === 'e' && t[1]);
		const rootKey = event.tags?.find((t) => t[0] === 'E' && t[1])?.[1] ?? null;
		const parentId =
			eParentTag?.[1] && eParentTag[1] !== rootKey ? eParentTag[1] : null;
		const parentComment = parentId
			? (activity.parentCommentMap.get(event.id) ??
				commentMap.get(parentId.toLowerCase()) ??
				null)
			: (activity.parentCommentMap.get(event.id) ?? null);
		rows.push({
			event,
			parsedComment,
			isZWrapper: parsedComment.isWrapper,
			rootRef,
			rootEvent,
			rootInfo,
			deletedRootKind,
			rootBadgeSkeleton: expectsRoot && !rootEvent && !deletedRootKind,
			parentComment,
			feedAddrBadge: appBadgeFromAddrRoot(rootEvent)
		});
	}
	return rows;
});

$effect(() => {
	if (!browser || activity.loading || !activity.likelyHasMore) return;
	void loadSentinel;
	void activity.displayedComments.length;

	const scrollRoot = getScrollRoot(loadSentinel?.closest('[data-main-scroll]'));
	if (!scrollRoot) return;

	let scrollRaf = 0;
	const onScroll = () => {
		if (scrollRaf) return;
		scrollRaf = requestAnimationFrame(() => {
			scrollRaf = 0;
			onScrollNearEnd(scrollRoot);
		});
	};

	scrollRoot.addEventListener('scroll', onScroll, { passive: true });
	queueMicrotask(() => onScrollNearEnd(scrollRoot));

	return () => {
		scrollRoot.removeEventListener('scroll', onScroll);
		if (scrollRaf) cancelAnimationFrame(scrollRaf);
	};
});

function resolveMentionLabel(pk) {
	return activity.mentionProfiles.get(pk)?.displayName ?? activity.mentionProfiles.get(pk)?.name ?? null;
}
</script>

<div class="profile-activity">
	<RelayLoadingBar loading={activity.syncing} />
	{#if activity.loading && activity.comments.length === 0}
		<ActivityFeedSkeleton />
	{:else if activity.error}
		<p class="profile-section-empty profile-section-empty--no-top-border" role="status">{activity.error}</p>
	{:else if activity.comments.length === 0}
		<p class="profile-section-empty profile-section-empty--no-top-border">No activity yet</p>
	{:else}
		<div class="activity-feed">
			{#each feedRows as row (row.event.id)}
				{@const authorNpub = (() => {
					try {
						return nip19.npubEncode(row.event.pubkey);
					} catch {
						return '';
					}
				})()}
				{@const parentAuthorRaw = row.parentComment
					? activity.mentionProfiles.get(row.parentComment.pubkey)
					: null}
				{@const parentCommentAuthor =
					row.parentComment && parentAuthorRaw
						? {
								name: parentAuthorRaw.displayName ?? parentAuthorRaw.name,
								picture: parentAuthorRaw.picture,
								pubkey: row.parentComment.pubkey
							}
						: null}
				<div
					class="activity-item"
					role="button"
					tabindex="0"
					onclick={() => thread.openThread(row.event)}
					onkeydown={(e) => {
						if (e.key === 'Enter') thread.openThread(row.event);
					}}
				>
					{#if row.isZWrapper}
						<ZapActivityCard
							zapEvent={row.event}
							parsed={{
								amountSats: row.parsedComment.zapAmountSats,
								senderPubkey: row.event.pubkey,
								comment: row.event.content ?? '',
								zappedEventId: row.parsedComment.parentId,
								emojiTags: row.parsedComment.emojiTags ?? []
							}}
							zapperPubkey={row.event.pubkey}
							authorProfile={{ name: profileName, picture: profilePicture || undefined, pubkey }}
							rootEvent={row.rootEvent}
							appBadge={row.feedAddrBadge}
							rootBadgeSkeleton={row.rootBadgeSkeleton}
							deletedRootKind={row.deletedRootKind}
							parentComment={row.parentComment}
							{parentCommentAuthor}
							profileUrl={authorNpub ? `/profile/${authorNpub}` : ''}
							{resolveMentionLabel}
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
							feedActions={{
								onReply: () => thread.openThread(row.event, true),
								onZap: () => thread.openThread(row.event, false, { openZapOnly: true }),
								onOptions: () => thread.openThread(row.event, false, { openActionsSheet: true })
							}}
						/>
					{:else}
						<CommentCard
							event={row.event}
							rootEvent={row.rootEvent}
							rootBadgeSkeleton={row.rootBadgeSkeleton}
							deletedRootKind={row.deletedRootKind}
							authorProfile={{ name: profileName, picture: profilePicture || undefined, pubkey }}
							parentComment={row.parentComment}
							{parentCommentAuthor}
							appBadge={row.rootInfo && !row.rootInfo.isStack
								? {
										iconUrl: row.rootInfo.icon,
										name: row.rootInfo.name,
										identifier: row.rootInfo.identifier
									}
								: row.feedAddrBadge}
							profileUrl={authorNpub ? `/profile/${authorNpub}` : ''}
							{resolveMentionLabel}
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
							feedActions={{
								onReply: () => thread.openThread(row.event, true),
								onZap: () => thread.openThread(row.event, false, { openZapOnly: true }),
								onOptions: () => thread.openThread(row.event, false, { openActionsSheet: true })
							}}
						/>
					{/if}
				</div>
			{/each}
			{#if activity.showLoadMoreSkeleton}
				<div class="profile-activity-loading-more" aria-busy="true">
					<ActivityFeedSkeleton rows={3} />
				</div>
			{/if}
			{#if activity.likelyHasMore}
				<div bind:this={loadSentinel} class="profile-activity-load-sentinel" aria-hidden="true"></div>
			{/if}
		</div>
	{/if}
</div>

{#if thread.threadModalKind === 'comment' && thread.threadModalRootId && thread.threadModalRootEvent}
	{@const _rootEv = thread.threadModalRootEvent}
	{#key thread.threadModalRootId}
		{@const _eRoot = _rootEv.tags?.find((t) => t[0] === 'E' && t[1])?.[1] ?? null}
		{@const _aRoot = addrTagFromComment(_rootEv)}
		{@const _forumDelKey = _eRoot ? `e:${_eRoot.toLowerCase()}` : null}
		{@const _addrDelKey = _aRoot ? `a:${_aRoot}` : null}
		{@const _rootPost = _eRoot ? activity.lookupRootEvent({ type: 'id', value: _eRoot }) : null}
		{@const _addrBannerEv =
			_aRoot ? activity.lookupRootEvent({ type: 'addr', value: _aRoot }) : null}
		{@const _bannerEv = _rootPost ?? _addrBannerEv}
		{@const _bannerOneliner = getEventOneliner(_bannerEv)}
		{@const _bannerHref = hrefForActivityRootEvent(_bannerEv)}
		{@const _bannerBadge = appBadgeFromAddrRoot(_addrBannerEv)}
		{@const _bannerIsStack = _bannerEv?.kind === EVENT_KINDS.APP_STACK}
		{@const _bannerDeletedKind =
			!_bannerEv &&
			((_forumDelKey && activity.rootDeletedByKey.get(_forumDelKey)) ||
				(_addrDelKey && activity.rootDeletedByKey.get(_addrDelKey)) ||
				null)}
		{@const _authorRaw = activity.mentionProfiles.get(_rootEv.pubkey)}
		{@const _authorNpub = (() => {
			try {
				return nip19.npubEncode(_rootEv.pubkey);
			} catch {
				return '';
			}
		})()}
		{@const _postTitle =
			_rootPost?.kind === EVENT_KINDS.FORUM_POST
				? (_rootPost.tags?.find((t) => t[0] === 'title' && t[1])?.[1] ?? _bannerOneliner.label)
				: _bannerOneliner.label}
		{@const _evVersion = _rootEv.tags?.find((t) => t[0] === 'v' && t[1])?.[1] ?? ''}
		{@const _labelCommunityPk =
			_rootPost?.kind === EVENT_KINDS.FORUM_POST ? ZAPSTORE_COMMUNITY_PUBKEY : null}
		<RootComment
			hideRoot={true}
			openThreadOnMount={!thread.threadOpenFeedActionsOnly && !thread.threadOpenFeedZapOnly}
			expandCommentId={thread.threadModalExpandCommentId}
			openActionsOnMount={thread.threadOpenActionsOnMount}
			initialActionsTarget={thread.threadInitialActionsTarget}
			standaloneActionsOpenKey={thread.standaloneActionsOpenKey}
			openZapOnMount={thread.threadOpenFeedZapOnly}
			standaloneZapOpenKey={thread.standaloneZapOpenKey}
			feedInitialZapTarget={thread.pendingZapCommentEv
				? thread.enrichReplyTargetForModal(thread.pendingZapCommentEv)
				: null}
			openReplyOnMount={thread.openReplyOnMount}
			initialReplyTarget={thread.initialReplyTargetForModal}
			modalZIndex={110}
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
			threadComments={thread.selectedThreadComments}
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
			appIconUrl={_bannerBadge?.iconUrl ?? null}
			appName={_bannerBadge?.name ?? ''}
			appIdentifier={_bannerBadge?.identifier ?? null}
			onModalClose={thread.closeThread}
			signEvent={signEvent}
			searchProfiles={searchProfilesFn}
			searchEmojis={searchEmojisFn}
			onReplySubmit={thread.threadModalAddrATag
				? (e) => thread.handleActivityThreadReply(null, null, e)
				: _rootPost
					? (e) => thread.handleActivityThreadReply(_rootPost.id, _rootPost.pubkey, e)
					: undefined}
			onZapReceived={() => {}}
			onGetStarted={() => {}}
			{resolveMentionLabel}
		/>
	{/key}
{/if}

{#if thread.threadModalKind === 'zap' && thread.threadModalZapId && thread.threadModalZapEvent}
	{@const _zEv = thread.threadModalZapEvent}
	{@const _zParsed = parseZapWrapper(_zEv) ?? parseZapReceipt(_zEv)}
	{@const commentMap = thread.buildCommentMap()}
	{@const forumRoots = thread.buildForumRootsMap()}
	{@const _aZap = addrATagForAppStackZap(_zEv, _zParsed, commentMap)}
	{@const _postIdZ = forumPostIdForZapParsed(_zParsed, forumRoots, commentMap)}
	{@const _rootPostZ = _aZap
		? activity.lookupRootEvent({ type: 'addr', value: _aZap })
		: _postIdZ
			? activity.lookupRootEvent({ type: 'id', value: _postIdZ })
			: null}
	{@const _zapperRaw = _zParsed.senderPubkey ? activity.mentionProfiles.get(_zParsed.senderPubkey) : null}
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
		((_postIdZ && activity.rootDeletedByKey.get(`e:${_postIdZ.toLowerCase()}`)) ||
			(_aZap && activity.rootDeletedByKey.get(`a:${_aZap}`)) ||
			null)}
	{@const _labelCommunityZ =
		_rootPostZ?.kind === EVENT_KINDS.FORUM_POST ? ZAPSTORE_COMMUNITY_PUBKEY : null}
	{#key thread.threadModalZapId}
		<RootComment
			hideRoot={true}
			openThreadOnMount={!thread.threadOpenFeedActionsOnly && !thread.threadOpenFeedZapOnly}
			expandCommentId={thread.threadModalExpandCommentId}
			openActionsOnMount={thread.threadOpenActionsOnMount}
			initialActionsTarget={thread.threadInitialActionsTarget}
			standaloneActionsOpenKey={thread.standaloneActionsOpenKey}
			openZapOnMount={thread.threadOpenFeedZapOnly}
			standaloneZapOpenKey={thread.standaloneZapOpenKey}
			feedInitialZapTarget={thread.pendingZapCommentEv
				? thread.enrichReplyTargetForModal(thread.pendingZapCommentEv)
				: null}
			openReplyOnMount={thread.openReplyOnMount}
			initialReplyTarget={thread.initialReplyTargetForModal}
			modalZIndex={110}
			isZapRoot={true}
			id={_zEv.id}
			content={_zParsed.comment ?? ''}
			zapAmount={_zParsed.amountSats ?? 0}
			emojiTags={_zParsed.emojiTags ?? []}
			mediaUrls={(_zEv.tags ?? []).filter((t) => t[0] === 'media' && t[1]).map((t) => t[1])}
			pictureUrl={_zapperRaw?.picture ?? null}
			name={_zapperRaw?.displayName ??
				_zapperRaw?.name ??
				(_zapperNpubZ
					? `npub1${_zapperNpubZ.slice(5, 8)}…${_zapperNpubZ.slice(-6)}`
					: (_zParsed.senderPubkey ?? '').slice(0, 8))}
			pubkey={_zParsed.senderPubkey ?? ''}
			timestamp={_zEv.created_at}
			profileUrl={_zapperNpubZ ? `/profile/${_zapperNpubZ}` : ''}
			authorPubkey={_zParsed.senderPubkey ?? ''}
			threadComments={thread.selectedThreadComments}
			threadZaps={thread.selectedThreadZaps}
			labelCommunityPubkey={_labelCommunityZ}
			rootContext={_bannerHrefZ
				? {
						label: _rootPostZ?.kind === EVENT_KINDS.FORUM_POST ? _postTitleZ : _bannerOnelinerZ.label,
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
			appIconUrl={_zapBadgeZ?.iconUrl ?? null}
			appName={_zapBadgeZ?.name ?? ''}
			appIdentifier={_zapBadgeZ?.identifier ?? null}
			onModalClose={thread.closeThread}
			signEvent={signEvent}
			searchProfiles={searchProfilesFn}
			searchEmojis={searchEmojisFn}
			onReplySubmit={thread.threadModalAddrATag
				? (e) => thread.handleActivityThreadReply(null, null, e)
				: _rootPostZ
					? (e) => thread.handleActivityThreadReply(_rootPostZ.id, _rootPostZ.pubkey, e)
					: undefined}
			onZapReceived={() => {}}
			onGetStarted={() => {}}
			{resolveMentionLabel}
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
