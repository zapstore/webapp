<script lang="js">
/**
 * BottomBar - Fixed bottom action bar for detail pages.
 * Morphs in place into the comment form when Comment is tapped (no separate modal).
 * Slides out only when ZapSliderModal is open.
 */
import { Zap, Reply, Options } from '$lib/components/icons';
import InputButton from '$lib/components/common/InputButton.svelte';
import ShortTextInput from '$lib/components/common/ShortTextInput.svelte';
import ZapSliderModal from '$lib/components/modals/ZapSliderModal.svelte';
let { appName = '', publisherName = '', contentType = 'app', className = '', zapTarget = null, otherZaps = [], isSignedIn = true, onGetStarted, searchProfiles = async () => [], searchEmojis = async () => [], oncommentSubmit, onzapReceived, onoptions } = $props();
let zapModalOpen = $state(false);
let commentExpanded = $state(false);
let commentInput = $state(null);
let submitting = $state(false);
/** Bar slides out only when zap modal is open (comment morphs in place) */
const barSlidesOut = $derived(zapModalOpen);
function handleZap() {
    zapModalOpen = true;
}
function handleZapClose(event) {
    zapModalOpen = false;
    if (event.success) {
        onzapReceived?.({ zapReceipt: {} });
    }
}
function handleZapReceived(event) {
    onzapReceived?.(event);
}
function handleComment() {
    commentExpanded = true;
}
function closeComment() {
    commentExpanded = false;
}
async function handleCommentSubmit(event) {
    if (submitting || !event.text.trim())
        return;
    submitting = true;
    try {
        oncommentSubmit?.({ ...event, target: zapTarget });
        commentInput?.clear?.();
        closeComment();
    }
    catch (err) {
        console.error('Failed to submit comment:', err);
    }
    finally {
        submitting = false;
    }
}
function handleCommentKeydown(e) {
    if (!commentExpanded)
        return;
    if (e.key === 'Escape') {
        closeComment();
        e.preventDefault();
        e.stopPropagation();
    }
}
$effect(() => {
    if (commentExpanded && commentInput) {
        const t = setTimeout(() => commentInput?.focus?.(), 120);
        return () => clearTimeout(t);
    }
});
</script>

<svelte:window onkeydown={handleCommentKeydown} />

