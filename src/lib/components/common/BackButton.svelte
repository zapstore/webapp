<script>
	/**
	 * BackButton - Round back button. When menuOpen: shows Cross (centered), click closes menu.
	 * Otherwise: ChevronLeft (2px left of center), click = back; right-click opens menu.
	 * When showExplainer is true: hover for 500ms shows "Right-click to open menu".
	 */
	import { ChevronLeft, Cross } from '$lib/components/icons';

	let { onBack = () => {}, onOpenMenu = null, onCloseMenu = null, menuOpen = false, showExplainer = false } = $props();

	let hoverTimer = null;
	let explainerVisible = $state(false);

	function handleClick() {
		if (menuOpen && onCloseMenu) {
			onCloseMenu();
			return;
		}
		onBack();
	}

	function handleContextMenu(e) {
		if (onOpenMenu) {
			e.preventDefault();
			onOpenMenu();
		}
	}

	function handleWrapMouseEnter() {
		if (!showExplainer || menuOpen || !onOpenMenu) return;
		hoverTimer = setTimeout(() => {
			hoverTimer = null;
			explainerVisible = true;
		}, 500);
	}

	function handleWrapMouseLeave() {
		if (hoverTimer) {
			clearTimeout(hoverTimer);
			hoverTimer = null;
		}
		explainerVisible = false;
	}
</script>

<div
	class="back-button-wrap"
	role="group"
	aria-label="Back"
	onmouseenter={handleWrapMouseEnter}
	onmouseleave={handleWrapMouseLeave}
>
	<button
		type="button"
		class="back-button"
		class:menu-open={menuOpen}
		aria-label={menuOpen ? 'Close menu' : 'Back'}
		onclick={handleClick}
		oncontextmenu={handleContextMenu}
	>
		{#if menuOpen && onCloseMenu}
			<span class="back-button-icon back-button-icon-center">
				<Cross variant="outline" size={14} strokeWidth={1.4} color="hsl(var(--white33))" />
			</span>
		{:else}
			<span class="back-button-icon">
				<ChevronLeft variant="outline" size={14} strokeWidth={1.4} color="hsl(var(--white33))" />
			</span>
		{/if}
	</button>
	{#if showExplainer && explainerVisible && !menuOpen}
		<div class="back-button-explainer" role="tooltip">
			Right-click to open menu
		</div>
	{/if}
</div>

<style>
	.back-button-wrap {
		position: relative;
		display: inline-flex;
		overflow: visible;
	}
	.back-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		min-width: 28px;
		min-height: 28px;
		background: hsl(var(--gray33));
		border: none;
		border-radius: 50%;
		cursor: pointer;
		transition: transform 0.15s ease;
	}
	.back-button:active {
		transform: scale(0.96);
	}
	.back-button-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		margin-right: 2px;
	}
	.back-button-icon-center {
		margin-right: 0;
	}
	.back-button-icon :global(svg) {
		pointer-events: none;
	}
	.back-button-explainer {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		min-width: 200px;
		max-width: 260px;
		padding: 10px 12px;
		background: hsl(241 15% 18%);
		border: 1px solid hsl(var(--white16));
		border-radius: 12px;
		box-shadow: 0 8px 24px hsl(var(--black66) / 0.4);
		font-size: 0.8125rem;
		line-height: 1.45;
		color: hsl(var(--white66));
		z-index: 10000;
		pointer-events: none;
	}
</style>
