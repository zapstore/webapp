<script>
	import { browser } from '$app/environment';
	import DownloadChart from './DownloadChart.svelte';
	import DownloadIcon from '$lib/components/icons/Download.svelte';
	import ZapIcon from '$lib/components/icons/Zap.svelte';
	import ChevronDownIcon from '$lib/components/icons/ChevronDown.svelte';
	import ArrowUpIcon from '$lib/components/icons/ArrowUp.svelte';
	import ArrowDownIcon from '$lib/components/icons/ArrowDown.svelte';
	import ImpressionIcon from '$lib/components/icons/Impression.svelte';
	import AppPic from '$lib/components/common/AppPic.svelte';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
	import StudioCountryChart from './StudioCountryChart.svelte';
	import StudioPlatformChart from './StudioPlatformChart.svelte';
	import { timeframeToDays } from '$lib/studio/analytics-http.js';

	let {
		app,
		chartDayCount = 30,
		dlCounts = [],
		impCounts = [],
		zapCounts = [],
		selectedDlTimeframe = $bindable('30 Days'),
		selectedImpTimeframe = $bindable('30 Days'),
		selectedZapTimeframe = $bindable('30 Days'),
		/** While parent refetches downloads for the selected range */
		dlMetricsLoading = false,
		/** While parent refetches zaps */
		zapMetricsLoading = false,
		/** While parent refetches impressions */
		impMetricsLoading = false,
	/** Per-app country breakdown rows (from parent) */
	countryRows = [],
	/** While parent loads country breakdown for this app */
	countryLoading = false,
	/** Per-app platform breakdown rows (from parent) */
	platformRows = [],
	/** While parent loads platform breakdown for this app */
	platformLoading = false,
	onBack: _onBack,
		onEdit = () => {}
	} = $props();

	const detailChartLoading = $derived(dlMetricsLoading || zapMetricsLoading || impMetricsLoading);

	const timeframes = ['7 Days', '30 Days', '90 Days', '1 Year'];
	let detailRangeOpen = $state(false);

	$effect(() => {
		if (!browser) return;
		if (!detailRangeOpen) return;

		const onPointerDown = (/** @type {PointerEvent} */ e) => {
			const t = e.target;
			if (!(t instanceof Element)) return;
			if (t.closest('[data-studio-dropdown="detail"]')) return;
			detailRangeOpen = false;
		};

		document.addEventListener('pointerdown', onPointerDown, true);
		return () => document.removeEventListener('pointerdown', onPointerDown, true);
	});

	function applyDetailTimeframe(tf) {
		selectedDlTimeframe = tf;
		selectedImpTimeframe = tf;
		selectedZapTimeframe = tf;
		detailRangeOpen = false;
	}

	function sum(arr) {
		return arr.reduce((s, v) => s + v, 0);
	}

	/** Big number = sum over the visible timeframe only (last N days when we store 2× for tickers). */
	function sumLastWindow(counts, windowDays) {
		const n = Math.max(1, windowDays);
		if (!counts?.length) return 0;
		const slice = counts.length >= n ? counts.slice(-n) : counts;
		return sum(slice);
	}

	/**
	 * % change: current window vs the immediately prior window of the same length.
	 * Requires daily buckets for 2× windowDays (oldest → newest).
	 */
	function pctChangeForWindow(counts, windowDays) {
		const n = Math.max(1, windowDays);
		if (!counts || counts.length < 2 * n) return null;
		const prior = sum(counts.slice(0, n));
		const recent = sum(counts.slice(n, 2 * n));
		// No meaningful % vs prior when baseline is zero (avoid fake "100%").
		if (prior === 0) return null;
		return Math.round(((recent - prior) / prior) * 100);
	}

	const dlWindowDays = $derived(timeframeToDays(selectedDlTimeframe));
	const impWindowDays = $derived(timeframeToDays(selectedImpTimeframe));
	const zapWindowDays = $derived(timeframeToDays(selectedZapTimeframe));

	const dlTotal = $derived(sumLastWindow(dlCounts, dlWindowDays));
	const impTotal = $derived(sumLastWindow(impCounts, impWindowDays));
	const zapTotal = $derived(sumLastWindow(zapCounts, zapWindowDays));

	const dlPct = $derived(pctChangeForWindow(dlCounts, dlWindowDays));
	const impPct = $derived(pctChangeForWindow(impCounts, impWindowDays));
	const zapPct = $derived(pctChangeForWindow(zapCounts, zapWindowDays));

	const pad = (/** @type {number[]} */ arr) => {
		const n = chartDayCount;
		if (!arr?.length) return Array(n).fill(0);
		if (arr.length === n) return arr;
		if (arr.length > n) return arr.slice(-n);
		return [...Array(n - arr.length).fill(0), ...arr];
	};

	/**
	 * One chart: impressions → zaps → downloads (aligned to detail timeframe).
	 * Order is paint order in SVG (first = back); user wants downloads on top, zaps mid, impressions bottom.
	 */
	const combinedAppData = $derived(
		dlCounts.length > 0 || zapCounts.length > 0 || impCounts.length > 0
			? [
					{ id: 'imp', name: 'Impressions', icon: '', counts: pad(impCounts) },
					{ id: 'zap', name: 'Zaps', icon: '', counts: pad(zapCounts) },
					{ id: 'dl', name: 'Downloads', icon: '', counts: pad(dlCounts) }
				]
			: null
	);
