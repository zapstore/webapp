<script>
	import { onMount } from 'svelte';
	import LandingSectionTitle from './LandingSectionTitle.svelte';
	import { ChevronRight } from '$lib/components/icons';

	// Store icons with image paths
	const stores = [
		{ name: 'Zapstore', icon: '/images/logo.svg', hasIcon: true, isZapstore: true },
		{ name: 'App Store', icon: '/images/appstore.svg', hasIcon: true },
		{ name: 'Play Store', icon: '/images/playstore.svg', hasIcon: true },
		{ name: 'Obtainium', icon: '/images/obtainium.svg', hasIcon: true }
	];

	// Criteria with values for each store (order: Decentralized, Developer signatures, Zaps, No Review Process, User Communities, Any App)
	// true = checkmark, false = cross, string = text
	const criteria = [
		{ name: 'Decentralized', values: [true, false, false, false] },
		{ name: 'Developer signatures', values: [true, false, false, false] },
		{ name: 'Zaps', values: [true, false, false, false] },
		{ name: 'No Review Process', values: [true, false, false, true] },
		{ name: 'User Communities', values: [true, false, false, false] },
		{ name: 'Any App', values: [true, false, false, true] }
	];

	/** @type {HTMLButtonElement | undefined} */
	let readMoreButton;
	let readMoreDropdownOpen = false;
	/** @type {HTMLDivElement | undefined} */
	let readMoreMobileWrap;

	/** @param {MouseEvent} event */
	function handleReadMoreMouseMove(event) {
		if (!readMoreButton) return;
		const rect = readMoreButton.getBoundingClientRect();
		readMoreButton.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
		readMoreButton.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
	}

	function handleReadMore() {
		readMoreDropdownOpen = !readMoreDropdownOpen;
	}

	/** @param {MouseEvent} event */
	function handleReadMoreClickOutside(event) {
		const target = /** @type {Node | null} */ (event.target);
		if (readMoreMobileWrap && target && !readMoreMobileWrap.contains(target)) {
			readMoreDropdownOpen = false;
		}
	}

	onMount(() => {
		document.addEventListener('click', handleReadMoreClickOutside);
		return () => document.removeEventListener('click', handleReadMoreClickOutside);
	});
</script>

