<script lang="js">
	import '$lib/styles/browse-grid.css';
	import AppSmallCard from '$lib/components/cards/AppSmallCard.svelte';
	import AppStackCard from '$lib/components/cards/AppStackCard.svelte';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';

	/** @typedef {{ top: number, left: number, right: number, showLeft: boolean, showRight: boolean }} CarouselUi */

	/** @type {{
	 *   active?: boolean,
	 *   variant?: 'apps' | 'stacks',
	 *   panels?: unknown[][],
	 *   loading?: boolean,
	 *   loadingMore?: boolean,
	 *   skeletonPanels?: number,
	 *   skeletonItemsPerPanel?: number,
	 *   getAppHref?: (app: import('$lib/nostr/models').App) => string,
	 *   getStackHref?: (stack: Record<string, unknown>) => string,
	 *   onNearEnd?: () => void,
	 *   onUiChange?: (ui: CarouselUi) => void
	 * }} */
	let {
		active = true,
		variant = 'apps',
		panels = [],
		loading = false,
		loadingMore = false,
		skeletonPanels = 4,
		skeletonItemsPerPanel = 2,
		getAppHref = () => '#',
		getStackHref = () => '#',
		onNearEnd = () => {},
		onUiChange = () => {}
	} = $props();

	const SCROLL_STEP = 360;
	const NEAR_END_THRESHOLD = 500;

	let scrollWrap = $state(/** @type {HTMLDivElement | null} */ (null));
	let scrollEl = $state(/** @type {HTMLDivElement | null} */ (null));
	let showLeft = $state(false);
	let showRight = $state(false);
	let nearEndArmed = $state(true);

	/** @type {CarouselUi | null} */
	let lastEmittedUi = null;

	/** @type {number | null} */
	let syncRaf = null;

	function scheduleSync() {
		if (!active) return;
		if (syncRaf != null) return;
		syncRaf = requestAnimationFrame(() => {
			syncRaf = null;
			syncScrollUi();
		});
	}

	function emitUiIfChanged(nextLeft, nextRight) {
		const wrap = scrollWrap;
		const outer = wrap?.closest('.apps-search-outer, .profile-apps-browse-outer');
		const frame = wrap?.closest('.apps-search-frame, .app-detail-frame');
		if (!wrap || !outer || !frame) return;
		const wrapRect = wrap.getBoundingClientRect();
		const outerRect = outer.getBoundingClientRect();
		/** @type {CarouselUi} */
		const ui = {
			showLeft: nextLeft,
			showRight: nextRight,
			top: Math.round(wrapRect.top - outerRect.top + wrapRect.height / 2),
			left: frame.offsetLeft,
			right: outer.clientWidth - frame.offsetLeft - frame.offsetWidth
		};
		if (
			lastEmittedUi &&
			lastEmittedUi.showLeft === ui.showLeft &&
			lastEmittedUi.showRight === ui.showRight &&
			lastEmittedUi.top === ui.top &&
			lastEmittedUi.left === ui.left &&
			lastEmittedUi.right === ui.right
		) {
			return;
		}
		lastEmittedUi = ui;
		onUiChange(ui);
	}

	function syncScrollUi() {
		if (!active || !scrollEl) return;
		const { scrollLeft, scrollWidth, clientWidth } = scrollEl;
		const nextLeft = scrollLeft > 4;
		const nextRight = scrollLeft + clientWidth < scrollWidth - 4;
		if (showLeft !== nextLeft) showLeft = nextLeft;
		if (showRight !== nextRight) showRight = nextRight;
		if (scrollWidth - scrollLeft - clientWidth >= NEAR_END_THRESHOLD) {
			nearEndArmed = true;
		}
		emitUiIfChanged(nextLeft, nextRight);
	}

	/** Load-more only on user scroll when content overflows. */
	function maybeLoadMoreNearEnd() {
		if (!active || !scrollEl || !nearEndArmed) return;
		const { scrollLeft, scrollWidth, clientWidth } = scrollEl;
		if (scrollWidth <= clientWidth) return;
		if (scrollWidth - scrollLeft - clientWidth < NEAR_END_THRESHOLD) {
			nearEndArmed = false;
			onNearEnd();
		}
	}

	function handleScroll() {
		scheduleSync();
		maybeLoadMoreNearEnd();
	}

	function scrollBy(dir) {
		scrollEl?.scrollBy({ left: dir * SCROLL_STEP, behavior: 'smooth' });
	}

	/** @param {unknown} item */
	function stackKey(item) {
		const s = /** @type {{ pubkey?: string, dTag?: string }} */ (item);
		return `${s.pubkey}:${s.dTag}`;
	}

	$effect(() => {
		if (!active) return;
		const el = scrollEl;
		if (!el) return;
		scheduleSync();
		const ro = new ResizeObserver(scheduleSync);
		ro.observe(el);
		return () => ro.disconnect();
	});

	$effect(() => {
		if (!active) return;
		void panels.length;
		void loading;
		scheduleSync();
	});

	$effect(() => {
		if (!active) return;
		const wrap = scrollWrap;
		if (!wrap) return;
		const scrollParent = wrap.closest(
			'.apps-search-results-scroll, .app-detail-scroll, .profile-detail-scroll'
		);
		const onLayout = () => scheduleSync();
		scrollParent?.addEventListener('scroll', onLayout, { passive: true });
		window.addEventListener('resize', onLayout);
		return () => {
			scrollParent?.removeEventListener('scroll', onLayout);
			window.removeEventListener('resize', onLayout);
		};
	});

	$effect(() => {
		return () => {
			if (syncRaf != null) cancelAnimationFrame(syncRaf);
		};
	});

	export function scroll(direction) {
		scrollBy(direction);
	}