</script>

<div class="detail-wrap">
	<!-- App info header — app info left, 30 Days dropdown right -->
	<div class="app-info">
		<div class="app-info-left">
			<div class="app-pic-wrap">
				<AppPic
					iconUrl={app.icon}
					name={app.name}
					identifier={app.id}
					size="lg"
					className="studio-detail-app-pic"
					onClick={() => {}}
				/>
			</div>
			<div class="app-text">
				<h2 class="app-name">{app.name}</h2>
				<div class="app-info-actions">
					<a
						class="btn-secondary-xs btn-secondary-light studio-detail-action-btn"
						href="/apps/{encodeURIComponent(app.id)}"
					>
						View
					</a>
					<button
						type="button"
						class="btn-secondary-xs btn-secondary-light studio-detail-action-btn"
						onclick={onEdit}
					>
						Edit
					</button>
				</div>
			</div>
		</div>
		<div class="timerange-wrap app-info-timerange" data-studio-dropdown="detail">
			<button
				type="button"
				class="timerange-btn"
				onclick={() => (detailRangeOpen = !detailRangeOpen)}
			>
				<span class="eyebrow-label tr-label tr-label--white66">{selectedDlTimeframe}</span>
				<span class="chevron-wrap">
					<ChevronDownIcon variant="outline" color="var(--white16)" size={12} strokeWidth={1.4} />
				</span>
			</button>
			{#if detailRangeOpen}
				<div class="tr-dropdown">
					{#each timeframes as tf (tf)}
						<button
							type="button"
							class="tr-option"
							class:tr-selected={tf === selectedDlTimeframe &&
								selectedDlTimeframe === selectedImpTimeframe &&
								selectedDlTimeframe === selectedZapTimeframe}
							onclick={() => applyDetailTimeframe(tf)}>{tf}</button
						>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- Counts row — three metrics -->
	<div class="counts-row">
		<div class="count-item">
			<span class="eyebrow-label count-eyebrow">Downloads</span>
			<div class="count-value-row">
				<DownloadIcon size={24} color="var(--blurpleColor66)" strokeWidth={1.4} />
				{#if dlMetricsLoading}
					<div class="detail-count-skel"><SkeletonLoader /></div>
				{:else}
					<span class="count-num">{dlTotal.toLocaleString('en-US')}</span>
				{/if}
			</div>
			{#if !dlMetricsLoading && dlPct !== null && dlPct !== 0}
				<span class="count-ticker" class:ticker-up={dlPct > 0} class:ticker-down={dlPct < 0}>
					{#if dlPct > 0}
						<ArrowUpIcon
							size={12}
							color="var(--greenColor66)"
							strokeWidth={1.4}
							variant="outline"
						/>
					{:else}
						<ArrowDownIcon
							size={12}
							color="var(--rougeColor66)"
							strokeWidth={1.4}
							variant="outline"
						/>
					{/if}
					<span class="ticker-pct">{Math.abs(dlPct)}%</span>
				</span>
			{/if}
		</div>
		<div class="count-item">
			<span class="eyebrow-label count-eyebrow">Zaps</span>
			<div class="count-value-row">
				<ZapIcon size={24} color="var(--goldColor66)" strokeWidth={1.4} />
				{#if zapMetricsLoading}
					<div class="detail-count-skel"><SkeletonLoader /></div>
				{:else}
					<span class="count-num">{zapTotal.toLocaleString('en-US')}</span>
				{/if}
			</div>
			{#if !zapMetricsLoading && zapPct !== null && zapPct !== 0}
				<span class="count-ticker" class:ticker-up={zapPct > 0} class:ticker-down={zapPct < 0}>
					{#if zapPct > 0}
						<ArrowUpIcon
							size={12}
							color="var(--greenColor66)"
							strokeWidth={1.4}
							variant="outline"
						/>
					{:else}
						<ArrowDownIcon
							size={12}
							color="var(--rougeColor66)"
							strokeWidth={1.4}
							variant="outline"
						/>
					{/if}
					<span class="ticker-pct">{Math.abs(zapPct)}%</span>
				</span>
			{/if}
		</div>
		<div class="count-item count-item--last">
			<span class="eyebrow-label count-eyebrow">Impressions</span>
			<div class="count-value-row">
				<ImpressionIcon size={24} />
				{#if impMetricsLoading}
					<div class="detail-count-skel"><SkeletonLoader /></div>
				{:else}
					<span class="count-num">{impTotal.toLocaleString('en-US')}</span>
				{/if}
			</div>
			{#if !impMetricsLoading && impPct !== null && impPct !== 0}
				<span class="count-ticker" class:ticker-up={impPct > 0} class:ticker-down={impPct < 0}>
					{#if impPct > 0}
						<ArrowUpIcon
							size={12}
							color="var(--greenColor66)"
							strokeWidth={1.4}
							variant="outline"
						/>
					{:else}
						<ArrowDownIcon
							size={12}
							color="var(--rougeColor66)"
							strokeWidth={1.4}
							variant="outline"
						/>
					{/if}
					<span class="ticker-pct">{Math.abs(impPct)}%</span>
				</span>
			{/if}
		</div>
	</div>

	<!-- Chart section -->
	<section class="chart-section">
		<div class="chart-area">
			<DownloadChart
				chartId="detail"
				dayCount={chartDayCount}
				color0="#5445FF"
				color1="#636AFF"
				glowColor="#5445FF"
				glowOpacity={0.3}
				dotColor="#5C5FFF"
				appColors={['var(--white66)', '#FFB237', '#636AFF']}
				appGlowColors={['var(--white33)', '#FFB237', '#5445FF']}
				appGlowOpacities={[0.16, 0.12, 0.3]}
				appLineGradients={[
					{
						color0: 'var(--white33)',
						color1: 'var(--white66)',
						glowColor: 'var(--white33)'
					},
					null,
					null
				]}
				appDotBackdropFills={['var(--black)', null, null]}
				appBadgeBgs={['rgba(52,52,58,0.94)', 'rgba(90,55,0,0.92)', 'rgba(60,58,80,0.92)']}
				hideTotalLine={true}
				perSeriesYScale={true}
				padTop={20}
				appData={combinedAppData}
				loading={detailChartLoading}
			/>
		</div>
	</section>

	<!-- Platform breakdown (same date range as header / charts) -->
	<section class="detail-country-section">
		<div class="detail-country-head">
			<span class="eyebrow-label detail-country-title">By platform</span>
			<div class="detail-country-legend">
				<span class="detail-legend-item">
					<span class="detail-legend-icon-wrap">
						<ImpressionIcon size={14} />
					</span>
					<span class="detail-legend-text">Impressions</span>
				</span>
				<span class="detail-legend-item">
					<span class="detail-legend-icon-wrap">
						<DownloadIcon size={14} color="var(--blurpleColor66)" strokeWidth={1.4} />
					</span>
					<span class="detail-legend-text">Downloads</span>
				</span>
			</div>
		</div>
		<div class="detail-country-chart-wrap">
			<StudioPlatformChart rows={platformRows} loading={platformLoading} />
		</div>
	</section>

	<!-- Country breakdown (same date range as header / charts) -->
	<section class="detail-country-section">
		<div class="detail-country-head">
			<span class="eyebrow-label detail-country-title">By country</span>
			<div class="detail-country-legend">
				<span class="detail-legend-item">
					<span class="detail-legend-icon-wrap">
						<ImpressionIcon size={14} />
					</span>
					<span class="detail-legend-text">Impressions</span>
				</span>
				<span class="detail-legend-item">
					<span class="detail-legend-icon-wrap">
						<DownloadIcon size={14} color="var(--blurpleColor66)" strokeWidth={1.4} />
					</span>
					<span class="detail-legend-text">Downloads</span>
				</span>
			</div>
		</div>
		<div class="detail-country-chart-wrap">
			<StudioCountryChart rows={countryRows} loading={countryLoading} />
		</div>
	</section>
</div>

<style>
	.detail-wrap {
		display: flex;
		flex-direction: column;
	}

	/* ── App info header ───────────────────────────────────────────────────── */
	.app-info {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		padding: 20px;
		border-bottom: 1px solid var(--white16);
	}

	.app-info-left {
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: 0;
	}

	.app-pic-wrap {
		flex-shrink: 0;
		line-height: 0;
	}

	/* Header pic is decorative — AppPic is a button; neutralize interaction */
	:global(.studio-detail-app-pic.app-pic) {
		cursor: default;
	}

	:global(.studio-detail-app-pic.app-pic:hover),
	:global(.studio-detail-app-pic.app-pic:active) {
		transform: none;
	}

	.app-text {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 8px;
		min-width: 0;
	}

	.app-info-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
	}

	.studio-detail-action-btn {
		color: var(--white66);
		text-decoration: none;
	}

	.app-name {
		font-size: 20px;
		font-weight: 650;
		color: var(--white);
		line-height: 1.15;
		letter-spacing: -0.02em;
		margin: 0;
	}

	/* ── Counts row ────────────────────────────────────────────────────────── */
	.counts-row {
		display: flex;
		border-bottom: 1px solid var(--white16);
	}

	.count-item {
		flex: 1;
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		border-right: 1px solid var(--white16);
		position: relative;
	}

	.count-eyebrow {
		color: var(--white33);
	}

	.count-item--last {
		border-right: none;
	}

	.count-value-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.count-ticker {
		position: absolute;
		bottom: 16px;
		right: 20px;
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 12px;
		font-weight: 500;
	}

	.count-ticker.ticker-up {
		color: var(--greenColor66);
	}

	.count-ticker.ticker-down {
		color: var(--rougeColor66);
	}

	.ticker-pct {
		line-height: 1;
	}

	.count-num {
		font-size: 32px;
		font-weight: 600;
		color: var(--white);
		line-height: 1;
		letter-spacing: -0.02em;
	}

	.detail-count-skel {
		height: 32px;
		width: 5.5rem;
		min-width: 4rem;
		border-radius: 12px;
		overflow: hidden;
		flex-shrink: 0;
	}

	/* ── Chart section ─────────────────────────────────────────────────────── */
	.chart-section {
		position: relative;
		padding: 28px 20px 20px;
		border-bottom: 1px solid var(--white16);
	}

	.timerange-wrap {
		position: relative;
	}

	.app-info-timerange {
		flex-shrink: 0;
	}

	.timerange-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 8px 12px;
		background: var(--white8);
		border: none;
		cursor: pointer;
		border-radius: 8px;
	}

	.tr-label--white66 {
		color: var(--white66);
	}

	.chevron-wrap {
		display: flex;
		align-items: center;
		padding-top: 2px;
	}

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
		z-index: 50;
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
		transition:
			background 0.12s,
			color 0.12s;
	}

	.tr-option:hover {
		background: var(--white8);
		color: var(--white);
	}

	.tr-option.tr-selected {
		color: var(--white);
		background: var(--white8);
	}

	.chart-area {
		width: 100%;
	}

	/* ── Country/platform breakdown ─────────────────────────────────────────── */
	.detail-country-section {
		padding: 20px 20px 40px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		border-top: 1px solid var(--white16);
		/* Label-column width: slightly wider on desktop */
		--label-col: clamp(56px, 26%, 140px);
	}

	@media (max-width: 600px) {
		.detail-country-section {
			--label-col: clamp(56px, 26%, 118px);
		}
	}

	/* Grid: col-1 = section title (same width as chart label col), col-2 = legend */
	.detail-country-head {
		display: grid;
		grid-template-columns: var(--label-col, clamp(56px, 26%, 118px)) minmax(0, 1fr);
		gap: 0 10px;
		align-items: center;
	}

	.detail-country-title {
		color: var(--white66);
		flex-shrink: 0;
	}

	.detail-country-legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 14px;
	}

	.detail-legend-item {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.detail-legend-icon-wrap {
		display: flex;
		opacity: 0.66;
		flex-shrink: 0;
	}

	.detail-legend-icon-wrap :global(svg) {
		display: block;
	}

	.detail-legend-text {
		font-size: 12px;
		font-weight: 500;
		color: var(--white33);
	}

	.detail-country-chart-wrap {
		width: 100%;
		min-height: 80px;
	}

	/* ── Mobile ────────────────────────────────────────────────────────────── */
	@media (max-width: 600px) {
		.app-info {
			padding: 16px;
		}

		.counts-row {
			flex-direction: column;
		}

		.count-item {
			flex: none;
			width: 100%;
			padding: 16px;
			border-right: none;
			border-bottom: 1px solid var(--white16);
		}

		.count-item--last {
			border-bottom: none;
		}

		.count-ticker {
			bottom: 16px;
			right: 16px;
		}

		.count-num {
			font-size: 24px;
		}

		.chart-section {
			padding: 24px 16px 16px;
		}

		.detail-country-section {
			padding: 16px 16px 32px;
		}
	}
</style>
