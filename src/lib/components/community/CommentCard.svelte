<script lang="js">
/**
 * CommentCard — Activity feed card for kind:1111 comments.
 * Same layout as chateau: emoji badge + root label, avatar, bubble with optional quoted reply.
 */
import { nip19 } from 'nostr-tools';
import ProfilePic from '$lib/components/common/ProfilePic.svelte';
import AppPic from '$lib/components/common/AppPic.svelte';
import Timestamp from '$lib/components/common/Timestamp.svelte';
import ShortTextContent from '$lib/components/common/ShortTextContent.svelte';
import QuotedMessage from '$lib/components/social/QuotedMessage.svelte';
import QuotedZapMessage from '$lib/components/social/QuotedZapMessage.svelte';
import CommentBubbleActionRail from '$lib/components/social/CommentBubbleActionRail.svelte';
import ActivityStackMiniBadge from '$lib/components/community/ActivityStackMiniBadge.svelte';
import DeletedRootBadge from '$lib/components/community/DeletedRootBadge.svelte';
import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
import { EVENT_KINDS } from '$lib/config.js';
import { getEventOneliner } from '$lib/nostr/models.js';
import { hexToColor, getProfileTextColor, rgbToCssString } from '$lib/utils/color.js';
import { onMount } from 'svelte';

let {
	/** @type {import('nostr-tools').NostrEvent} */
	event,
	/** @type {{ name?: string, picture?: string, pubkey: string } | null} */
	authorProfile = null,
	/** @type {import('nostr-tools').NostrEvent | null} */
	rootEvent = null,
	/** @type {import('nostr-tools').NostrEvent | null} */
	parentComment = null,
	/** @type {{ name?: string, picture?: string, pubkey: string } | null} */
	parentCommentAuthor = null,
	/** When reply parent is a zap receipt (kind 9735), not in parentComment. */
	parentZapParsed = null,
	/** Profile for the zapper (sender); optional if not loaded yet. */
	parentZapperAuthor = null,
	profileUrl = '',
	className = '',
	/** @type {((pubkey: string) => string) | undefined} */
	resolveMentionLabel = undefined,
	/**
	 * When set, shows an app icon in the top badge instead of the root emoji (e.g. studio activity).
	 * @type {{ iconUrl?: string | null, name?: string | null, identifier?: string | null } | null}
	 */
	appBadge = null,
	/** While root event (forum/app/stack) is still resolving — badge shimmer instead of forum emoji */
	rootBadgeSkeleton = false,
	/** After timeout, root never loaded — show "not found" label (no link). */
	deletedRootKind = /** @type {'forum' | 'app' | 'stack' | null} */ (null),
	/**
	 * Hover action rail (Reply / Zap / Options). All three open the in-feed thread modal.
	 * @type {{ onReply?: () => void, onZap?: () => void, onOptions?: () => void } | null}
	 */
	feedActions = null,
	/**
	 * Called when the root-label-row (app/forum post name) is clicked.
	 * Only this row navigates; clicking the bubble calls feedActions handlers instead.
	 * @type {(() => void) | null}
	 */
	onRootClick = null,
	/** Unread indicator (e.g. header notifications). */
	showUnreadDot = false
} = $props();

const isReply = $derived.by(() => {
	if (!event?.tags) return false;
	const upperRoot = event.tags.find((t) => (t[0] === 'E' || t[0] === 'A') && t[1]);
	const lowerParent = event.tags.find((t) => (t[0] === 'e' || t[0] === 'a') && t[1]);
	if (!lowerParent) return false;
	return upperRoot ? lowerParent[1] !== upperRoot[1] : true;
});

const showQuote = $derived(
	isReply &&
		(!!parentComment || !!(parentZapParsed && parentZapParsed.senderPubkey))
);
const rootOneliner = $derived(getEventOneliner(rootEvent));
const isStackRoot = $derived(
	deletedRootKind === 'stack' || rootEvent?.kind === EVENT_KINDS.APP_STACK
);
const deletedRootLabel = $derived(
	deletedRootKind === 'forum'
		? 'Forum post not found'
		: deletedRootKind === 'app'
			? 'App not found'
			: deletedRootKind === 'stack'
				? 'Stack not found'
				: ''
);
const showDeletedRoot = $derived(deletedRootKind != null);