</script>

<div
	class="screenshots-scroll-wrap apps-page-carousel-wrap"
	class:apps-page-carousel-wrap--stacks={variant === 'stacks'}
	bind:this={scrollWrap}
>
	{#if panels.length === 0 && loading}
		<div class="screenshots-scroll" aria-hidden="true">
			<div class="screenshots-content">
				{#each Array(skeletonPanels) as _, pi (pi)}
					<ul
						class="apps-browse-grid browse-grid"
						class:apps-browse-grid--stacks={variant === 'stacks'}
					>
						{#each Array(skeletonItemsPerPanel) as _, ii (ii)}
							<li class="apps-browse-grid-item browse-grid-item browse-grid-item--{variant === 'stacks' ? 'stack' : 'app'}">
								{#if variant === 'stacks'}
									<div class="carousel-skeleton-stack">
										<div class="carousel-skeleton-stack-grid"><SkeletonLoader /></div>
										<div class="carousel-skeleton-stack-info">
											<div class="carousel-skeleton-stack-name"><SkeletonLoader /></div>
											<div class="carousel-skeleton-stack-line"></div>
										</div>
									</div>
								{:else}
									<div class="carousel-skeleton-app">
										<div class="carousel-skeleton-app-icon"><SkeletonLoader /></div>
										<div class="carousel-skeleton-app-lines">
											<div class="carousel-skeleton-app-name"><SkeletonLoader /></div>
											<div class="carousel-skeleton-app-desc"></div>
										</div>
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{/each}
			</div>
		</div>
	{:else}
		<div class="screenshots-scroll" bind:this={scrollEl} onscroll={handleScroll}>
			<div class="screenshots-content">
				{#each panels as panel, pi (pi)}
					<ul
						class="apps-browse-grid browse-grid"
						class:apps-browse-grid--stacks={variant === 'stacks'}
					>
						{#if variant === 'apps'}
							{#each panel as app (/** @type {import('$lib/nostr/models').App} */ (app).id)}
								<li class="apps-browse-grid-item browse-grid-item browse-grid-item--{variant === 'stacks' ? 'stack' : 'app'}">
									<AppSmallCard {app} href={getAppHref(/** @type {import('$lib/nostr/models').App} */ (app))} />
								</li>
							{/each}
						{:else}
							{#each panel as stack (stackKey(stack))}
								<li class="apps-browse-grid-item browse-grid-item browse-grid-item--{variant === 'stacks' ? 'stack' : 'app'}">
									<AppStackCard
										{stack}
										href={getStackHref(/** @type {Record<string, unknown>} */ (stack))}
									/>
								</li>
							{/each}
						{/if}
					</ul>
				{/each}
				{#if loadingMore}
					<div class="apps-browse-load-more" aria-hidden="true">
						<div class="spinner"></div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if showLeft}
		<div class="screenshots-fade screenshots-fade-left" aria-hidden="true"></div>
	{/if}
	{#if showRight}
		<div class="screenshots-fade screenshots-fade-right" aria-hidden="true"></div>
	{/if}
</div>

<style>
	.apps-page-carousel-wrap {
		position: relative;
		overflow: visible;
		margin-left: calc(-1 * var(--apps-pad-x));
		margin-right: calc(-1 * var(--apps-pad-x));
		width: calc(100% + 2 * var(--apps-pad-x));
	}

	.apps-page-carousel-wrap :global(.screenshots-scroll) {
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.apps-page-carousel-wrap :global(.screenshots-scroll::-webkit-scrollbar) {
		display: none;
	}

	.apps-page-carousel-wrap :global(.screenshots-content) {
		display: flex;
		align-items: stretch;
		gap: 0;
		padding-bottom: 8px;
	}

	.apps-page-carousel-wrap :global(.screenshots-content > .apps-browse-grid:not(:last-child)) {
		border-right: 1px solid var(--white16);
	}

	.apps-page-carousel-wrap :global(.screenshots-scroll) {
		padding-left: var(--apps-pad-x);
		padding-right: var(--apps-pad-x);
	}

	.apps-browse-grid {
		display: grid;
		grid-template-columns: 1fr;
		flex-shrink: 0;
		width: min(100vw - 2 * var(--apps-pad-x) - 32px, 340px);
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--white16);
		border-bottom: 1px solid var(--white16);
		box-sizing: border-box;
	}

	/* Row dividers come from items; panel bottom edge is the grid border only. */
	.apps-browse-grid :global(.browse-grid-item:last-child) {
		border-bottom: none;
	}

	@media (min-width: 768px) {
		.apps-browse-grid {
			width: 340px;
		}
	}

	.apps-browse-load-more {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 64px;
		align-self: stretch;
	}

	.spinner {
		width: 20px;
		height: 20px;
		border: 2px solid var(--white33);
		border-top-color: var(--white);
		border-radius: 50%;
		animation: apps-carousel-spin 0.8s linear infinite;
	}

	@keyframes apps-carousel-spin {
		to {
			transform: rotate(360deg);
		}
	}

	.screenshots-fade {
		position: absolute;
		top: 0;
		bottom: 8px;
		pointer-events: none;
		z-index: 5;
	}

	.screenshots-fade-left {
		left: 0;
		width: var(--apps-pad-x);
		background: linear-gradient(to right, var(--black), transparent);
	}

	.screenshots-fade-right {
		right: 0;
		width: var(--apps-pad-x);
		background: linear-gradient(to left, var(--black), transparent);
	}

	@media (min-width: 768px) {
		.screenshots-fade-left,
		.screenshots-fade-right {
			width: 2rem;
		}
	}

	.carousel-skeleton-app {
		display: flex;
		align-items: flex-start;
		gap: 16px;
	}

	.carousel-skeleton-app-icon {
		width: 56px;
		height: 56px;
		border-radius: 16px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.carousel-skeleton-app-lines {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 6px;
	}

	.carousel-skeleton-app-name {
		width: 100px;
		height: 18px;
		border-radius: 12px;
		overflow: hidden;
	}

	.carousel-skeleton-app-desc {
		width: 160px;
		height: 10px;
		border-radius: 12px;
		background: var(--gray33);
	}

	.carousel-skeleton-stack {
		display: flex;
		gap: 16px;
		align-items: stretch;
	}

	.carousel-skeleton-stack-grid {
		width: 86px;
		height: 86px;
		border-radius: 16px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.carousel-skeleton-stack-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 8px;
	}

	.carousel-skeleton-stack-name {
		width: 100px;
		height: 18px;
		border-radius: 12px;
		overflow: hidden;
	}

	.carousel-skeleton-stack-line {
		width: 140px;
		height: 10px;
		border-radius: 12px;
		background: var(--gray33);
	}

	@media (min-width: 768px) {
		.carousel-skeleton-app-icon {
			width: 72px;
			height: 72px;
			border-radius: 24px;
		}

		.carousel-skeleton-app-lines {
			padding-top: 6px;
		}

		.carousel-skeleton-stack-grid {
			width: 104px;
			height: 104px;
		}
	}
</style>
