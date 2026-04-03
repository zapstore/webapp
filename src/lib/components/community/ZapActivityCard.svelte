<script lang="js">
	/**
	 * ZapActivityCard — Activity feed row for kind 9735 (comment optional; amount + zapper always shown).
	 */
	import { nip19 } from 'nostr-tools';
	import ProfilePic from '$lib/components/common/ProfilePic.svelte';
	import AppPic from '$lib/components/common/AppPic.svelte';
	import Timestamp from '$lib/components/common/Timestamp.svelte';
	import ShortTextRenderer from '$lib/components/common/ShortTextRenderer.svelte';
	import QuotedMessage from '$lib/components/social/QuotedMessage.svelte';
	import CommentBubbleActionRail from '$lib/components/social/CommentBubbleActionRail.svelte';
	import ActivityStackMiniBadge from '$lib/components/community/ActivityStackMiniBadge.svelte';
	import DeletedRootBadge from '$lib/components/community/DeletedRootBadge.svelte';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
	import { Zap } from '$lib/components/icons';
	import { EVENT_KINDS } from '$lib/config.js';
	import { getEventOneliner } from '$lib/nostr/models.js';

	let {
		/** @type {import('nostr-tools').NostrEvent} */
		zapEvent,
		/** From parseZapReceipt(zapEvent) */
		parsed,
		/** Zapper profile */
		authorProfile = null,
		zapperPubkey = null,
		rootEvent = null,
		parentComment = null,
		parentCommentAuthor = null,
		profileUrl = '',
		className = '',
		resolveMentionLabel = undefined,
		appBadge = null,
		/** Root (forum/app/stack) still resolving */
		rootBadgeSkeleton = false,
		/** Root never loaded after timeout */
		deletedRootKind = /** @type {'forum' | 'app' | 'stack' | null} */ (null),
		feedActions = null,
		onRootClick = null
	} = $props();

	const showQuote = $derived(!!parentComment && !!parsed?.zappedEventId);
	const rootOneliner = $derived(getEventOneliner(rootEvent));
	const isStackRoot = $derived(
		deletedRootKind === 'stack' || rootEvent?.kind === EVENT_KINDS.APP_STACK
	);
	const deletedRootLabel = $derived(
		deletedRootKind === 'forum'
			? 'Deleted forum post'
			: deletedRootKind === 'app'
				? 'Deleted app'
				: deletedRootKind === 'stack'
					? 'Deleted stack'
					: ''
	);
	const showDeletedRoot = $derived(deletedRootKind != null);

	const emojiTags = $derived(parsed?.emojiTags ?? []);
	const contentText = $derived(parsed?.comment ?? '');
	/** No zap note text — add outer top spacing so the left rail reads clearly */
	const noZapCommentBody = $derived(!String(contentText ?? '').trim());

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
			(zapperPubkey ? formatNpub(zapperPubkey) : 'Anonymous')
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

	function formatAmount(val) {
		const n = Number(val) || 0;
		if (n >= 1000000) return `${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}M`;
		if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
		return n.toLocaleString();
	}
</script>

