<script>
	import { onMount } from 'svelte';
	import { ChevronRight } from '$lib/components/icons';

	export let title = '';
	export let description = '';

	// Glass button (secondary)
	export let showSeeMore = false;
	export let seeMoreText = 'See More';
	export let seeMoreAction = () => {};
	/** When set, clicking See More toggles a dropdown with this text instead of calling seeMoreAction */
	export let seeMoreDropdownText = '';

	// Primary CTA button (blurple)
	export let showPrimaryCta = false;
	export let primaryCtaText = '';
	export let primaryCtaAction = () => {};

	// Show buttons on mobile (default: hide on mobile)
	export let showButtonsOnMobile = false;

	/** @type {HTMLButtonElement | undefined} */
	let seeMoreButton;
	/** @type {HTMLButtonElement | undefined} */
	let primaryCtaButton;
	let seeMoreDropdownOpen = false;
	/** @type {HTMLDivElement | undefined} */
	let seeMoreWrap;

	function handleSeeMoreClick() {
		if (seeMoreDropdownText) {
			seeMoreDropdownOpen = !seeMoreDropdownOpen;
		} else {
			seeMoreAction();
		}
	}

	/** @param {MouseEvent} event */
	function handleSeeMoreMouseMove(event) {
		if (!seeMoreButton) return;
		const rect = seeMoreButton.getBoundingClientRect();
		seeMoreButton.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
		seeMoreButton.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
	}

	/** @param {MouseEvent} event */
	function handlePrimaryCtaMouseMove(event) {
		if (!primaryCtaButton) return;
		const rect = primaryCtaButton.getBoundingClientRect();
		primaryCtaButton.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
		primaryCtaButton.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
	}

	/** @param {MouseEvent} event */
	function handleClickOutside(event) {
		const target = /** @type {Node | null} */ (event.target);
		if (seeMoreWrap && target && !seeMoreWrap.contains(target)) {
			seeMoreDropdownOpen = false;
		}
	}

	onMount(() => {
		if (seeMoreDropdownText) {
			document.addEventListener('click', handleClickOutside);
			return () => document.removeEventListener('click', handleClickOutside);
		}
	});
</script>

<div class="container mx-auto px-6 sm:px-6 lg:px-8 {description ? 'mb-8' : 'mb-4'}">
	<!-- Title row with button -->
	<div class="flex items-center justify-between gap-4 mb-3">
		<h2
			class="section-title text-display-lg text-3xl sm:text-4xl lg:text-4xl xl:text-5xl leading-tight section-title-gradient flex-1 min-w-0"
		>
			{title}
		</h2>

		<!-- Buttons - conditionally shown on mobile -->
		<div class="{showButtonsOnMobile ? 'flex' : 'hidden md:flex'} items-center gap-3 flex-shrink-0">
			{#if showSeeMore}
				<div class="see-more-dropdown-wrap" bind:this={seeMoreWrap}>
					<button
						type="button"
						bind:this={seeMoreButton}
						on:click={handleSeeMoreClick}
						on:mousemove={handleSeeMoreMouseMove}
						class="btn-glass-large btn-glass-with-chevron flex items-center group"
					>
						{seeMoreText}
						<ChevronRight
							variant="outline"
							color="hsl(var(--white33))"
							size={18}
							className="transition-transform group-hover:translate-x-0.5"
						/>
					</button>
					{#if seeMoreDropdownText && seeMoreDropdownOpen}
						<div class="see-more-dropdown-panel" role="dialog" aria-label="More info">
							<p class="see-more-dropdown-text">{seeMoreDropdownText}</p>
						</div>
					{/if}
				</div>
			{/if}
			{#if showPrimaryCta}
				<button
					type="button"
					bind:this={primaryCtaButton}
					on:click={primaryCtaAction}
					on:mousemove={handlePrimaryCtaMouseMove}
					class="btn-primary-large"
				>
					{primaryCtaText}
				</button>
			{/if}
		</div>
	</div>

	<!-- Description row - full width -->
	{#if description}
		<p class="section-description">
			{description}
		</p>
	{/if}
</div>

<style>
	.see-more-dropdown-wrap {
		position: relative;
		flex-shrink: 0;
		z-index: 1;
	}

	.see-more-dropdown-panel {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		min-width: 200px;
		max-width: 320px;
		padding: 12px 14px;
		background: hsl(241 15% 18%);
		border: 1px solid hsl(var(--white16));
		border-radius: 12px;
		box-shadow: 0 8px 24px hsl(var(--black66) / 0.4);
	}

	.see-more-dropdown-text {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.45;
		color: hsl(var(--white66));
	}
</style>
