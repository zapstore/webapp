<script>
	import { ChevronLeft } from '$lib/components/icons';
	let { onBack = () => {} } = $props();
</script>

<button type="button" class="back-button" aria-label="Back" onclick={onBack}>
	<span class="back-button-icon">
		<ChevronLeft variant="outline" size={14} strokeWidth={1.4} color="var(--white33)" />
	</span>
</button>

<style>
	.back-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		min-width: 28px;
		min-height: 28px;
		background: var(--gray33);
		border: none;
		border-radius: 50%;
		cursor: pointer;
		transition: background-color 0.15s ease, transform 0.1s ease;
	}

	.back-button:hover {
		background: var(--white8);
	}

	.back-button:active {
		transform: scale(0.94);
	}

	.back-button-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		margin-right: 2px;
	}

	.back-button-icon :global(svg) {
		pointer-events: none;
	}
</style>