<div class="bottom-bar-wrapper {className}" class:modal-open={barSlidesOut}>
	{#if commentExpanded && isSignedIn}
		<div class="bottom-bar-comment-only">
			<div class="comment-input-wrap">
				<ShortTextInput
					bind:this={commentInput}
					placeholder="Comment on {zapTarget?.name ?? 'this'}"
					size="medium"
					{searchProfiles}
					{searchEmojis}
					autoFocus={true}
					showActionRow={true}
					onClose={closeComment}
					onCameraTap={() => {}}
					onEmojiTap={() => {}}
					onGifTap={() => {}}
					onAddTap={() => {}}
					onChevronTap={() => {}}
					onsubmit={handleCommentSubmit}
				/>
			</div>
		</div>
	{:else if !commentExpanded}
		<div class="bottom-bar" class:guest={!isSignedIn} class:expanded={false}>
			<div class="bottom-bar-content">
				{#if isSignedIn}
					<button type="button" class="btn-primary-large zap-button" onclick={handleZap}>
						<Zap variant="fill" size={18} color="hsl(var(--whiteEnforced))" />
						<span>Zap</span>
					</button>
					<InputButton className="comment-btn" placeholder="Comment" onclick={handleComment}>
						{#snippet icon()}
							<Reply variant="outline" size={18} strokeWidth={1.4} color="hsl(var(--white33))" />
						{/snippet}
					</InputButton>
					<button
						type="button"
						class="btn-secondary-large btn-secondary-dark options-button"
						onclick={onoptions}
					>
						<Options variant="fill" size={20} color="hsl(var(--white33))" />
					</button>
				{:else}
					<a href="/" class="bottom-bar-logo-link" aria-label="Zapstore home">
						<svg width="19" height="32" viewBox="0 0 19 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-6 lg:h-7 w-auto flex-shrink-0">
							<defs>
								<linearGradient id="bottombar-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
									<stop offset="0%" style="stop-color: hsl(252, 100%, 72%);" />
									<stop offset="100%" style="stop-color: hsl(241, 100%, 68%);" />
								</linearGradient>
							</defs>
							<path d="M18.8379 13.9711L8.84956 0.356086C8.30464 -0.386684 7.10438 0.128479 7.30103 1.02073L9.04686 8.94232C9.16268 9.46783 8.74887 9.96266 8.19641 9.9593L0.871032 9.91477C0.194934 9.91066 -0.223975 10.6293 0.126748 11.1916L7.69743 23.3297C7.99957 23.8141 7.73264 24.4447 7.16744 24.5816L5.40958 25.0076C4.70199 25.179 4.51727 26.0734 5.10186 26.4974L12.4572 31.8326C12.9554 32.194 13.6711 31.9411 13.8147 31.3529L15.8505 23.0152C16.0137 22.3465 15.3281 21.7801 14.6762 22.0452L13.0661 22.7001C12.5619 22.9052 11.991 22.6092 11.8849 22.0877L10.7521 16.5224C10.6486 16.014 11.038 15.5365 11.5704 15.5188L18.1639 15.2998C18.8529 15.2769 19.2383 14.517 18.8379 13.9711Z" fill="url(#bottombar-logo-gradient)" />
						</svg>
						<span class="font-semibold text-lg lg:text-xl tracking-tight">Zapstore</span>
					</a>
					<button type="button" onclick={() => onGetStarted?.()} class="btn-primary-small h-10 px-4">
						<span class="sm:hidden">Start</span>
						<span class="hidden sm:inline">Get Started</span>
					</button>
				{/if}
			</div>
		</div>
	{/if}
</div>

<ZapSliderModal
	bind:isOpen={zapModalOpen}
	target={zapTarget}
	{publisherName}
	{otherZaps}
	{searchProfiles}
	{searchEmojis}
	onclose={handleZapClose}
	onzapReceived={handleZapReceived}
/>

<style>
	.bottom-bar-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 40;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.bottom-bar {
		flex-shrink: 0;
		align-self: center;
		width: 100%;
		max-width: 100%;
		margin: 0;
		background: hsl(var(--gray66));
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid hsl(var(--white8));
		border-bottom: none;
		box-shadow: 0 -4px 24px hsl(var(--black));
		padding: 16px 6px 16px 16px;
		pointer-events: auto;
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		max-height: 88px;
		overflow: hidden;
		transition:
			transform 0.25s cubic-bezier(0.33, 1, 0.68, 1),
			opacity 0.2s ease,
			max-height 0.3s cubic-bezier(0.33, 1, 0.68, 1);
	}
	.bottom-bar.guest {
		padding: 18px 16px 18px 20px;
		min-height: 56px;
		box-shadow: 0 -6px 28px hsl(var(--black) / 0.5);
	}

	/* Morph: expand to show comment form */
	.bottom-bar.expanded {
		max-height: 70vh;
		padding: 12px 16px 16px;
	}
	@media (max-width: 767px) {
		.bottom-bar.expanded {
			padding: 16px;
		}
	}

	/* Slide out when zap modal is open */
	.modal-open .bottom-bar {
		transform: translateY(100%);
		opacity: 0;
		pointer-events: none;
	}

	.bottom-bar-content {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.bottom-bar-content:has(.bottom-bar-logo-link) {
		justify-content: space-between;
		width: 100%;
	}
	.bottom-bar-logo-link {
		display: flex;
		align-items: center;
		gap: 8px;
		text-decoration: none;
		color: inherit;
		flex-shrink: 0;
	}
	@media (min-width: 640px) {
		.bottom-bar-logo-link {
			gap: 12px;
		}
	}
	.bottom-bar-logo-link:hover {
		color: inherit;
	}
	.bottom-bar-comment-only {
		align-self: center;
		width: 100%;
		max-width: 100%;
		background: hsl(var(--gray66));
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid hsl(var(--white8));
		border-bottom: none;
		box-shadow: 0 -4px 24px hsl(var(--black));
		padding: 12px 16px 16px;
		pointer-events: auto;
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		max-height: 70vh;
	}
	@media (max-width: 767px) {
		.bottom-bar-comment-only {
			padding: 16px;
		}
	}
	@media (min-width: 768px) {
		.bottom-bar-comment-only {
			max-width: 560px;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid hsl(var(--white8));
			box-shadow: 0 40px 64px 12px hsl(var(--black));
		}
	}

	.bottom-bar-comment {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1;
	}

	.comment-input-wrap {
		background: hsl(var(--black33));
		border-radius: var(--radius-16);
		border: 0.33px solid hsl(var(--white33));
		min-height: 0;
		flex: 1;
	}

	.zap-button {
		gap: 8px;
		padding: 0 20px 0 14px;
		flex-shrink: 0;
	}

	.options-button {
		width: 42px;
		padding: 0;
		flex-shrink: 0;
		background: transparent !important;
		border: none !important;
		margin-left: -12px;
	}

	.options-button :global(svg) {
		width: 24px;
		height: 24px;
	}

	@media (max-width: 767px) {
		.options-button {
			width: 38px;
		}
	}

	@media (min-width: 768px) {
		.bottom-bar {
			max-width: 560px;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid hsl(var(--white8));
			padding: 12px 2px 12px 12px;
			box-shadow: 0 40px 64px 12px hsl(var(--black));
		}
		.bottom-bar.guest {
			padding: 18px 16px 18px 20px;
			min-height: 64px;
			box-shadow: 0 48px 72px 16px hsl(var(--black) / 0.5);
		}
		.bottom-bar.expanded {
			padding: 12px;
		}
	}
</style>
