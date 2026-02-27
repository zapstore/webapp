<script lang="js">
	/**
	 * InputLabel - Tag/label-shaped text input
	 *
	 * Shape: rounded rectangle on left + smooth pointed shape on right
	 * Styling: black33 background with white33 outline (like InputTextField.svelte)
	 * Height matches report button (42px desktop, 38px mobile)
	 * Shows divider + chevron when empty, Add button when text is entered.
	 */
	import { ChevronDown } from '$lib/components/icons';

	let {
		value = $bindable(''),
		placeholder = 'Your label',
		onAdd = () => {},
		onOptions = () => {}
	} = $props();

	const hasText = $derived(value.trim().length > 0);
</script>

<div class="input-label-container">
	<!-- SVG defines the tag shape with stroke on the outer edge -->
	<svg class="input-label-shape" viewBox="0 0 500 42" preserveAspectRatio="none" aria-hidden="true">
		<path
			d="M16 0.5
			   L460 0.5
			   Q468 0.5 474 4
			   Q482 9 488 16
			   Q491 19.5 491 21
			   Q491 22.5 488 26
			   Q482 33 474 38
			   Q468 41.5 460 41.5
			   L16 41.5
			   A15.5 15.5 0 0 1 0.5 26
			   L0.5 16
			   A15.5 15.5 0 0 1 16 0.5
			   Z"
			fill="hsl(var(--black33))"
			stroke="hsl(var(--white33))"
			stroke-width="0.5"
			vector-effect="non-scaling-stroke"
		/>
	</svg>

	<input type="text" class="input-label-input" bind:value {placeholder} />

	{#if hasText}
		<button type="button" class="add-button" onclick={onAdd}> Add </button>
	{:else}
		<div class="divider"></div>
		<button type="button" class="chevron-button" onclick={onOptions}>
			<ChevronDown variant="outline" size={16} color="hsl(var(--white33))" />
		</button>
	{/if}
</div>

<style>
	.input-label-container {
		position: relative;
		display: flex;
		align-items: center;
		width: 100%;
		height: 42px;
	}

	@media (max-width: 767px) {
		.input-label-container {
			height: 38px;
		}
	}

	.input-label-shape {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.input-label-input {
		position: relative;
		flex: 1;
		height: 100%;
		padding: 0 0 0 16px;
		background: transparent;
		border: none;
		outline: none;
		color: hsl(var(--white));
		font-family: 'Inter', sans-serif;
		font-size: 16px;
		font-weight: 500;
		line-height: 42px;
		min-width: 0;
	}

	@media (max-width: 767px) {
		.input-label-input {
			line-height: 38px;
		}
	}

	.input-label-input::placeholder {
		color: hsl(var(--white33));
	}

	.add-button {
		position: relative;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 26px;
		padding: 0 16px;
		margin-right: 32px;
		font-size: 14px;
		font-weight: 500;
		color: hsl(var(--primary-foreground));
		background: var(--gradient-blurple);
		border: none;
		border-radius: 9999px;
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	.add-button:hover {
		transform: scale(1.04);
	}

	.add-button:active {
		transform: scale(0.96);
	}

	@media (max-width: 767px) {
		.add-button {
			height: 24px;
			padding: 0 14px;
			font-size: 13px;
			margin-right: 26px;
		}
	}

	.divider {
		width: 1.4px;
		height: 100%;
		margin-left: 8px;
		background-color: hsl(var(--white8));
		flex-shrink: 0;
	}

	.chevron-button {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		padding-left: 12px;
		padding-top: 2px;
		width: 50px;
		height: 100%;
		margin-right: 8px;
		background: transparent;
		border: none;
		cursor: pointer;
		flex-shrink: 0;
		transition: opacity 0.15s ease;
	}

	.chevron-button:hover {
		opacity: 0.7;
	}

	@media (max-width: 767px) {
		.chevron-button {
			width: 46px;
			padding-left: 10px;
			margin-right: 6px;
		}
	}
</style>
