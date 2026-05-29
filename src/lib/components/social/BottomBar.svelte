<script lang="js">
/**
 * BottomBar - Fixed bottom action bar for detail pages.
 * Comment opens CommentModal; bar slides out when modals are open.
 */
import { Zap, Reply, Options } from '$lib/components/icons';
import InputButton from '$lib/components/common/InputButton.svelte';
import ZapSliderModal from '$lib/components/modals/ZapSliderModal.svelte';
import ActionsModal from '$lib/components/modals/ActionsModal.svelte';
import CommentModal from '$lib/components/modals/CommentModal.svelte';
import { registerCommentCompose } from '$lib/keyboard/shortcuts.js';

let {
	appName = '',
	publisherName = '',
	contentType = 'app',
	className = '',
	zapTarget = null,
	otherZaps = [],
	isSignedIn = true,
	onGetStarted,
	getCurrentPubkey = () => null,
	searchProfiles = async () => [],
	searchEmojis = async () => [],
	signEvent = null,
	oncommentSubmit,
	onzapReceived,
	onZapPending,
	onZapPendingClear,
	onoptions,
	onLabelPublished = () => {},
	onOwnContentDeleted = () => {},
	version = '',
	rootContext = null
} = $props();

let zapModalOpen = $state(false);
let actionsModalOpen = $state(false);
let commentModalOpen = $state(false);

/** Bar slides out when zap, actions, or comment modal is open */
const barSlidesOut = $derived(zapModalOpen || actionsModalOpen || commentModalOpen);

function handleZap() {
	zapModalOpen = true;
}

function handleZapClose(event) {
	zapModalOpen = false;
	if (event?.success) {
		onzapReceived?.({ zapReceipt: {} });
	}
}

function handleZapReceived(event) {
	onzapReceived?.(event);
}

function openCommentModal() {
	commentModalOpen = true;
}

function handleCommentSubmit(event) {
	oncommentSubmit?.({ ...event, target: zapTarget });
}

$effect(() => {
	if (!isSignedIn || commentModalOpen) return;
	return registerCommentCompose(() => openCommentModal(), { priority: 5 });
});

const bottomBarRecipientLabel = $derived.by(() => {
	const raw = publisherName?.trim() || zapTarget?.name?.trim?.() || appName?.trim?.();
	return raw || 'Creator';
});
</script>

<div
	class="bottom-bar-wrapper {className}"
	class:modal-open={barSlidesOut}
	class:guest-wrapper={!isSignedIn}
>
	<div class="bottom-bar" class:guest={!isSignedIn}>
		<div class="bottom-bar-content">
			{#if isSignedIn}
				<button type="button" class="btn-primary-large zap-button" onclick={handleZap}>
					<Zap variant="fill" size={18} color="var(--whiteEnforced)" />
					<span>Zap</span>
				</button>
				<InputButton className="comment-btn" placeholder="Comment" onclick={openCommentModal}>
					{#snippet icon()}
						<Reply variant="outline" size={18} strokeWidth={1.4} color="var(--white33)" />
					{/snippet}
				</InputButton>
				<button
					type="button"
					class="btn-secondary-large btn-secondary-dark options-button"
					onclick={() => {
						actionsModalOpen = true;
						onoptions?.();
					}}
				>
					<Options variant="fill" size={20} color="var(--white33)" />
				</button>
			{:else}
				<button
					type="button"
					onclick={() => onGetStarted?.()}
					class="btn-primary-small h-10 px-4 flex-shrink-0"
				>
					<span>Sign in</span>
				</button>
				<span class="guest-tagline">Join the conversation</span>
			{/if}
		</div>
	</div>
</div>

<ZapSliderModal
	bind:isOpen={zapModalOpen}
	target={zapTarget}
	{publisherName}
	{contentType}
	{otherZaps}
	{searchProfiles}
	{searchEmojis}
	onclose={handleZapClose}
	onzapReceived={handleZapReceived}
	{onZapPending}
	{onZapPendingClear}
/>

<CommentModal
	bind:isOpen={commentModalOpen}
	target={zapTarget}
	recipientName={bottomBarRecipientLabel}
	{contentType}
	{rootContext}
	{version}
	{otherZaps}
	{getCurrentPubkey}
	{searchProfiles}
	{searchEmojis}
	{signEvent}
	onsubmit={handleCommentSubmit}
	onzapReceived={handleZapReceived}
	{onZapPending}
	{onZapPendingClear}
/>

<ActionsModal
	bind:open={actionsModalOpen}
	{contentType}
	targetApp={zapTarget}
	{rootContext}
	{version}
	authorName={publisherName}
	authorPubkey={zapTarget?.pubkey ?? null}
	contentPreview={zapTarget?.description?.trim?.() || zapTarget?.name?.trim?.() || appName?.trim?.() || ''}
	recipientName={publisherName}
	{otherZaps}
	{getCurrentPubkey}
	{signEvent}
	onCommentSubmit={handleCommentSubmit}
	onZapReceived={handleZapReceived}
	{onZapPending}
	{onZapPendingClear}
	onLabelPublished={() => {
		onLabelPublished?.();
	}}
	onOwnContentDeleted={() => {
		onOwnContentDeleted?.();
	}}
	{searchProfiles}
	{searchEmojis}
/>

<style>
	.bottom-bar-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		width: 100%;
		z-index: 40;
		display: flex;
		justify-content: center;
		pointer-events: none;
		flex-shrink: 0;
	}

	.bottom-bar {
		flex-shrink: 0;
		align-self: center;
		width: 100%;
		max-width: 100%;
		margin: 0;
		background: var(--gray66);
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid var(--white8);
		border-bottom: none;
		box-shadow: 0 -4px 24px var(--black);
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
		box-shadow: 0 -6px 28px color-mix(in srgb, var(--black) 50%, transparent);
	}

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

	.bottom-bar-content:has(.guest-tagline) {
		justify-content: flex-start;
		width: 100%;
		gap: 16px;
	}

	.guest-tagline {
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--white66);
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
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
		.bottom-bar-wrapper.guest-wrapper {
			display: none;
		}

		.bottom-bar {
			max-width: 560px;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid var(--white8);
			padding: 12px 2px 12px 12px;
			box-shadow: 0 40px 64px 12px var(--black);
		}

		.bottom-bar.guest {
			padding: 18px 16px 18px 20px;
			min-height: 64px;
			box-shadow: 0 48px 72px 16px color-mix(in srgb, var(--black) 50%, transparent);
		}
	}
</style>
