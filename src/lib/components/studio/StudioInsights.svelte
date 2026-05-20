<script>
	import { getContext } from 'svelte';
	import { browser } from '$app/environment';
	import DownloadChart from './DownloadChart.svelte';
	import DownloadIcon from '$lib/components/icons/Download.svelte';
	import ZapIcon from '$lib/components/icons/Zap.svelte';
	import ImpressionIcon from '$lib/components/icons/Impression.svelte';
	import ChevronDownIcon from '$lib/components/icons/ChevronDown.svelte';
	import StudioCountryChart from './StudioCountryChart.svelte';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
	import StudioInsightsEmptyPreview from './StudioInsightsEmptyPreview.svelte';
	import { buildIsoDateRange, timeframeToDays } from '$lib/studio/analytics-http.js';
	import {
		getCountryBreakdown,
		studioAnalytics,
		totalForWindow
	} from '$lib/stores/studio-analytics.svelte.js';

	/** Shared state from layout (userApps, studioPubkey). */
	const ctx = getContext('studio');
	const studio = ctx ?? { userApps: [], appsLoading: true, studioPubkey: null };

	let dlDropdownOpen = $state(false);
	let zapDropdownOpen = $state(false);
	let impDropdownOpen = $state(false);
	let countryDropdownOpen = $state(false);

	let selectedDlTimeframe = $state('30 Days');
	let selectedZapTimeframe = $state('30 Days');
	let selectedImpTimeframe = $state('30 Days');
	let selectedCountryTimeframe = $state('30 Days');

	const timeframes = ['7 Days', '30 Days', '90 Days', '1 Year'];

	const dlInsightDays = $derived(timeframeToDays(selectedDlTimeframe));
	const impInsightDays = $derived(timeframeToDays(selectedImpTimeframe));
	const zapInsightDays = $derived(timeframeToDays(selectedZapTimeframe));
	const countryInsightDays = $derived(timeframeToDays(selectedCountryTimeframe));

	// ── Header totals — sum the trailing N days of the cached series ───────────
	const formattedDownloads = $derived(
		studioAnalytics.downloadsSeries
			? totalForWindow(studioAnalytics.downloadsSeries, dlInsightDays).toLocaleString('en-US')
			: '—'
	);
	const formattedZaps = $derived(
		studioAnalytics.zapsSeries
			? totalForWindow(studioAnalytics.zapsSeries, zapInsightDays).toLocaleString('en-US')
			: '—'
	);
	const formattedImpressions = $derived(
		studioAnalytics.impressionsSeries
			? totalForWindow(studioAnalytics.impressionsSeries, impInsightDays).toLocaleString('en-US')
			: '—'
	);

	// Loading flags only matter while we have apps to chart — once the store
	// returns null with no apps, the empty state below takes over.
	const dlChartLoading = $derived(studioAnalytics.downloadsLoading);
	const zapChartLoading = $derived(studioAnalytics.zapsLoading);
	const impChartLoading = $derived(studioAnalytics.impressionsLoading);

	// Close dropdowns on outside click.
	$effect(() => {
		if (!browser) return;
		if (!dlDropdownOpen && !zapDropdownOpen && !impDropdownOpen && !countryDropdownOpen) return;
		const onPointerDown = (/** @type {PointerEvent} */ e) => {
			const t = e.target;
			if (!(t instanceof Element)) return;
			const root = t.closest('[data-studio-dropdown]');
			const id = root?.getAttribute('data-studio-dropdown');
			if (dlDropdownOpen && id !== 'dl') dlDropdownOpen = false;
			if (zapDropdownOpen && id !== 'zap') zapDropdownOpen = false;
			if (impDropdownOpen && id !== 'imp') impDropdownOpen = false;
			if (countryDropdownOpen && id !== 'country') countryDropdownOpen = false;
		};
		document.addEventListener('pointerdown', onPointerDown, true);
		return () => document.removeEventListener('pointerdown', onPointerDown, true);
	});

	// ── Country breakdown — memoised in the store; one fetch per (timeframe) ──
	let countryRows = $state(/** @type {Array<{ countryKey: string, label: string, impressions: number, downloads: number }>} */ ([]));
	let countryChartLoading = $state(true);
	let countryGen = 0;

	$effect(() => {
		const pk = studioAnalytics.pubkey;
		const days = countryInsightDays;
		if (!pk || studio.userApps.length === 0) {
			countryRows = [];
			countryChartLoading = !studio.appsLoading && pk ? false : countryChartLoading;
			return;
		}
		countryGen += 1;
		const gen = countryGen;
		countryChartLoading = true;
		const range = buildIsoDateRange(days);
		void (async () => {
			try {
				const rows = await getCountryBreakdown(pk, range);
				if (gen !== countryGen) return;
				countryRows = rows;
			} finally {
				if (gen === countryGen) countryChartLoading = false;
			}
		})();
	});

	// ── Show empty state once apps have finished loading with zero results ───
	const showEmpty = $derived(!studio.appsLoading && studio.userApps.length === 0);
