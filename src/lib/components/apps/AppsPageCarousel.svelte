<script lang="js">
	import { onMount } from 'svelte';
	import { ChevronLeft, ChevronRight } from '$lib/components/icons';
	import AppSmallCard from '$lib/components/cards/AppSmallCard.svelte';
	import AppStackCard from '$lib/components/cards/AppStackCard.svelte';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';

	/**
	 * Horizontal carousel of bordered grid panels (stack-detail style cells).
	 * Chevron + fade controls are rendered on `.apps-search-outer` via bindable state.
	 *
	 * @typedef {{
	 *   top: number,
	 *   left: number,
	 *   right: number,
	 *   showLeft: boolean,
	 *   showRight: boolean
	 * }} CarouselControls
	 */

	/** @type {{
	 *   variant?: 'apps' | 'stacks',
	 *   panels?: unknown[][],
	 *   loading?: boolean,
	 *   loadingMore?: boolean,
	 *   skeletonPanels?: number,
	 *   skeletonItemsPerPanel?: number,
	 *   getAppHref?: (app: import('$lib/nostr/models').App) => string,
	 *   getStackHref?: (stack: Record<string, unknown>) => string,
	 *   onNearEnd?: () => void,
	 *   controls?: CarouselControls
	 * }} */
	let {
		variant = 'apps',
		panels = [],
		loading = false,
		loadingMore = false,
		skeletonPanels = 4,
		skeletonItemsPerPanel = 4,
		getAppHref = () => '#',
		getStackHref = () => '#',
		onNearEnd = () => {},
		controls = $bindable({
			top: 0,
			left: 0,
			right: 0,
			showLeft: false,
			showRight: false
		})
	} = $props();

	const SCROLL_STEP = 360;
	const NEAR_END_THRESHOLD = 500;

	let scrollWrap = $state(/** @type {HTMLDivElement | null} */ (null));
	let scrollEl = $state(/** @type {HTMLDivElement | null} */ (null));

	function updateScrollState() {
		if (!scrollEl) return;
		const { scrollLeft, scrollWidth, clientWidth } = scrollEl;
		controls = {
			...controls,
			showLeft: scrollLeft > 4,
			showRight: scrollLeft + clientWidth < scrollWidth - 4
		};
		if (scrollWidth - scrollLeft - clientWidth < NEAR_END_THRESHOLD) {
			onNearEnd();
		}
	}

	function updateControlsPosition() {
		const wrap = scrollWrap;
		const outer = wrap?.closest('.apps-search-outer');
		const frame = wrap?.closest('.apps-search-frame');
		if (!wrap || !outer || !frame) return;
		const wrapRect = wrap.getBoundingClientRect();
		const outerRect = outer.getBoundingClientRect();
		controls = {
			...controls,
			top: wrapRect.top - outerRect.top + wrapRect.height / 2,
			left: frame.offsetLeft,
			right: outer.clientWidth - frame.offsetLeft - frame.offsetWidth
		};
	}

	function handleScroll() {
		updateScrollState();
	}

	function scrollBy(dir) {
		scrollEl?.scrollBy({ left: dir * SCROLL_STEP, behavior: 'smooth' });
		if (dir > 0) setTimeout(updateScrollState, 350);
	}

	/** @param {unknown} item */
	function stackKey(item) {
		const s = /** @type {{ pubkey?: string, dTag?: string }} */ (item);
		return `${s.pubkey}:${s.dTag}`;
	}

	$effect(() => {
		const el = scrollEl;
		if (!el) return;
		updateScrollState();
		const ro = new ResizeObserver(() => {
			updateScrollState();
			updateControlsPosition();
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	$effect(() => {
		const wrap = scrollWrap;
		if (!wrap) return;
		updateControlsPosition();
		const frame = wrap.closest('.apps-search-frame');
		const scrollParent = wrap.closest('.apps-search-results-scroll');
		const ro = new ResizeObserver(updateControlsPosition);
		ro.observe(wrap);
		if (frame) ro.observe(frame);
		scrollParent?.addEventListener('scroll', updateControlsPosition, { passive: true });
		window.addEventListener('resize', updateControlsPosition);
		return () => {
			ro.disconnect();
			scrollParent?.removeEventListener('scroll', updateControlsPosition);
			window.removeEventListener('resize', updateControlsPosition);
		};
	});

	$effect(() => {
		void panels.length;
		void loading;
		requestAnimationFrame(() => {
			updateScrollState();
			updateControlsPosition();
		});
	});

	onMount(() => {
		updateScrollState();
		updateControlsPosition();
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
						class="apps-browse-grid"
						class:apps-browse-grid--stacks={variant === 'stacks'}
					>
						{#each Array(skeletonItemsPerPanel) as _, ii (ii)}
							<li class="apps-browse-grid-item">
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
						class="apps-browse-grid"
						class:apps-browse-grid--stacks={variant === 'stacks'}
					>
						{#if variant === 'apps'}
							{#each panel as app (/** @type {import('$lib/nostr/models').App} */ (app).id)}
								<li class="apps-browse-grid-item">
									<AppSmallCard {app} href={getAppHref(/** @type {import('$lib/nostr/models').App} */ (app))} />
								</li>
							{/each}
						{:else}
							{#each panel as stack (stackKey(stack))}
								<li class="apps-browse-grid-item">
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

	{#if controls.showLeft}
		<div class="screenshots-fade screenshots-fade-left" aria-hidden="true"></div>
	{/if}
	{#if controls.showRight}
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

	@media (min-width: 768px) {
		.apps-browse-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			width: 340px;
		}

		.apps-browse-grid--stacks {
			grid-template-columns: 1fr;
		}
	}

	.apps-browse-grid-item {
		min-width: 0;
		padding: 14px 14px 8px;
		border-bottom: 1px solid var(--white16);
		box-sizing: border-box;
	}

	@media (min-width: 768px) {
		.apps-browse-grid-item {
			padding: 20px 20px 12px;
		}

		.apps-browse-grid-item:nth-child(odd) {
			border-right: 1px solid var(--white16);
		}

		.apps-browse-grid--stacks .apps-browse-grid-item:nth-child(odd) {
			border-right: none;
		}
	}

	.apps-browse-grid-item:last-child {
		border-bottom: none;
	}

	@media (min-width: 768px) {
		.apps-browse-grid:not(.apps-browse-grid--stacks)
			.apps-browse-grid-item:nth-last-child(2):nth-child(odd):not(:last-child) {
			border-bottom: none;
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

		.carousel-skeleton-stack-grid {
			width: 104px;
			height: 104px;
		}
	}
</style>
