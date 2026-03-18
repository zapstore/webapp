<script lang="js">
/**
 * CommentCard — Activity feed card for kind:1111 comments.
 * Same layout as chateau: emoji badge + root label, avatar, bubble with optional quoted reply.
 */
import { nip19 } from 'nostr-tools';
import ProfilePic from '$lib/components/common/ProfilePic.svelte';
import Timestamp from '$lib/components/common/Timestamp.svelte';
import ShortTextRenderer from '$lib/components/common/ShortTextRenderer.svelte';
import QuotedMessage from '$lib/components/social/QuotedMessage.svelte';
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
	profileUrl = '',
	className = '',
	/** @type {((pubkey: string) => string) | undefined} */
	resolveMentionLabel = undefined
} = $props();

const isReply = $derived.by(() => {
	if (!event?.tags) return false;
	const upperRoot = event.tags.find((t) => (t[0] === 'E' || t[0] === 'A') && t[1]);
	const lowerParent = event.tags.find((t) => (t[0] === 'e' || t[0] === 'a') && t[1]);
	if (!lowerParent) return false;
	return upperRoot ? lowerParent[1] !== upperRoot[1] : true;
});

const showQuote = $derived(isReply && !!parentComment);
const rootOneliner = $derived(getEventOneliner(rootEvent));

const emojiTags = $derived(
	(event?.tags ?? [])
		.filter((t) => t[0] === 'emoji' && t[1] && t[2])
		.map((t) => ({ shortcode: t[1], url: t[2] }))
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

const parentContentPreview = $derived(
	(parentComment?.content ?? '').replace(/nostr:[a-z0-9]+/gi, '').replace(/\s+/g, ' ').trim()
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

<div class="comment-card {className}">
	<div class="left-col">
		<div class="emoji-badge" aria-hidden="true">
			<img src={rootOneliner.emoji} alt="" width="14" height="14" />
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
			<span class="root-label">{rootOneliner.label}</span>
		</div>

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
					<QuotedMessage
						authorName={parentDisplayName || 'Anonymous'}
						authorPubkey={parentComment?.pubkey ?? null}
						contentPreview={parentContentPreview}
					/>
				</div>
			{/if}

			<div class="bubble-content">
				<ShortTextRenderer content={contentText} {emojiTags} {resolveMentionLabel} />
			</div>
		</div>
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
		border-radius: 10px;
		background: hsl(var(--white8));
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
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

	.bubble {
		width: fit-content;
		max-width: 100%;
		min-width: 200px;
		background-color: hsl(var(--gray66));
		border-radius: 16px 16px 16px 4px;
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