<section class="difference-section border-t border-border/50 pt-8 sm:pt-12 lg:pt-16 pb-0 relative difference-section-root">
	<LandingSectionTitle
		title="What's the difference?"
		description="Let's compare Zapstore to some common alternatives."
		showSeeMore={true}
		seeMoreText="Read More"
		seeMoreDropdownText="More coming soon!"
		seeMoreAction={handleReadMore}
		showButtonsOnMobile={false}
	/>

	<!-- Comparison Table -->
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 comparison-table-container">
		<div class="comparison-table-wrapper overflow-x-auto relative">
			<!-- Mobile: Bottom gradient overlay on table -->
			<div class="md:hidden table-overlay-gradient"></div>

			<table class="comparison-table">
				<colgroup>
					<col class="col-criteria" />
					<col class="col-store" />
					<col class="col-store" />
					<col class="col-store" />
					<col class="col-store" />
				</colgroup>
				<thead>
					<tr>
						<th class="criteria-header"></th>
						{#each stores as store, i}
							<th class="store-header">
								<div class="store-header-content">
									<div class="store-icon-wrapper" class:zapstore-icon={store.isZapstore}>
										{#if store.hasIcon}
											<img src={store.icon} alt={store.name} class="store-icon" />
										{/if}
									</div>
									<span class="store-name" class:highlight={i === 0}>{store.name}</span>
								</div>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each criteria as criterion, rowIndex}
						<tr class:last-row={rowIndex === criteria.length - 1}>
							<td class="criteria-cell">{criterion.name}</td>
							{#each criterion.values as value}
								<td class="value-cell">
									{#if value === true}
										<svg
											class="check-icon"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="3"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<polyline points="20 6 9 17 4 12"></polyline>
										</svg>
									{:else if value === false}
										<svg
											class="cross-icon"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<line x1="18" y1="6" x2="6" y2="18"></line>
											<line x1="6" y1="6" x2="18" y2="18"></line>
										</svg>
									{:else}
										<span class="value-text">{value}</span>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Mobile only: Read More overlayed at bottom center of section -->
	<div
		class="md:hidden absolute inset-x-0 bottom-0 z-40 read-more-mobile-wrap"
		bind:this={readMoreMobileWrap}
	>
		<button
			type="button"
			bind:this={readMoreButton}
			on:click={handleReadMore}
			on:mousemove={handleReadMoreMouseMove}
			class="btn-glass-large btn-glass-with-chevron flex items-center group"
		>
			Read More
			<ChevronRight
				variant="outline"
				color="hsl(var(--white33))"
				size={18}
				className="transition-transform group-hover:translate-x-0.5"
			/>
		</button>
		{#if readMoreDropdownOpen}
			<div class="read-more-mobile-panel" role="dialog" aria-label="More info">
				<p class="read-more-mobile-panel-text">More coming soon!</p>
			</div>
		{/if}
	</div>
</section>

<style>
	.comparison-table-wrapper {
		margin-top: 1.5rem;
	}

	.table-overlay-gradient {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 120px;
		background: linear-gradient(
			to top,
			hsl(var(--background)) 0%,
			hsl(var(--background) / 0.95) 25%,
			hsl(var(--background) / 0.7) 50%,
			hsl(var(--background) / 0.3) 75%,
			transparent 100%
		);
		pointer-events: none;
		z-index: 10;
	}

	.comparison-table {
		background-color: hsl(var(--gray33));
		border-radius: var(--radius-24) var(--radius-24) 0 0;
		overflow: hidden;
		border-collapse: collapse;
		width: 100%;
		table-layout: fixed;
	}

	/* Column widths */
	.col-criteria {
		width: 160px;
	}

	.col-store {
		width: auto;
	}

	/* Header row */
	thead tr {
		border-bottom: 1.4px solid hsl(var(--white11));
	}

	.criteria-header {
		padding: 1rem 1.25rem;
		border-right: 1.4px solid hsl(var(--white11));
	}

	.store-header {
		padding: 1rem 0.5rem;
		text-align: center;
		border-right: 1.4px solid hsl(var(--white11));
		vertical-align: middle;
	}

	.store-header:last-child {
		border-right: none;
	}

	.store-header-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.store-icon-wrapper {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		background-color: hsl(var(--white8));
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.store-icon {
		width: 24px;
		height: 24px;
		opacity: 0.33;
		filter: brightness(0) invert(1);
	}

	.store-icon-wrapper.zapstore-icon {
		background: linear-gradient(
			135deg,
			hsl(var(--blurpleColor) / 0.28) 0%,
			hsl(var(--blurpleColor) / 0.12) 100%
		);
	}

	.store-icon-wrapper.zapstore-icon .store-icon {
		width: 16px;
		height: 24px;
		filter: brightness(0) invert(1);
		opacity: 1;
	}

	.store-name {
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--white66));
		white-space: nowrap;
	}

	.store-name.highlight {
		color: hsl(var(--foreground));
		font-weight: 700;
	}

	@media (min-width: 768px) {
		.store-name {
			font-size: 0.875rem;
		}
	}

	@media (min-width: 1024px) {
		.store-name {
			font-size: 1rem;
		}
	}

	/* Data rows */
	tbody tr {
		border-bottom: 1.4px solid hsl(var(--white11));
	}

	tbody tr.last-row {
		border-bottom: none;
	}

	.criteria-cell {
		padding: 0.875rem 1.25rem;
		text-align: left;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--white66));
		white-space: nowrap;
		border-right: 1.4px solid hsl(var(--white11));
	}

	.value-cell {
		padding: 0.875rem 0.5rem;
		text-align: center;
		border-right: 1.4px solid hsl(var(--white11));
		vertical-align: middle;
	}

	.value-cell:last-child {
		border-right: none;
	}

	.check-icon {
		width: 18px;
		height: 18px;
		color: hsl(var(--blurpleColor));
		display: inline-block;
	}

	.cross-icon {
		width: 14px;
		height: 14px;
		color: hsl(var(--white33));
		display: inline-block;
	}

	.value-text {
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--white66));
	}

	@media (min-width: 1024px) {
		.col-criteria {
			width: 200px;
		}

		.criteria-header {
			padding: 1rem 1.5rem;
		}

		.criteria-cell {
			padding: 0.875rem 1.5rem;
		}

		.check-icon {
			width: 20px;
			height: 20px;
		}

		.cross-icon {
			width: 16px;
			height: 16px;
		}

		.store-icon-wrapper {
			width: 48px;
			height: 48px;
			border-radius: 14px;
		}

		.store-icon {
			width: 26px;
			height: 26px;
		}

		.store-icon-wrapper.zapstore-icon .store-icon {
			width: 18px;
			height: 26px;
		}
	}

	.difference-section-root {
		padding-bottom: 0 !important;
	}

	.comparison-table-container {
		padding-bottom: 0 !important;
	}

	.comparison-table-wrapper {
		padding-bottom: 0 !important;
		margin-bottom: 0 !important;
	}

	.read-more-mobile-wrap {
		display: flex;
		justify-content: center;
		align-items: flex-end;
		padding-bottom: 32px;
		pointer-events: none;
	}
	.read-more-mobile-wrap > button {
		pointer-events: auto;
	}
	@media (min-width: 768px) {
		.read-more-mobile-wrap {
			display: none !important;
		}
	}

	.read-more-mobile-panel {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		min-width: 200px;
		max-width: 280px;
		padding: 12px 14px;
		background: hsl(241 15% 18%);
		border: 1px solid hsl(var(--white16));
		border-radius: 12px;
		box-shadow: 0 8px 24px hsl(var(--black66) / 0.4);
	}

	.read-more-mobile-panel-text {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.45;
		color: hsl(var(--white66));
	}

	@media (max-width: 640px) {
		.col-criteria {
			width: 110px;
		}

		.store-header {
			padding: 0.75rem 0.25rem;
		}

		.store-icon-wrapper {
			width: 32px;
			height: 32px;
			border-radius: 10px;
		}

		.store-icon {
			width: 18px;
			height: 18px;
		}

		.store-icon-wrapper.zapstore-icon .store-icon {
			width: 12px;
			height: 18px;
		}

		.store-name {
			font-size: 0.5625rem;
		}

		.criteria-cell {
			padding: 0.625rem 0.75rem;
			font-size: 0.6875rem;
		}

		.value-cell {
			padding: 0.625rem 0.25rem;
		}

		.check-icon {
			width: 14px;
			height: 14px;
		}

		.cross-icon {
			width: 12px;
			height: 12px;
		}
	}
</style>
