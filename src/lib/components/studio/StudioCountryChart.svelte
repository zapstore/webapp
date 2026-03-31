<script>
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';

	/**
	 * @typedef {{ countryKey: string, label: string, impressions: number, downloads: number }} CountryRow
	 */

	let {
		rows = /** @type {CountryRow[]} */ ([]),
		loading = false
	} = $props();

	const maxImp = $derived(Math.max(1, ...rows.map((r) => r.impressions)));
	const maxDl = $derived(Math.max(1, ...rows.map((r) => r.downloads)));

	const REGIONAL_A = 0x1f1e6;

	/** ISO 3166-1 alpha-2 → flag emoji (UTF-16 regional indicators). */
	function flagEmojiForCountryKey(/** @type {string} */ countryKey) {
		const raw = String(countryKey ?? '')
			.trim()
			.toUpperCase();
		if (!raw || raw === '__UNKNOWN__') return '';
		if (!/^[A-Z]{2}$/.test(raw)) return '';
		return String.fromCodePoint(
			REGIONAL_A + raw.charCodeAt(0) - 65,
			REGIONAL_A + raw.charCodeAt(1) - 65
		);
	}

	function pct(value, max) {
		return `${Math.min(100, Math.round((value / max) * 100))}%`;
	}
</script>

<div class="country-chart">
	{#if loading}
		<div class="country-skel-grid" aria-hidden="true">
			{#each [1, 2, 3, 4, 5] as i (i)}
				<div class="country-skel-row">
					<div class="country-skel-label"><SkeletonLoader /></div>
					<div class="country-skel-bars">
						<div class="country-skel-metric-line">
							<div class="country-skel-bar"><SkeletonLoader /></div>
							<div class="country-skel-num"><SkeletonLoader /></div>
						</div>
						<div class="country-skel-metric-line">
							<div class="country-skel-bar country-skel-bar--dl"><SkeletonLoader /></div>
							<div class="country-skel-num"><SkeletonLoader /></div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if rows.length === 0}
		<p class="country-empty">
			No country breakdown for this range. The relay must record geo (country) on events; otherwise
			buckets stay empty.
		</p>
	{:else}
		<ul class="country-list">
			{#each rows as row (row.countryKey)}
				{@const flag = flagEmojiForCountryKey(row.countryKey)}
				<li class="country-row">
					<div class="country-name" title={row.label}>
						{#if flag}
							<span class="country-flag" aria-hidden="true">{flag}</span>
						{/if}
						<span class="country-name-text">{row.label}</span>
					</div>
					<div class="country-metrics">
						<div class="metric-line">
							<div
								class="bar-track bar-track--imp"
								role="img"
								aria-label="Impressions: {row.impressions.toLocaleString('en-US')}"
							>
								<div class="bar-fill bar-fill--imp" style:width={pct(row.impressions, maxImp)}></div>
							</div>
							<span class="metric-num" class:metric-num--zero={row.impressions === 0}>
								{row.impressions.toLocaleString('en-US')}
							</span>
						</div>
						<div class="metric-line">
							<div
								class="bar-track bar-track--dl"
								role="img"
								aria-label="Downloads: {row.downloads.toLocaleString('en-US')}"
							>
								<div class="bar-fill bar-fill--dl" style:width={pct(row.downloads, maxDl)}></div>
							</div>
							<span class="metric-num" class:metric-num--zero={row.downloads === 0}>
								{row.downloads.toLocaleString('en-US')}
							</span>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.country-chart {
		width: 100%;
	}

	.country-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.country-row {
		display: grid;
		grid-template-columns: minmax(88px, 26%) 1fr;
		gap: 10px 14px;
		align-items: start;
	}

	@media (max-width: 480px) {
		.country-row {
			grid-template-columns: 1fr;
		}
	}

	.country-name {
		display: flex;
		align-items: baseline;
		gap: 6px;
		min-width: 0;
		font-size: 13px;
		font-weight: 500;
		color: hsl(var(--white66));
		line-height: 1.3;
		padding-top: 2px;
	}

	.country-flag {
		flex-shrink: 0;
		font-size: 1.05rem;
		line-height: 1;
	}

	.country-name-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.country-metrics {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}

	.metric-line {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 10px;
		align-items: center;
		min-width: 0;
	}

	.bar-track {
		height: 8px;
		border-radius: 4px;
		background: hsl(var(--white8));
		overflow: hidden;
		min-width: 0;
	}

	.bar-fill {
		height: 100%;
		border-radius: 4px;
		min-width: 0;
		transition: width 0.2s ease-out;
	}

	.bar-fill--imp {
		background: linear-gradient(90deg, hsl(var(--white33)), hsl(var(--white66)));
	}

	.bar-fill--dl {
		background: linear-gradient(90deg, #5445ff, #636aff);
	}

	.metric-num {
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: hsl(var(--white66));
		min-width: 3.25rem;
		text-align: right;
		flex-shrink: 0;
	}

	.metric-num--zero {
		color: hsl(var(--white33));
	}

	.country-empty {
		font-size: 13px;
		color: hsl(var(--white33));
		line-height: 1.45;
		margin: 0;
	}

	.country-skel-grid {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.country-skel-row {
		display: grid;
		grid-template-columns: minmax(88px, 26%) 1fr;
		gap: 10px 14px;
		align-items: center;
	}

	.country-skel-bars {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}

	.country-skel-metric-line {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 10px;
		align-items: center;
	}

	.country-skel-label {
		height: 14px;
		border-radius: 6px;
		overflow: hidden;
		max-width: 100px;
	}

	.country-skel-bar {
		height: 8px;
		border-radius: 4px;
		overflow: hidden;
		min-width: 0;
	}

	.country-skel-bar--dl {
		opacity: 0.85;
	}

	.country-skel-num {
		width: 3.25rem;
		height: 12px;
		border-radius: 4px;
		overflow: hidden;
		flex-shrink: 0;
	}
</style>