const emojiTags = $derived(
	(event?.tags ?? [])
		.filter((t) => t[0] === 'emoji' && t[1] && t[2])
		.map((t) => ({ shortcode: t[1], url: t[2] }))
);
/** Media URLs from event 'media' tags (NIP-94 style) */
const mediaUrls = $derived(
	(event?.tags ?? []).filter((t) => t[0] === 'media' && t[1]).map((t) => t[1])
);

function formatNpub(pk) {
	if (!pk) return '';
	try {
		const enc = nip19.npubEncode(pk);
		return `npub1${enc.slice(5, 8)}…${enc.slice(-6)}`;
	} catch {
		return pk.slice(0, 8) + '…';
	}
}

const displayName = $derived(
	authorProfile?.name?.trim() ||
		authorProfile?.displayName?.trim() ||
		(event?.pubkey ? formatNpub(event.pubkey) : '')
);

const parentDisplayName = $derived(
	parentCommentAuthor?.name?.trim() ||
		parentCommentAuthor?.displayName?.trim() ||
		(parentComment?.pubkey ? formatNpub(parentComment.pubkey) : '')
);

const parentEmojiTags = $derived(
	(parentComment?.tags ?? [])
		.filter((t) => t[0] === 'emoji' && t[1] && t[2])
		.map((t) => ({ shortcode: t[1], url: t[2] }))
);
const parentMediaUrls = $derived(
	(parentComment?.tags ?? []).filter((t) => t[0] === 'media' && t[1]).map((t) => t[1])
);

const zapQuoteAuthorName = $derived(
	parentZapperAuthor?.name?.trim() ||
		parentZapperAuthor?.displayName?.trim() ||
		(parentZapParsed?.senderPubkey ? formatNpub(parentZapParsed.senderPubkey) : 'Anonymous')
);

let isDarkMode = $state(true);
onMount(() => {
	const mq = window.matchMedia('(prefers-color-scheme: dark)');
	isDarkMode = mq.matches;
	const handler = (e) => (isDarkMode = e.matches);
	mq.addEventListener('change', handler);
	return () => mq.removeEventListener('change', handler);
});

const profileColor = $derived(
	event?.pubkey ? hexToColor(event.pubkey) : { r: 128, g: 128, b: 128 }
);
const textColor = $derived(getProfileTextColor(profileColor, isDarkMode));
const nameColorStyle = $derived(rgbToCssString(textColor));
const contentText = $derived(event?.content ?? '');
</script>

