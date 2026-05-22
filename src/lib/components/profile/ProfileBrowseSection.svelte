<script lang="js">
	import { browser } from '$app/environment';
	import '$lib/styles/browse-grid.css';
	import SectionHeader from '$lib/components/cards/SectionHeader.svelte';
	import AppsPageCarousel from '$lib/components/apps/AppsPageCarousel.svelte';
	import AppSmallCard from '$lib/components/cards/AppSmallCard.svelte';
	import AppStackCard from '$lib/components/cards/AppStackCard.svelte';
	import AppSearchHitRowSkeleton from '$lib/components/cards/AppSearchHitRowSkeleton.svelte';
	import '$lib/styles/profile-section-empty.css';

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
	 *   getStackUrl?: (stack: Record<string, unknown>) => string,
	 *   carousel?: { scroll: (direction: number) => void } | null,
	 *   onUiChange?: (ui: CarouselUi) => void
	 * }} */
	let {
		title = '',
		variant = 'apps',
		items = [],
		loading = false,
		emptyMessage = 'Nothing here yet',
		getAppUrl = () => '#',
		getStackUrl = () => '#',
		carousel = $bindable(/** @type {{ scroll: (direction: number) => void } | null} */ (null)),
		onUiChange = () => {}
	} = $props();

	let viewportDesktop = $state(false);

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

	$effect(() => {
		if (!useCarousel) {
			onUiChange({ top: 0, left: 0, right: 0, showLeft: false, showRight: false });
		}
	});
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
			<p class="profile-section-empty">{emptyMessage}</p>
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
				{onUiChange}
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

	.profile-apps-browse-outer {
		margin-left: 0;
		margin-right: 0;
		width: 100%;
	}
</style>
