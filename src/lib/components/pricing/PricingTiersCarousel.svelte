<script lang="js">
	import '$lib/styles/pricing.css';
	import { wheelScroll } from '$lib/actions/wheelScroll.js';
	import Check from '$lib/components/icons/Check.svelte';

	/** @typedef {{ top: number, left: number, right: number, showLeft: boolean, showRight: boolean }} CarouselUi */

	/** @type {{
	 *   tiers?: import('./pricing-tiers.js').PricingTier[],
	 *   onUiChange?: (ui: CarouselUi) => void,
	 *   onDownloadZapstore?: () => void
	 * }} */
	let { tiers = [], onUiChange = () => {}, onDownloadZapstore = () => {} } = $props();

	const SCROLL_STEP = 320;

	let scrollWrap = $state(/** @type {HTMLDivElement | null} */ (null));
	let scrollEl = $state(/** @type {HTMLDivElement | null} */ (null));
	let showLeft = $state(false);
	let showRight = $state(false);

	/** @type {CarouselUi | null} */
	let lastEmittedUi = null;

	/** @type {number | null} */
	let syncRaf = null;

	function scheduleSync() {
		if (syncRaf != null) return;
		syncRaf = requestAnimationFrame(() => {
			syncRaf = null;
			syncScrollUi();
		});
	}

	function emitUiIfChanged(nextLeft, nextRight) {
		const wrap = scrollWrap;
		const outer = wrap?.closest('.pricing-outer');
		const frame = wrap?.closest('.pricing-frame');
		if (!wrap || !outer || !frame) return;
		const wrapRect = wrap.getBoundingClientRect();
		const outerRect = outer.getBoundingClientRect();
		const frameRect = frame.getBoundingClientRect();
		/** @type {CarouselUi} */
		const ui = {
			showLeft: nextLeft,
			showRight: nextRight,
			top: Math.round(wrapRect.top - outerRect.top + wrapRect.height / 2),
			left: Math.round(frameRect.left - outerRect.left),
			right: Math.round(outerRect.right - frameRect.right)
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
		if (!scrollEl) return;
		const { scrollLeft, scrollWidth, clientWidth } = scrollEl;
		const nextLeft = scrollLeft > 4;
		const nextRight = scrollLeft + clientWidth < scrollWidth - 4;
		if (showLeft !== nextLeft) showLeft = nextLeft;
		if (showRight !== nextRight) showRight = nextRight;
		emitUiIfChanged(nextLeft, nextRight);
	}

	function handleScroll() {
		scheduleSync();
	}

	function scrollBy(dir) {
		scrollEl?.scrollBy({ left: dir * SCROLL_STEP, behavior: 'smooth' });
	}

	$effect(() => {
		const el = scrollEl;
		if (!el) return;
		scheduleSync();
		const ro = new ResizeObserver(scheduleSync);
		ro.observe(el);
		return () => ro.disconnect();
	});

	$effect(() => {
		void tiers.length;
		scheduleSync();
	});

	$effect(() => {
		const wrap = scrollWrap;
		if (!wrap) return;
		const onLayout = () => scheduleSync();
		window.addEventListener('resize', onLayout);
		return () => window.removeEventListener('resize', onLayout);
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
	class="pricing-carousel-wrap"
	bind:this={scrollWrap}
	use:wheelScroll={{ scrollRoot: '.pricing-carousel-scroll' }}
>
	<div
		class="pricing-carousel-scroll"
		data-chrome-scroll
		bind:this={scrollEl}
		onscroll={handleScroll}
	>
		<div class="pricing-carousel-track">
			{#each tiers as tier (tier.id)}
				<article class="pricing-tier-card" id={tier.id}>
					<header class="pricing-tier-header">
						<div class="pricing-tier-header-inner">
							<h2
								class="pricing-text-title pricing-tier-name"
								class:pricing-tier-name--pro={tier.nameAccent === 'pro'}
							>
								{tier.name}
							</h2>
							<div class="pricing-tier-price-row">
								<span
									class="pricing-text-title pricing-tier-price"
									class:pricing-tier-price--muted={tier.priceMuted}
								>{tier.priceLabel}</span>
								{#if tier.priceSuffix}
									<span class="pricing-text-body pricing-tier-suffix">{tier.priceSuffix}</span>
								{/if}
							</div>
							<div class="pricing-tier-description-slot">
								<p class="pricing-text-body">{tier.description}</p>
							</div>
						</div>
						<div class="pricing-tier-header-divider" aria-hidden="true"></div>
					</header>

					<ul class="pricing-tier-features">
						{#each tier.features as feature (feature)}
							<li class="pricing-tier-feature">
								<span class="pricing-tier-check" aria-hidden="true">
									<Check variant="outline" size={14} strokeWidth={1.4} color="var(--blurpleColor)" />
								</span>
								<span class="pricing-text-body">{feature}</span>
							</li>
						{/each}
					</ul>

					<footer class="pricing-tier-footer">
						{#if tier.ctaAction === 'download'}
							<button
								type="button"
								class="btn-secondary-small pricing-tier-cta"
								onclick={onDownloadZapstore}
							>
								{tier.ctaLabel}
							</button>
						{:else if tier.ctaVariant === 'primary'}
							<a href={tier.ctaHref} class="btn-primary-small pricing-tier-cta">{tier.ctaLabel}</a>
						{:else}
							<a href={tier.ctaHref} class="btn-secondary-small pricing-tier-cta">{tier.ctaLabel}</a>
						{/if}
					</footer>
				</article>
			{/each}
		</div>
	</div>
</div>

<style>
	.pricing-carousel-wrap {
		position: relative;
		overflow: hidden;
	}

	.pricing-carousel-scroll {
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		-ms-overflow-style: none;
		padding-bottom: 8px;
	}

	.pricing-carousel-scroll::-webkit-scrollbar {
		display: none;
	}

	.pricing-carousel-track {
		display: flex;
		align-items: stretch;
		gap: 0;
	}

	.pricing-tier-card {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		width: min(100vw - 2 * var(--pricing-pad-x) - 48px, 300px);
		min-height: 100%;
		border-top: 1px solid var(--shell-border);
		border-bottom: 1px solid var(--shell-border);
		box-sizing: border-box;
	}

	.pricing-tier-card:not(:last-child) {
		border-right: 1px solid var(--shell-border);
	}

	@media (min-width: 768px) {
		.pricing-tier-card {
			width: 300px;
		}
	}

	.pricing-tier-header {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	.pricing-tier-header-inner {
		padding: 18px 24px 0;
	}

	.pricing-tier-header-divider {
		margin-top: 14px;
		border-bottom: 1px solid var(--shell-border);
	}

	.pricing-tier-name {
		margin: 0 0 6px;
	}

	.pricing-tier-price-row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 6px;
		margin-bottom: 10px;
	}

	.pricing-tier-price--muted {
		color: var(--white66);
	}

	.pricing-tier-suffix {
		color: var(--white33);
	}

	.pricing-tier-description-slot {
		min-height: 2.75rem;
	}

	.pricing-tier-description-slot :global(p) {
		margin: 0;
	}

	.pricing-tier-features {
		list-style: none;
		margin: 0;
		padding: 14px 24px;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.pricing-tier-feature {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 0;
	}

	.pricing-tier-check {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		padding-top: 2px;
	}

	.pricing-tier-footer {
		padding: 16px 24px 24px;
		margin-top: auto;
	}

	a.pricing-tier-cta,
	button.pricing-tier-cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		box-sizing: border-box;
		line-height: 1;
		text-decoration: none;
		border-radius: 10px;
		padding-top: 0;
		padding-bottom: 0;
	}

</style>
