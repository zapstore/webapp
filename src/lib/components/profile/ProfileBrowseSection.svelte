<script lang="js">
	import { browser } from '$app/environment';
	import '$lib/styles/browse-grid.css';
	import SectionHeader from '$lib/components/cards/SectionHeader.svelte';
	import AppsPageCarousel from '$lib/components/apps/AppsPageCarousel.svelte';
	import AppSmallCard from '$lib/components/cards/AppSmallCard.svelte';
	import AppStackCard from '$lib/components/cards/AppStackCard.svelte';
	import AppSearchHitRowSkeleton from '$lib/components/cards/AppSearchHitRowSkeleton.svelte';
	import { ChevronLeft, ChevronRight } from '$lib/components/icons';

	const MOBILE_GRID_MAX = 2;
	const DESKTOP_GRID_MAX = 4;
	const ITEMS_PER_PANEL = 2;
	const SKELETON_PANELS = 2;

	/** @typedef {{ top: number, left: number, right: number, showLeft: boolean, showRight: boolean }} CarouselUi */

	/** @type {{
	 *   title?: string,
	 *   variant?: 'apps' | 'stacks',
	 *   items?: unknown[],
	 *   loading?: boolean,
	 *   emptyMessage?: string,
	 *   getAppUrl?: (app: import('$lib/nostr/models').App) => string,
	 *   getStackUrl?: (stack: Record<string, unknown>) => string
	 * }} */
	let {
		title = '',
		variant = 'apps',
		items = [],
		loading = false,
		emptyMessage = 'Nothing here yet',
		getAppUrl = () => '#',
		getStackUrl = () => '#'
	} = $props();

	let viewportDesktop = $state(false);
	let carousel = $state(/** @type {{ scroll: (direction: number) => void } | null} */ (null));
	let carouselUi = $state(
		/** @type {CarouselUi} */ ({
			top: 0,
			left: 0,
			right: 0,
			showLeft: false,
			showRight: false
		})
	);

	$effect(() => {
		if (!browser) return;
		const mq = window.matchMedia('(min-width: 768px)');
		const sync = () => {
			viewportDesktop = mq.matches;
		};
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	const gridMax = $derived(viewportDesktop ? DESKTOP_GRID_MAX : MOBILE_GRID_MAX);
	const useCarousel = $derived(!loading && items.length > gridMax);
	const gridTwoCol = $derived(!loading && items.length > 1);

	/** @template T @param {T[]} list @param {number} size @returns {T[][]} */
	function getColumns(list, size) {
		const columns = [];
		for (let i = 0; i < list.length; i += size) {
			columns.push(list.slice(i, i + size));
		}
		return columns;
	}

	const panels = $derived(getColumns(items, ITEMS_PER_PANEL));

	/** @param {CarouselUi} next */
	function handleCarouselUi(next) {
		if (
			carouselUi.showLeft === next.showLeft &&
			carouselUi.showRight === next.showRight &&
			carouselUi.top === next.top &&
			carouselUi.left === next.left &&
			carouselUi.right === next.right
		) {
			return;
		}
		carouselUi = next;
	}
</script>

<section class="profile-browse-section">
	<SectionHeader {title} />

	<div class="profile-apps-browse-outer">
		{#if loading}
			{#if variant === 'apps'}
				<ul class="browse-grid profile-browse-grid" class:browse-grid--two-col={true} role="list" aria-hidden="true">
					{#each Array(MOBILE_GRID_MAX) as _, i (i)}
						<li class="browse-grid-item browse-grid-item--app">
							<AppSearchHitRowSkeleton variant={i} showDescription={true} showChevron={false} />
						</li>
					{/each}
				</ul>
			{:else}
				<AppsPageCarousel
					active={true}
					variant="stacks"
					panels={[]}
					loading={true}
					skeletonPanels={SKELETON_PANELS}
					skeletonItemsPerPanel={ITEMS_PER_PANEL}
				/>
			{/if}
		{:else if items.length === 0}
			<p class="profile-browse-empty">{emptyMessage}</p>
		{:else if useCarousel}
			<AppsPageCarousel
				bind:this={carousel}
				active={true}
				{variant}
				panels={panels}
				loading={false}
				skeletonPanels={SKELETON_PANELS}
				skeletonItemsPerPanel={ITEMS_PER_PANEL}
				getAppHref={getAppUrl}
				getStackHref={getStackUrl}
				onUiChange={handleCarouselUi}
			/>
		{:else}
			<ul class="browse-grid profile-browse-grid" class:browse-grid--two-col={gridTwoCol} role="list">
				{#if variant === 'apps'}
					{#each items as app (/** @type {import('$lib/nostr/models').App} */ (app).id)}
						<li class="browse-grid-item browse-grid-item--app">
							<AppSmallCard {app} href={getAppUrl(/** @type {import('$lib/nostr/models').App} */ (app))} />
						</li>
					{/each}
				{:else}
					{#each items as stack (/** @type {{ pubkey?: string, dTag?: string }} */ (stack).pubkey + ':' + /** @type {{ dTag?: string }} */ (stack).dTag)}
						<li class="browse-grid-item">
							<AppStackCard
								{stack}
								href={getStackUrl(/** @type {Record<string, unknown>} */ (stack))}
							/>
						</li>
					{/each}
				{/if}
			</ul>
		{/if}

		{#if useCarousel && (carouselUi.showLeft || carouselUi.showRight)}
			<div
				class="screenshots-controls"
				style="top: {carouselUi.top}px"
				aria-hidden={!carouselUi.showLeft && !carouselUi.showRight}
			>
				{#if carouselUi.showLeft}
					<button
						type="button"
						class="screenshots-btn screenshots-btn-left"
						style="left: {carouselUi.left}px"
						onclick={() => carousel?.scroll(-1)}
						aria-label="Scroll {title} left"
					>
						<ChevronLeft size={14} strokeWidth={1.4} color="var(--white66)" />
					</button>
				{/if}
				{#if carouselUi.showRight}
					<button
						type="button"
						class="screenshots-btn screenshots-btn-right"
						style="right: {carouselUi.right}px"
						onclick={() => carousel?.scroll(1)}
						aria-label="Scroll {title} right"
					>
						<ChevronRight size={14} strokeWidth={1.4} color="var(--white66)" />
					</button>
				{/if}
			</div>
		{/if}
	</div>
</section>

<style>
	.profile-browse-section {
		margin: 0;
	}

	.profile-browse-section :global(.section-header) {
		padding-left: var(--detail-pad-x, 12px);
		padding-right: var(--detail-pad-x, 12px);
		margin: 0 0 12px;
	}

	.profile-apps-browse-outer {
		--apps-pad-x: var(--detail-pad-x, 12px);
		position: relative;
		overflow-x: visible;
	}

	@media (min-width: 768px) {
		.profile-apps-browse-outer {
			--apps-pad-x: 20px;
		}
	}

	.profile-browse-empty {
		margin: 0;
		padding: 40px var(--detail-pad-x, 12px);
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--white16);
		text-align: center;
		width: 100%;
		box-sizing: border-box;
		border-top: 1px solid var(--shell-border);
		border-bottom: 1px solid var(--shell-border);
	}

	/* Full-bleed is handled by `.profile-browse-content` on the profile page — no double negative margin here. */
	.profile-apps-browse-outer :global(.apps-page-carousel-wrap) {
		margin-left: 0;
		margin-right: 0;
		width: 100%;
	}

	.screenshots-controls {
		position: absolute;
		left: 0;
		right: 0;
		transform: translateY(-50%);
		pointer-events: none;
		z-index: 30;
	}

	.screenshots-controls .screenshots-btn {
		pointer-events: auto;
	}

	.screenshots-btn {
		display: none;
	}

	@media (min-width: 768px) and (hover: hover) and (pointer: fine) {
		.screenshots-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			position: absolute;
			top: 50%;
			transform: translateY(-60%) scale(1);
			width: 34px;
			height: 34px;
			border-radius: 50%;
			border: none;
			background: var(--gray66);
			backdrop-filter: blur(var(--blur-sm));
			-webkit-backdrop-filter: blur(var(--blur-sm));
			cursor: pointer;
			z-index: 20;
			transition: transform 0.2s ease;
		}

		.screenshots-btn-left {
			transform: translate(-50%, -60%);
		}

		.screenshots-btn-left:hover {
			transform: translate(-50%, -60%) scale(1.08);
		}

		.screenshots-btn-left:active {
			transform: translate(-50%, -60%) scale(0.95);
		}

		.screenshots-btn-left :global(svg) {
			padding-right: 2px;
		}

		.screenshots-btn-right {
			left: auto;
			transform: translate(50%, -60%);
		}

		.screenshots-btn-right:hover {
			transform: translate(50%, -60%) scale(1.08);
		}

		.screenshots-btn-right:active {
			transform: translate(50%, -60%) scale(0.95);
		}

		.screenshots-btn-right :global(svg) {
			padding-left: 2px;
		}
	}
</style>
