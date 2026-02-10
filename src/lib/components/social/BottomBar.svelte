<script lang="ts">
	/**
	 * BottomBar - Fixed bottom action bar for detail pages.
	 * Morphs in place into the comment form when Comment is tapped (no separate modal).
	 * Slides out only when ZapSliderModal is open.
	 */
	import { Zap, Reply, Options } from '$lib/components/icons';
	import InputButton from '$lib/components/common/InputButton.svelte';
	import ShortTextInput from '$lib/components/common/ShortTextInput.svelte';
	import ZapSliderModal from '$lib/components/modals/ZapSliderModal.svelte';

	type ProfileHit = { pubkey: string; name?: string; displayName?: string; picture?: string };
	type EmojiHit = { shortcode: string; url: string; source: string };

	interface ZapTarget {
		name?: string;
		pubkey?: string;
		dTag?: string;
		id?: string;
		pictureUrl?: string;
	}

	interface OtherZap {
		amount: number;
		profile?: { pictureUrl?: string; name?: string; pubkey?: string };
	}

	interface Props {
		appName?: string;
		publisherName?: string;
		contentType?: 'app' | 'stack';
		className?: string;
		zapTarget?: ZapTarget | null;
		otherZaps?: OtherZap[];
		/** When false, Comment slot shows "Get started to comment" and calls onGetStarted instead of opening comment form. */
		isSignedIn?: boolean;
		/** Called when guest taps "Get started to comment" (opens onboarding). */
		onGetStarted?: () => void;
		searchProfiles?: (query: string) => Promise<ProfileHit[]>;
		searchEmojis?: (query: string) => Promise<EmojiHit[]>;
		oncommentSubmit?: (event: {
			text: string;
			emojiTags: { shortcode: string; url: string }[];
			mentions: string[];
			target: ZapTarget | null;
		}) => void;
		onzapReceived?: (event: { zapReceipt: unknown }) => void;
		onoptions?: () => void;
	}

	let {
		appName = '',
		publisherName = '',
		contentType = 'app',
		className = '',
		zapTarget = null,
		otherZaps = [],
		isSignedIn = true,
		onGetStarted,
		searchProfiles = async () => [],
		searchEmojis = async () => [],
		oncommentSubmit,
		onzapReceived,
		onoptions
	}: Props = $props();

	let zapModalOpen = $state(false);
	let commentExpanded = $state(false);
	let commentInput = $state<{ clear?: () => void; focus?: () => void } | null>(null);
	let submitting = $state(false);

	/** Bar slides out only when zap modal is open (comment morphs in place) */
	const barSlidesOut = $derived(zapModalOpen);

	function handleZap() {
		zapModalOpen = true;
	}

	function handleZapClose(event: { success: boolean }) {
		zapModalOpen = false;
		if (event.success) {
			onzapReceived?.({ zapReceipt: {} });
		}
	}

	function handleZapReceived(event: { zapReceipt: unknown }) {
		onzapReceived?.(event);
	}

	function handleComment() {
		commentExpanded = true;
	}

	function closeComment() {
		commentExpanded = false;
	}

	async function handleCommentSubmit(event: {
		text: string;
		emojiTags: { shortcode: string; url: string }[];
		mentions: string[];
	}) {
		if (submitting || !event.text.trim()) return;
		submitting = true;
		try {
			oncommentSubmit?.({ ...event, target: zapTarget });
			commentInput?.clear?.();
			closeComment();
		} catch (err) {
			console.error('Failed to submit comment:', err);
		} finally {
			submitting = false;
		}
	}

	function handleCommentKeydown(e: KeyboardEvent) {
		if (!commentExpanded) return;
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
	<div class="bottom-bar" class:expanded={commentExpanded}>
		{#if !commentExpanded}
			<div class="bottom-bar-content">
				<button type="button" class="btn-primary-large zap-button" onclick={handleZap}>
					<Zap variant="fill" size={18} color="hsl(var(--whiteEnforced))" />
					<span>Zap</span>
				</button>

				{#if isSignedIn}
					<InputButton className="comment-btn" placeholder="Comment" onclick={handleComment}>
						{#snippet icon()}
							<Reply variant="outline" size={18} strokeWidth={1.4} color="hsl(var(--white33))" />
						{/snippet}
					</InputButton>
				{:else}
					<button
						type="button"
						class="get-started-comment-btn"
						onclick={() => onGetStarted?.()}
					>
						<span class="get-started-text">Get started with Zapstore to comment</span>
					</button>
				{/if}

				<button
					type="button"
					class="btn-secondary-large btn-secondary-dark options-button"
					onclick={onoptions}
				>
					<Options variant="fill" size={20} color="hsl(var(--white33))" />
				</button>
			</div>
		{:else}
			<div class="bottom-bar-comment">
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
		{/if}
	</div>
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

	/* Same look as Comment InputButton: border, bg, height, radius */
	.get-started-comment-btn {
		display: flex;
		align-items: center;
		flex: 1;
		min-width: 0;
		height: 42px;
		padding: 0 16px;
		background-color: hsl(var(--black33));
		border-radius: 16px;
		border: 0.33px solid hsl(var(--white33));
		cursor: pointer;
		justify-content: flex-start;
	}
	.get-started-comment-btn .get-started-text {
		color: hsl(var(--white33));
		font-size: 16px;
		font-weight: 500;
	}
	@media (max-width: 767px) {
		.get-started-comment-btn {
			height: 38px;
		}
		.get-started-comment-btn .get-started-text {
			font-size: 14px;
		}
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

		.zap-button span {
			font-size: 14px;
		}

		.comment-btn :global(svg) {
			width: 16px;
			height: 16px;
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

		.bottom-bar.expanded {
			padding: 12px;
		}
	}
</style>
