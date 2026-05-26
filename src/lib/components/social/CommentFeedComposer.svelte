<script lang="js">
/**
 * CommentFeedComposer - Profile pic + bubble comment trigger above the comments feed.
 * Opens CommentModal (with optional Tip/Zap from the editor action row).
 */
import ProfilePic from '$lib/components/common/ProfilePic.svelte';
import CommentModal from '$lib/components/modals/CommentModal.svelte';
import { queryEvent, fetchProfile } from '$lib/purpleweb';
import { parseProfile } from '$lib/nostr/models';

let {
	className = '',
	ctaLabel = 'Your Comment',
	target = null,
	recipientName = '',
	contentType = 'app',
	otherZaps = [],
	isSignedIn = true,
	getCurrentPubkey = () => null,
	searchProfiles = async () => [],
	searchEmojis = async () => [],
	signEvent = null,
	onCommentSubmit,
	onZapReceived,
	onZapPending,
	onZapPendingClear,
} = $props();

let commentModalOpen = $state(false);
let userProfile = $state(null);

$effect(() => {
	const pk = getCurrentPubkey?.();
	if (!pk) {
		userProfile = null;
		return;
	}
	queryEvent({ kinds: [0], authors: [pk], limit: 1 }).then((ev) => {
		if (ev?.content) {
			try {
				const p = parseProfile(ev);
				userProfile = {
					displayName: p.displayName ?? p.name ?? '',
					name: p.name ?? '',
					picture: p.picture ?? null,
				};
			} catch {
				userProfile = null;
			}
		} else {
			userProfile = null;
		}
	}).catch(() => {
		userProfile = null;
	});
	fetchProfile(pk).then((ev) => {
		if (ev?.content) {
			try {
				const p = parseProfile(ev);
				userProfile = {
					displayName: p.displayName ?? p.name ?? '',
					name: p.name ?? '',
					picture: p.picture ?? null,
				};
			} catch {
				/* keep cached */
			}
		}
	}).catch(() => {});
});

function openComposer() {
	commentModalOpen = true;
}

function handleCommentSubmit(event) {
	onCommentSubmit?.({
		text: event.text,
		emojiTags: event.emojiTags,
		mentions: event.mentions,
		mediaUrls: event.mediaUrls,
		parentId: undefined,
		target: event.target ?? target,
	});
}
</script>

{#if isSignedIn}
<div class="comment-feed-composer {className}">
	<div class="comment-feed-pic">
		<ProfilePic
			pictureUrl={userProfile?.picture}
			name={userProfile?.displayName || userProfile?.name}
			pubkey={getCurrentPubkey?.()}
			size="smMd"
		/>
	</div>
	<button type="button" class="comment-feed-bubble" onclick={openComposer}>
		<span class="comment-feed-bubble-text">{ctaLabel}</span>
	</button>
</div>

<CommentModal
	bind:isOpen={commentModalOpen}
	{target}
	recipientName={recipientName}
	{contentType}
	{otherZaps}
	{getCurrentPubkey}
	{searchProfiles}
	{searchEmojis}
	{signEvent}
	onsubmit={handleCommentSubmit}
	onzapReceived={onZapReceived}
	{onZapPending}
	{onZapPendingClear}
/>
{/if}

<style>
	.comment-feed-composer {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 16px;
		padding-right: 7px;
	}

	.comment-feed-pic {
		flex-shrink: 0;
		line-height: 0;
	}

	.comment-feed-bubble {
		flex: 1;
		min-width: 0;
		height: 35px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		padding: 0 13px 0 12px;
		background: var(--gray33);
		border: 0.33px solid var(--white16);
		border-radius: 16px 16px 16px 4px;
		cursor: pointer;
		text-align: left;
		transition: opacity 0.15s ease, transform 0.15s ease;
	}

	@media (min-width: 768px) {
		.comment-feed-composer {
			/* Inset for hover action rail beside feed bubbles */
			padding-right: 68px;
		}
	}

	.comment-feed-bubble:hover {
		opacity: 0.92;
	}

	.comment-feed-bubble:active {
		transform: scale(0.99);
	}

	.comment-feed-bubble-text {
		font-size: 0.9375rem;
		font-weight: 400;
		line-height: 1.5;
		color: var(--white33);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