</script>

<div class="insights-scroll" data-main-scroll>

{#if showEmpty}
	<StudioInsightsEmptyPreview />
{:else}

	<!-- Downloads section -->
	<section class="content-section insights-chart-section">
		<div class="insights-metric-head">
			<div class="dl-meta">
				<DownloadIcon size={24} color="var(--blurpleColor66)" />
				{#if dlChartLoading}
					<div class="studio-metric-count-skel"><SkeletonLoader /></div>
				{:else}
					<span class="dl-count">{formattedDownloads}</span>
				{/if}
			</div>
		</div>
		<div class="insights-timerange-head">
			<div class="timerange-wrap" data-studio-dropdown="dl">
				<button class="timerange-btn" onclick={() => (dlDropdownOpen = !dlDropdownOpen)}>
					<span class="eyebrow-label tr-label">{selectedDlTimeframe}</span>
					<span class="chevron-wrap">
						<ChevronDownIcon variant="outline" color="var(--white16)" size={12} strokeWidth={1.4} />
					</span>
				</button>
				{#if dlDropdownOpen}
					<div class="tr-dropdown">
						{#each timeframes as tf (tf)}
							<button class="tr-option" class:tr-selected={tf === selectedDlTimeframe}
								onclick={() => { selectedDlTimeframe = tf; dlDropdownOpen = false; }}>{tf}</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
		<div class="chart-area">
		<DownloadChart chartId="dl" dayCount={dlInsightDays}
			color0="#5445FF" color1="#636AFF" glowColor="#5445FF" dotColor="#5C5FFF"
			appData={studioAnalytics.downloadsSeries} maxPerAppLines={2} loading={dlChartLoading} />
		</div>
	</section>

	<!-- Zaps section -->
	<section class="content-section insights-chart-section">
		<div class="insights-metric-head">
			<div class="dl-meta">
				<ZapIcon size={24} color="var(--goldColor66)" />
				{#if zapChartLoading}
					<div class="studio-metric-count-skel"><SkeletonLoader /></div>
				{:else}
					<span class="dl-count">{formattedZaps}</span>
				{/if}
			</div>
		</div>
		<div class="insights-timerange-head">
			<div class="timerange-wrap" data-studio-dropdown="zap">
				<button class="timerange-btn" onclick={() => (zapDropdownOpen = !zapDropdownOpen)}>
					<span class="eyebrow-label tr-label">{selectedZapTimeframe}</span>
					<span class="chevron-wrap">
						<ChevronDownIcon variant="outline" color="var(--white16)" size={12} strokeWidth={1.4} />
					</span>
				</button>
				{#if zapDropdownOpen}
					<div class="tr-dropdown">
						{#each timeframes as tf (tf)}
							<button class="tr-option" class:tr-selected={tf === selectedZapTimeframe}
								onclick={() => { selectedZapTimeframe = tf; zapDropdownOpen = false; }}>{tf}</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
		<div class="chart-area">
		<DownloadChart chartId="zap" dayCount={zapInsightDays}
			color0="#CC7A00" color1="#FFB237" glowColor="#FFB237" glowOpacity={0.12} dotColor="#FFB237"
			badgeBg="rgba(90,55,0,0.92)" appData={studioAnalytics.zapsSeries} maxPerAppLines={2}
			loading={zapChartLoading} />
		</div>
	</section>

	<!-- Impressions section -->
	<section class="content-section insights-chart-section">
		<div class="insights-metric-head">
			<div class="dl-meta">
				<ImpressionIcon size={24} />
				{#if impChartLoading}
					<div class="studio-metric-count-skel"><SkeletonLoader /></div>
				{:else}
					<span class="dl-count">{formattedImpressions}</span>
				{/if}
			</div>
		</div>
		<div class="insights-timerange-head">
			<div class="timerange-wrap" data-studio-dropdown="imp">
				<button class="timerange-btn" onclick={() => (impDropdownOpen = !impDropdownOpen)}>
					<span class="eyebrow-label tr-label">{selectedImpTimeframe}</span>
					<span class="chevron-wrap">
						<ChevronDownIcon variant="outline" color="var(--white16)" size={12} strokeWidth={1.4} />
					</span>
				</button>
				{#if impDropdownOpen}
					<div class="tr-dropdown">
						{#each timeframes as tf (tf)}
							<button class="tr-option" class:tr-selected={tf === selectedImpTimeframe}
								onclick={() => { selectedImpTimeframe = tf; impDropdownOpen = false; }}>{tf}</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
		<div class="chart-area">
		<DownloadChart chartId="imp" dayCount={impInsightDays}
			color0="var(--white33)" color1="var(--white66)" glowColor="var(--white33)"
			glowOpacity={0.16} dotColor="var(--white66)" totalDotBackdropFill="var(--black)"
			badgeBg="rgba(52, 52, 58, 0.94)" appData={studioAnalytics.impressionsSeries} maxPerAppLines={2}
			loading={impChartLoading} />
		</div>
	</section>

	<!-- By Country section -->
	<section class="content-section country-section">
		<div class="section-head country-section-head">
			<span class="eyebrow-label country-section-title">By country</span>
			<div class="country-section-head-right">
				<div class="country-head-legend">
					<span class="country-legend-item">
						<span class="country-legend-icon-wrap"><ImpressionIcon size={14} /></span>
						<span class="country-legend-text">Impressions</span>
					</span>
					<span class="country-legend-item">
						<span class="country-legend-icon-wrap">
							<DownloadIcon size={14} color="var(--blurpleColor66)" strokeWidth={1.4} />
						</span>
						<span class="country-legend-text">Downloads</span>
					</span>
				</div>
				<div class="timerange-wrap" data-studio-dropdown="country">
					<button class="timerange-btn" onclick={() => (countryDropdownOpen = !countryDropdownOpen)}>
						<span class="eyebrow-label tr-label">{selectedCountryTimeframe}</span>
						<span class="chevron-wrap">
							<ChevronDownIcon variant="outline" color="var(--white16)" size={12} strokeWidth={1.4} />
						</span>
					</button>
					{#if countryDropdownOpen}
						<div class="tr-dropdown">
							{#each timeframes as tf (tf)}
								<button class="tr-option" class:tr-selected={tf === selectedCountryTimeframe}
									onclick={() => { selectedCountryTimeframe = tf; countryDropdownOpen = false; }}>{tf}</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
		<div class="chart-area country-chart-wrap">
			<StudioCountryChart rows={countryRows} loading={countryChartLoading} />
		</div>
	</section>

{/if}
</div>

<style>
	.insights-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	.content-section {
		position: relative;
		padding: 18px 26px 20px;
		border-bottom: 1px solid var(--shell-border);
	}

	/* Metric count and timerange float absolutely over the chart */
	.insights-chart-section .insights-metric-head {
		position: absolute;
		top: 18px;
		left: 26px;
		z-index: 1;
		pointer-events: none;
	}

	.insights-chart-section .insights-metric-head .dl-meta { flex: 0 1 auto; }

	.insights-chart-section .insights-timerange-head {
		position: absolute;
		top: 18px;
		right: 26px;
		z-index: 20;
	}

	.insights-chart-section .chart-area { z-index: 5; isolation: auto; }

	.chart-area { position: relative; z-index: 0; width: 100%; isolation: isolate; }

	.dl-meta { display: flex; align-items: center; gap: 10px; }
	.dl-count { font-size: 28px; font-weight: 650; letter-spacing: -0.03em; color: var(--white); }

	.studio-metric-count-skel { height: 32px; width: 6.5rem; min-width: 5rem; border-radius: 12px; overflow: hidden; }

	.timerange-wrap { position: relative; }
	.timerange-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 4px 6px;
		border-radius: 6px;
		transition: background 0.12s;
	}
	.timerange-btn:hover { background: var(--white8); }
	.tr-label { color: var(--white33); }
	.chevron-wrap { display: flex; align-items: center; padding-top: 2px; }
	.tr-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		min-width: 110px;
		background: var(--black);
		border: 1px solid var(--white16);
		border-radius: 8px;
		padding: 4px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		z-index: 100;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
	}
	.tr-option {
		display: block;
		width: 100%;
		text-align: left;
		padding: 6px 10px;
		background: transparent;
		border: none;
		border-radius: 6px;
		font-size: 13px;
		color: var(--white66);
		cursor: pointer;
		transition: background 0.12s, color 0.12s;
	}
	.tr-option:hover { background: var(--white8); color: var(--white); }
	.tr-option.tr-selected { color: var(--white); background: var(--white8); }

	.country-section { --label-col: clamp(56px, 26%, 140px); padding-bottom: 24px; }
	@media (max-width: 600px) { .country-section { --label-col: clamp(56px, 26%, 118px); } }
	.section-head {
		position: absolute;
		top: 18px;
		left: 26px;
		right: 26px;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.country-section-head {
		display: grid;
		grid-template-columns: var(--label-col, clamp(56px, 26%, 118px)) minmax(0, 1fr);
		gap: 0 10px;
		align-items: center;
	}
	.country-section-head-right { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
	.country-head-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 14px; }
	.country-legend-item { display: inline-flex; align-items: center; gap: 6px; }
	.country-legend-icon-wrap { display: flex; opacity: 0.66; flex-shrink: 0; }
	.country-legend-icon-wrap :global(svg) { display: block; }
	.country-legend-text { font-size: 12px; font-weight: 500; color: var(--white33); }
	.country-section-title { color: var(--white66); flex-shrink: 0; }
	.country-chart-wrap { min-height: 120px; padding-top: 48px; }

</style>
