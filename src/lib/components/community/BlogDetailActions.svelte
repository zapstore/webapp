<script lang="js">
	import { Options } from '$lib/components/icons';
	import ActionsModal from '$lib/components/modals/ActionsModal.svelte';

	let { shareUrl = '', title = '' } = $props();

	let actionsModalOpen = $state(false);
</script>

<button
	type="button"
	class="detail-content-actions-btn"
	onclick={() => {
		actionsModalOpen = true;
	}}
	aria-label="Actions"
>
	<Options variant="fill" size={16} color="var(--white33)" />
</button>

<ActionsModal
	bind:open={actionsModalOpen}
	contentType="blog"
	sharePageUrl={shareUrl}
	shareOnly={true}
	appName={title}
	contentPreview={title}
/>

<style>
	.detail-content-actions-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		flex-shrink: 0;
		background: color-mix(in srgb, var(--gray33) 72%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: none;
		border-radius: 50%;
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	.detail-content-actions-btn:hover {
		transform: scale(1.02);
	}

	.detail-content-actions-btn:active {
		transform: scale(0.98);
	}

	.detail-content-actions-btn :global(svg) {
		display: block;
		width: 4px;
		height: 16px;
		flex-shrink: 0;
	}
</style>