<div class="zap-activity-card {className}">
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
						className="zap-activity-app-pic"
						onClick={() => {}}
					/>
				</div>
			{:else if rootBadgeSkeleton}
				<div class="root-badge-skeleton">
					<SkeletonLoader />
				</div>
			{:else}
				<Zap variant="fill" size={14} color="url(#zap-activity-card-gradient)" />
			{/if}
		</div>
		{#if showQuote}
			<div class="line-dotted"></div>
		{/if}
		<div class="line-solid"></div>
		<div class="avatar-wrap">
			{#if profileUrl}
				<a href={profileUrl} class="avatar-link">
					<ProfilePic
						pictureUrl={authorProfile?.picture ?? null}
						name={authorProfile?.name ?? null}
						pubkey={zapperPubkey}
						size="smMd"
					/>
				</a>
			{:else}
				<ProfilePic
					pictureUrl={authorProfile?.picture ?? null}
					name={authorProfile?.name ?? null}
					pubkey={zapperPubkey}
					size="smMd"
				/>
			{/if}
		</div>
	</div>

	<div class="right-col">
		<div class="root-label-row">
			{#if showDeletedRoot}
				<span class="root-label root-label--deleted">{deletedRootLabel}</span>
			{:else if onRootClick}
				<button
					type="button"
					class="root-label root-label-link"
					class:root-label--split={isStackRoot}
					onclick={(e) => {
						e.stopPropagation();
						onRootClick();
					}}
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

		{#if feedActions}
			<div
				class="bubble-with-rail desktop-bubble-actions-target"
				class:bubble-with-rail--no-zap-comment={noZapCommentBody}
			>
				<div class="bubble-stack">
					<div class="zap-bubble-skin" class:zap-bubble-skin--quoted={showQuote}>
						<div class="bubble">
							<div class="bubble-header">
								<div class="header-left">
									{#if profileUrl}
										<a href={profileUrl} class="author-name">{displayName}</a>
									{:else}
										<span class="author-name">{displayName}</span>
									{/if}
									<Timestamp timestamp={zapEvent?.created_at} size="xs" />
								</div>
								<div class="zap-amount-row">
									<Zap variant="fill" size={14} color="url(#zap-activity-card-gradient)" />
									<span class="zap-amount">{formatAmount(parsed?.amountSats ?? 0)}</span>
								</div>
							</div>

							{#if showQuote}
								<div class="quote-wrap">
									<QuotedMessage
										authorName={parentDisplayName || 'Anonymous'}
										authorPubkey={parentComment?.pubkey ?? null}
										content={parentComment.content ?? ''}
										emojiTags={parentEmojiTags}
										mediaUrls={parentMediaUrls}
										{resolveMentionLabel}
									/>
								</div>
							{/if}

							{#if contentText}
								<div class="bubble-content">
									<ShortTextRenderer content={contentText} {emojiTags} {resolveMentionLabel} />
								</div>
							{/if}
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
			<div
				class="zap-bubble-skin"
				class:zap-bubble-skin--quoted={showQuote}
				class:zap-bubble-skin--no-comment={noZapCommentBody}
			>
				<div class="bubble">
					<div class="bubble-header">
						<div class="header-left">
							{#if profileUrl}
								<a href={profileUrl} class="author-name">{displayName}</a>
							{:else}
								<span class="author-name">{displayName}</span>
							{/if}
							<Timestamp timestamp={zapEvent?.created_at} size="xs" />
						</div>
						<div class="zap-amount-row">
							<Zap variant="fill" size={14} color="url(#zap-activity-card-gradient)" />
							<span class="zap-amount">{formatAmount(parsed?.amountSats ?? 0)}</span>
						</div>
					</div>
					{#if showQuote}
						<div class="quote-wrap">
							<QuotedMessage
								authorName={parentDisplayName || 'Anonymous'}
								authorPubkey={parentComment?.pubkey ?? null}
								content={parentComment.content ?? ''}
								emojiTags={parentEmojiTags}
								mediaUrls={parentMediaUrls}
								{resolveMentionLabel}
							/>
						</div>
					{/if}
					{#if contentText}
						<div class="bubble-content">
							<ShortTextRenderer content={contentText} {emojiTags} {resolveMentionLabel} />
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<svg width="0" height="0" style="position: absolute;" aria-hidden="true">
	<defs>
		<linearGradient id="zap-activity-card-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
			<stop offset="0%" stop-color="#FFC736" />
			<stop offset="100%" stop-color="#FFA037" />
		</linearGradient>
	</defs>
</svg>

<style>
	.zap-activity-card {
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

	.app-badge-pic-wrap :global(.zap-activity-app-pic) {
		cursor: inherit;
	}

	.app-badge-pic-wrap :global(.zap-activity-app-pic:hover),
	.app-badge-pic-wrap :global(.zap-activity-app-pic:active) {
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
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.root-label-row {
		height: 28px;
		display: flex;
		align-items: center;
		min-width: 0;
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

	.bubble-with-rail {
		display: flex;
		align-items: flex-end;
		gap: 12px;
		min-width: 0;
		max-width: 100%;
	}

	/* Outside the bubble — room above chrome so left rail is visible */
	.bubble-with-rail--no-zap-comment {
		padding-top: 4px;
		box-sizing: border-box;
	}

	.bubble-stack {
		min-width: 0;
		flex: 1;
	}

	.bubble-action-rail-host {
		flex-shrink: 0;
		align-self: flex-end;
	}

	/* Match ZapBubble.svelte bubble chrome (radial gold wash, typography, spacing). */
	.zap-bubble-skin {
		width: fit-content;
		max-width: 100%;
		min-width: 200px;
	}

	/* No feedActions branch: outer top gap (not inside .bubble padding) */
	.zap-bubble-skin--no-comment {
		padding-top: 4px;
		box-sizing: border-box;
	}

	.zap-bubble-skin--quoted {
		min-width: 260px;
	}

	.zap-bubble-skin .bubble {
		width: fit-content;
		max-width: 100%;
		min-width: 0;
		background: radial-gradient(
			circle at top left,
			rgba(255, 199, 54, 0.1) 0%,
			rgba(255, 160, 55, 0.1) 100%
		);
		border-radius: 12px 12px 12px 3px;
		padding: 8px 12px;
	}

	.bubble-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 2px;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.zap-amount-row {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.zap-amount {
		font-weight: 500;
		font-size: 1rem;
		line-height: 1.2;
		color: hsl(var(--foreground));
		font-variant-numeric: tabular-nums;
	}

	.author-name {
		font-weight: 600;
		font-size: 0.875rem;
		line-height: 1.2;
		text-decoration: none;
		transition: opacity 0.15s ease;
		white-space: nowrap;
		background: var(--gradient-gold);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
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
		margin-top: 4px;
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
