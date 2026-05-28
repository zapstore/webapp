<script lang="js">
	import '$lib/styles/pricing.css';
	import Check from '$lib/components/icons/Check.svelte';
	import { ChevronDown } from '$lib/components/icons';
	import { PRICING_TIERS } from '$lib/components/pricing/pricing-tiers.js';
	import { PRICING_COMPARISON_SECTIONS } from '$lib/components/pricing/pricing-comparison.js';

	/** @typedef {import('./pricing-tiers.js').PricingTierId} PricingTierId */

	/** @type {PricingTierId} */
	let mobileTier = $state('free');

	/** @param {import('./pricing-comparison.js').PricingCompareCell} value */
	function cellIsIncluded(value) {
		return value === true;
	}

	/** @param {import('./pricing-comparison.js').PricingCompareCell} value */
	function cellText(value) {
		if (value === true) return null;
		if (value === false) return 'No';
		return value;
	}
</script>

<div class="pricing-compare" aria-label="Plan comparison">
	<div class="pricing-compare-head">
		<h2 class="pricing-text-title pricing-compare-page-title">Compare plans</h2>

		<div class="pricing-compare-mobile-tier">
			<label class="sr-only" for="pricing-compare-tier">Plan to compare</label>
			<div class="pricing-compare-select-wrap">
				<select id="pricing-compare-tier" class="pricing-compare-select pricing-text-body" bind:value={mobileTier}>
					{#each PRICING_TIERS as tier (tier.id)}
						<option value={tier.id}>{tier.name}</option>
					{/each}
				</select>
				<span class="pricing-compare-select-icon" aria-hidden="true">
					<ChevronDown variant="outline" size={14} strokeWidth={1.4} color="var(--white66)" />
				</span>
			</div>
		</div>
	</div>

	{#each PRICING_COMPARISON_SECTIONS as section (section.id)}
		<section class="pricing-compare-section" aria-labelledby="pricing-compare-{section.id}">
			<h3 id="pricing-compare-{section.id}" class="pricing-text-title pricing-compare-section-title">
				{section.title}
			</h3>

			<div class="pricing-compare-mobile">
				<ul class="pricing-compare-mobile-list">
					{#each section.rows as row (row.label)}
						{@const cell = row.values[mobileTier]}
						<li class="pricing-compare-mobile-row">
							<span class="pricing-text-body">{row.label}</span>
							<span class="pricing-compare-mobile-value">
								{#if cellIsIncluded(cell)}
									<Check variant="outline" size={14} strokeWidth={1.4} color="var(--blurpleColor)" />
									<span class="sr-only">Included</span>
								{:else}
									<span class="pricing-text-body">{cellText(cell)}</span>
								{/if}
							</span>
						</li>
					{/each}
				</ul>
			</div>

			<div class="pricing-compare-desktop">
				<div class="pricing-compare-grid" role="table">
					<div class="pricing-compare-grid-row pricing-compare-grid-head" role="row">
						<div class="pricing-compare-grid-cell pricing-compare-grid-feature pricing-text-body" role="columnheader">
							Feature
						</div>
						{#each PRICING_TIERS as tier (tier.id)}
							<div
								class="pricing-compare-grid-cell pricing-compare-grid-tier pricing-text-title"
								class:pricing-tier-name--pro={tier.nameAccent === 'pro'}
								role="columnheader"
							>
								{tier.name}
							</div>
						{/each}
					</div>

					{#each section.rows as row (row.label)}
						<div class="pricing-compare-grid-row" role="row">
							<div class="pricing-compare-grid-cell pricing-compare-grid-feature pricing-text-body" role="rowheader">
								{row.label}
							</div>
							{#each PRICING_TIERS as tier (tier.id)}
								{@const cell = row.values[tier.id]}
								<div class="pricing-compare-grid-cell pricing-compare-grid-value" role="cell">
									{#if cellIsIncluded(cell)}
										<Check variant="outline" size={14} strokeWidth={1.4} color="var(--blurpleColor)" />
										<span class="sr-only">Included</span>
									{:else}
										<span class="pricing-text-body">{cellText(cell)}</span>
									{/if}
								</div>
							{/each}
						</div>
					{/each}
				</div>
			</div>
		</section>
	{/each}
</div>

<style>
	.pricing-compare-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 20px var(--pricing-pad-x) 16px;
	}

	.pricing-compare-page-title {
		margin: 0;
	}

	.pricing-compare-mobile-tier {
		flex-shrink: 0;
	}

	.pricing-compare-select-wrap {
		position: relative;
		display: inline-flex;
		align-items: center;
	}

	.pricing-compare-select {
		appearance: none;
		height: 28px;
		padding: 0 28px 0 12px;
		border: none;
		border-radius: 8px;
		background: var(--gray66);
		color: var(--white);
		cursor: pointer;
	}

	.pricing-compare-select-icon {
		position: absolute;
		right: 8px;
		display: flex;
		align-items: center;
		pointer-events: none;
		padding-top: 2px;
	}

	.pricing-compare-section + .pricing-compare-section {
		border-top: 1px solid var(--shell-border);
	}

	.pricing-compare-section-title {
		margin: 0;
		padding: 14px var(--pricing-pad-x);
		border-bottom: 1px solid var(--shell-border);
		font-size: 14px;
		font-weight: 600;
	}

	@media (min-width: 768px) {
		.pricing-compare-section-title {
			padding-top: 18px;
			padding-bottom: 18px;
		}
	}

	.pricing-compare-mobile {
		display: block;
	}

	.pricing-compare-desktop {
		display: none;
	}

	@media (min-width: 768px) {
		.pricing-compare-mobile-tier,
		.pricing-compare-mobile {
			display: none;
		}

		.pricing-compare-desktop {
			display: block;
		}
	}

	.pricing-compare-mobile-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.pricing-compare-mobile-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 14px var(--pricing-pad-x);
		border-bottom: 1px solid var(--shell-border);
	}

	.pricing-compare-mobile-row:last-child {
		border-bottom: none;
	}

	.pricing-compare-mobile-value {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		flex-shrink: 0;
		min-width: 4.5rem;
		text-align: right;
	}

	.pricing-compare-grid {
		display: flex;
		flex-direction: column;
	}

	.pricing-compare-grid-row {
		display: grid;
		grid-template-columns: minmax(180px, 1.4fr) repeat(4, minmax(88px, 1fr));
		border-bottom: 1px solid var(--shell-border);
	}

	.pricing-compare-grid-row:last-child {
		border-bottom: none;
	}

	.pricing-compare-grid-cell {
		display: flex;
		align-items: center;
		min-height: 48px;
		padding: 12px 14px;
		border-right: 1px solid var(--shell-border);
	}

	.pricing-compare-grid-cell:last-child {
		border-right: none;
	}

	.pricing-compare-grid-head .pricing-compare-grid-tier {
		font-size: 14px;
		font-weight: 600;
	}

	.pricing-compare-grid-tier.pricing-tier-name--pro {
		background: var(--gradient-blurple-light);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}

	.pricing-compare-grid-value {
		justify-content: center;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
