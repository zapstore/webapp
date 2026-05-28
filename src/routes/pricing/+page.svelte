<script lang="js">
	import '$lib/styles/landing-display.css';
	import '$lib/styles/pricing.css';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import PricingTiersCarousel from '$lib/components/pricing/PricingTiersCarousel.svelte';
	import PricingComparison from '$lib/components/pricing/PricingComparison.svelte';
	import DownloadModal from '$lib/components/common/DownloadModal.svelte';
	import { PRICING_TIERS } from '$lib/components/pricing/pricing-tiers.js';
	import { ChevronLeft, ChevronRight } from '$lib/components/icons';
	import { SITE_URL } from '$lib/config';

	/** @typedef {{ top: number, left: number, right: number, showLeft: boolean, showRight: boolean }} CarouselUi */

	/** @type {CarouselUi} */
	let carouselUi = $state({
		top: 0,
		left: 0,
		right: 0,
		showLeft: false,
		showRight: false
	});

	/** @type {import('$lib/components/pricing/PricingTiersCarousel.svelte').default | null} */
	let carousel = $state(null);
	let downloadModalOpen = $state(false);

	const title = 'Pricing | Zapstore';
	const description =
		'Enjoy builder-published apps and social features for free. Community hosting from $4.99/month. Pro adds a paid indexer, developer analytics, and support.';
</script>

<SeoHead {title} {description} url="{SITE_URL}/pricing" />

<section class="pricing-page">
	<div class="pricing-outer container mx-auto px-0 sm:px-6 lg:px-8">
		<div class="pricing-frame">
			<header class="pricing-header">
				<div class="pricing-hero-body">
					<p class="eyebrow-label pricing-eyebrow mb-4" style="color: var(--white33);">Our Plans</p>

					<h1 class="display-hero pricing-hero-title">
						<span
							style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;"
							>Free, by default.<br /></span
						><span
							class="pricing-hero-accent"
							style="background: var(--gradient-blurple-light); -webkit-background-clip: text; background-clip: text; color: transparent;"
							>No sign-up required.</span
						>
					</h1>

					<p class="display-lead pricing-lead">
						Enjoy all builder-published apps and social features for free.<br
							class="pricing-lead-break"
							aria-hidden="true"
						/>
						Sign up for maximum apps, community hosting, and analytics when needed.
					</p>
				</div>
			</header>

			<div class="pricing-tiers-section" aria-label="Pricing tiers">
				<PricingTiersCarousel
					bind:this={carousel}
					tiers={PRICING_TIERS}
					onDownloadZapstore={() => (downloadModalOpen = true)}
					onUiChange={(ui) => {
						if (
							carouselUi.showLeft === ui.showLeft &&
							carouselUi.showRight === ui.showRight &&
							carouselUi.top === ui.top &&
							carouselUi.left === ui.left &&
							carouselUi.right === ui.right
						) {
							return;
						}
						carouselUi = ui;
					}}
				/>
			</div>

			<PricingComparison />
		</div>

		{#if carouselUi.showLeft || carouselUi.showRight}
			<div
				class="pricing-carousel-controls"
				style="top: {carouselUi.top}px"
				aria-hidden={!carouselUi.showLeft && !carouselUi.showRight}
			>
				{#if carouselUi.showLeft}
					<button
						type="button"
						class="pricing-carousel-btn pricing-carousel-btn-left"
						style="left: {carouselUi.left}px"
						onclick={() => carousel?.scroll(-1)}
						aria-label="Scroll pricing tiers left"
					>
						<ChevronLeft size={14} strokeWidth={1.4} color="var(--white66)" />
					</button>
				{/if}
				{#if carouselUi.showRight}
					<button
						type="button"
						class="pricing-carousel-btn pricing-carousel-btn-right"
						style="right: {carouselUi.right}px"
						onclick={() => carousel?.scroll(1)}
						aria-label="Scroll pricing tiers right"
					>
						<ChevronRight size={14} strokeWidth={1.4} color="var(--white66)" />
					</button>
				{/if}
			</div>
		{/if}
	</div>
</section>

<DownloadModal bind:open={downloadModalOpen} isZapstore={true} />

<style>
	.pricing-page {
		padding-bottom: 0;
	}

	.pricing-outer {
		position: relative;
	}

	.pricing-frame {
		--pricing-pad-x: 14px;
		border-left: 1px solid var(--shell-border);
		border-right: 1px solid var(--shell-border);
		margin-left: -16px;
		margin-right: -16px;
	}

	@media (min-width: 768px) {
		.pricing-frame {
			--pricing-pad-x: 20px;
		}
	}

	@media (max-width: 639px) {
		.pricing-frame {
			margin-left: -4px;
			margin-right: -4px;
		}
	}

	@media (max-width: 767px) {
		.pricing-frame {
			border-left: none;
			border-right: none;
			margin-left: 0;
			margin-right: 0;
		}
	}

	.pricing-header {
		padding: 0 var(--pricing-pad-x) 8px;
	}

	@media (max-width: 767px) {
		.pricing-header {
			padding-left: 24px;
			padding-right: 24px;
		}
	}

	.pricing-hero-body {
		position: relative;
		z-index: 1;
		width: 100%;
		margin: 0;
		padding-top: 2rem;
		padding-bottom: 0.75rem;
		text-align: center;
	}

	@media (min-width: 768px) {
		.pricing-hero-body {
			padding-top: 2.5rem;
			padding-bottom: 2rem;
		}
	}

	.pricing-eyebrow {
		font-size: 1.125rem;
	}

	@media (min-width: 1024px) {
		.pricing-eyebrow {
			font-size: 1.25rem;
		}
	}

	.pricing-hero-title.display-hero {
		margin: 0 0 1rem;
	}

	.pricing-hero-accent {
		white-space: nowrap;
	}

	@media (min-width: 768px) {
		.pricing-hero-title.display-hero {
			margin-bottom: 1.25rem;
		}
	}

	.pricing-lead {
		margin: 0;
		color: var(--white66);
	}

	@media (max-width: 767px) {
		.pricing-lead-break {
			display: none;
		}
	}

	@media (min-width: 768px) {
		.pricing-lead {
			margin-bottom: 16px;
		}
	}

	.pricing-tiers-section {
		padding-top: 0;
		padding-bottom: 8px;
	}

	.pricing-carousel-controls {
		position: absolute;
		left: 0;
		right: 0;
		transform: translateY(-50%);
		pointer-events: none;
		z-index: 30;
	}

	.pricing-carousel-controls .pricing-carousel-btn {
		pointer-events: auto;
	}

	.pricing-carousel-btn {
		display: none;
	}

	@media (min-width: 768px) and (hover: hover) and (pointer: fine) {
		.pricing-carousel-btn {
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

		.pricing-carousel-btn-left {
			transform: translate(-50%, -60%);
		}

		.pricing-carousel-btn-left:hover {
			transform: translate(-50%, -60%) scale(1.08);
		}

		.pricing-carousel-btn-left:active {
			transform: translate(-50%, -60%) scale(0.95);
		}

		.pricing-carousel-btn-left :global(svg) {
			padding-right: 2px;
		}

		.pricing-carousel-btn-right {
			left: auto;
			transform: translate(50%, -60%);
		}

		.pricing-carousel-btn-right:hover {
			transform: translate(50%, -60%) scale(1.08);
		}

		.pricing-carousel-btn-right:active {
			transform: translate(50%, -60%) scale(0.95);
		}

		.pricing-carousel-btn-right :global(svg) {
			padding-left: 2px;
		}
	}
</style>