<div class="comment-card {className}" class:desktop-bubble-actions-target={!!feedActions}>
	<div class="left-col">
		<div
			class="emoji-badge"
			class:emoji-badge--app={!!appBadge && !isStackRoot && !showDeletedRoot}
			class:emoji-badge--stack={isStackRoot && !showDeletedRoot}
			class:emoji-badge--root-skel={rootBadgeSkeleton && !showDeletedRoot}
			aria-hidden="true"
		>
			{#if showDeletedRoot}
				<DeletedRootBadge embedded />
			{:else if isStackRoot}
				<ActivityStackMiniBadge />
			{:else if appBadge}
				<div class="app-badge-pic-wrap">
					<AppPic
						iconUrl={appBadge.iconUrl ?? null}
						name={appBadge.name ?? null}
						identifier={appBadge.identifier ?? null}
						size="xxs"
						className="comment-card-app-pic"
						onClick={() => {}}
					/>
				</div>
			{:else if rootBadgeSkeleton}
				<div class="root-badge-skeleton">
					<SkeletonLoader />
				</div>
			{:else}
				<img src={rootOneliner.emoji} alt="" width="14" height="14" />
			{/if}
		</div>
		{#if isReply}
			<div class="line-dotted"></div>
		{/if}
		<div class="line-solid"></div>
		<div class="avatar-wrap">
			{#if profileUrl}
				<a href={profileUrl} class="avatar-link">
					<ProfilePic
						pictureUrl={authorProfile?.picture ?? null}
						name={authorProfile?.name ?? null}
						pubkey={event?.pubkey ?? null}
						size="smMd"
					/>
				</a>
			{:else}
				<ProfilePic
					pictureUrl={authorProfile?.picture ?? null}
					name={authorProfile?.name ?? null}
					pubkey={event?.pubkey ?? null}
					size="smMd"
				/>
			{/if}
		</div>
	</div>

	<div class="right-col">
		<div class="root-label-row">
			<div class="root-label-main">
				{#if showDeletedRoot}
					<span class="root-label root-label--deleted">{deletedRootLabel}</span>
				{:else if onRootClick}
					<button
						type="button"
						class="root-label root-label-link"
						class:root-label--split={isStackRoot}
						onclick={(e) => { e.stopPropagation(); onRootClick(); }}
					>
						{#if isStackRoot}<span class="root-label-kind">Stack</span>{/if}
						{#if isStackRoot}
							<span class="root-label-ellipsis">{rootOneliner.label}</span>
						{:else}
							{rootOneliner.label}
						{/if}
					</button>
				{:else}
					<span class="root-label" class:root-label--split={isStackRoot}>
						{#if isStackRoot}<span class="root-label-kind">Stack</span>{/if}
						{#if isStackRoot}
							<span class="root-label-ellipsis">{rootOneliner.label}</span>
						{:else}
							{rootOneliner.label}
						{/if}
					</span>
				{/if}
			</div>
			{#if showUnreadDot}
				<span class="inbox-unread-dot" aria-hidden="true"></span>
			{/if}
		</div>

		{#if feedActions}
			<div class="bubble-with-rail">
				<div class="bubble-stack">
					<div class="bubble" class:bubble--quoted={showQuote}>
						<div class="bubble-header">
							{#if profileUrl}
								<a href={profileUrl} class="author-name" style="color: {nameColorStyle};"
									>{displayName}</a
								>
							{:else}
								<span class="author-name" style="color: {nameColorStyle};">{displayName}</span>
							{/if}
							<Timestamp timestamp={event?.created_at} size="xs" />
						</div>

						{#if showQuote}
							<div class="quote-wrap">
								{#if parentComment}
									<QuotedMessage
										authorName={parentDisplayName || 'Anonymous'}
										authorPubkey={parentComment?.pubkey ?? null}
										content={parentComment.content ?? ''}
										emojiTags={parentEmojiTags}
										mediaUrls={parentMediaUrls}
										{resolveMentionLabel}
									/>
								{:else if parentZapParsed?.senderPubkey}
									<QuotedZapMessage
										authorName={zapQuoteAuthorName}
										authorPubkey={parentZapParsed.senderPubkey}
										amountSats={parentZapParsed.amountSats ?? 0}
										content={parentZapParsed.comment ?? ''}
										emojiTags={parentZapParsed.emojiTags ?? []}
										mediaUrls={[]}
										{resolveMentionLabel}
									/>
								{/if}
							</div>
						{/if}

						<div class="bubble-content">
							<ShortTextContent
								content={contentText}
								{emojiTags}
								mediaUrls={mediaUrls}
								{resolveMentionLabel}
							/>
						</div>
					</div>
				</div>
				<div class="bubble-action-rail-host">
					<CommentBubbleActionRail
						onReply={() => feedActions?.onReply?.()}
						onZap={() => feedActions?.onZap?.()}
						onOptions={() => feedActions?.onOptions?.()}
					/>
				</div>
			</div>
		{:else}
			<div class="bubble" class:bubble--quoted={showQuote}>
				<div class="bubble-header">
					{#if profileUrl}
						<a href={profileUrl} class="author-name" style="color: {nameColorStyle};"
							>{displayName}</a
						>
					{:else}
						<span class="author-name" style="color: {nameColorStyle};">{displayName}</span>
					{/if}
					<Timestamp timestamp={event?.created_at} size="xs" />
				</div>

				{#if showQuote}
					<div class="quote-wrap">
						{#if parentComment}
							<QuotedMessage
								authorName={parentDisplayName || 'Anonymous'}
								authorPubkey={parentComment?.pubkey ?? null}
								content={parentComment.content ?? ''}
								emojiTags={parentEmojiTags}
								mediaUrls={parentMediaUrls}
								{resolveMentionLabel}
							/>
						{:else if parentZapParsed?.senderPubkey}
							<QuotedZapMessage
								authorName={zapQuoteAuthorName}
								authorPubkey={parentZapParsed.senderPubkey}
								amountSats={parentZapParsed.amountSats ?? 0}
								content={parentZapParsed.comment ?? ''}
								emojiTags={parentZapParsed.emojiTags ?? []}
								mediaUrls={[]}
								{resolveMentionLabel}
							/>
						{/if}
					</div>
				{/if}

				<div class="bubble-content">
					<ShortTextContent
						content={contentText}
						{emojiTags}
						mediaUrls={mediaUrls}
						{resolveMentionLabel}
					/>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.comment-card {
		display: flex;
		gap: 8px;
		align-items: stretch;
	}

	.left-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex-shrink: 0;
		width: 36px;
	}

	.emoji-badge {
		width: 28px;
		height: 28px;
		border-radius: 6px;
		background: hsl(var(--white8));
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	/* App/stack/skel: same 28×28 tile as forum emoji; transparent shell clips AppPic xxs (28px) */
	.emoji-badge--app,
	.emoji-badge--stack,
	.emoji-badge--root-skel {
		width: 28px;
		height: 28px;
		padding: 0;
		overflow: hidden;
		background: transparent;
		border: none;
		border-radius: 6px;
	}

	.root-badge-skeleton {
		width: 100%;
		height: 100%;
		border-radius: 6px;
		overflow: hidden;
	}

	.app-badge-pic-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		min-width: 0;
		min-height: 0;
		flex-shrink: 0;
		pointer-events: none;
		border-radius: 6px;
		overflow: hidden;
		isolation: isolate;
		contain: strict;
	}

	.app-badge-pic-wrap :global(.comment-card-app-pic) {
		cursor: inherit;
	}

	.app-badge-pic-wrap :global(.comment-card-app-pic:hover),
	.app-badge-pic-wrap :global(.comment-card-app-pic:active) {
		transform: none;
	}

	.line-dotted {
		width: 2px;
		flex: 1;
		background: repeating-linear-gradient(
			to bottom,
			hsl(var(--white16)) 0px,
			hsl(var(--white16)) 6px,
			transparent 6px,
			transparent 10px
		);
	}

	.line-solid {
		width: 2px;
		flex: 1;
		background: hsl(var(--white16));
	}

	.avatar-wrap {
		flex-shrink: 0;
	}

	.avatar-link {
		display: block;
		transition: opacity 0.15s ease;
	}
	.avatar-link:hover {
		opacity: 0.8;
	}

	.right-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.root-label-row {
		width: 100%;
		height: 28px;
		display: flex;
		align-items: center;
		min-width: 0;
		gap: 8px;
	}

	.root-label-main {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
	}

	.inbox-unread-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: hsl(var(--blurpleColor));
		flex-shrink: 0;
		margin-left: auto;
	}

	.root-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--white66));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.root-label--split {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		max-width: 100%;
		min-width: 0;
	}

	.root-label-kind {
		flex-shrink: 0;
		color: hsl(var(--white33));
	}

	.root-label-ellipsis {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.root-label-link {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		text-align: left;
	}

	.root-label-link:hover {
		color: hsl(var(--foreground));
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.root-label-link:hover .root-label-kind {
		color: hsl(var(--foreground));
	}

	.root-label--deleted {
		color: hsl(var(--white33));
	}

	/* Match MessageBubble + CommentBubbleActionRail (RootComment feed) */
	.bubble-with-rail {
		display: flex;
		align-items: flex-end;
		align-self: flex-start;
		gap: 8px;
		width: fit-content;
		max-width: 100%;
		min-width: 0;
	}

	.bubble-stack {
		min-width: 0;
		flex: 0 1 auto;
	}

	.bubble-action-rail-host {
		flex-shrink: 0;
		align-self: flex-end;
	}

	.bubble {
		width: fit-content;
		max-width: 100%;
		min-width: 200px;
		background-color: hsl(var(--gray66));
		border-radius: 12px 12px 12px 3px;
		padding: 8px 12px;
	}

	.bubble--quoted {
		min-width: 260px;
	}

	.bubble-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		flex-wrap: wrap;
		margin-bottom: 4px;
	}

	.author-name {
		font-weight: 600;
		font-size: 0.875rem;
		line-height: 1.2;
		text-decoration: none;
		transition: opacity 0.15s ease;
		white-space: nowrap;
	}

	a.author-name:hover {
		opacity: 0.8;
	}

	.quote-wrap {
		width: 0;
		min-width: 100%;
	}

	.bubble-content {
		font-size: 0.9375rem;
		line-height: 1.5;
		color: hsl(var(--foreground) / 0.85);
	}

	.bubble-content :global(p) {
		margin: 0;
	}

	.bubble-content :global(p + p) {
		margin-top: 0.5rem;
	}

	.bubble-content :global(a) {
		color: hsl(var(--primary));
		text-decoration: none;
	}

	.bubble-content :global(a:hover) {
		text-decoration: underline;
	}
</style>
