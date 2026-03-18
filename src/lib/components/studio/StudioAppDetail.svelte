<script>
	import DownloadChart from './DownloadChart.svelte';
	import DownloadIcon from '$lib/components/icons/Download.svelte';
	import ZapIcon from '$lib/components/icons/Zap.svelte';
	import ChevronDownIcon from '$lib/components/icons/ChevronDown.svelte';
	import ArrowUpIcon from '$lib/components/icons/ArrowUp.svelte';
	import ArrowDownIcon from '$lib/components/icons/ArrowDown.svelte';

	let {
		app,
		dlCounts = [],
		impCounts = [],
		zapCounts = [],
		onBack: _onBack
	} = $props();

	function sum(arr) {
		return arr.reduce((s, v) => s + v, 0);
	}

	// Compare last 7 days vs previous 7 days for % change
	function pctChange(counts) {
		if (!counts || counts.length < 14) return null;
		const recent = sum(counts.slice(-7));
		const prior = sum(counts.slice(-14, -7));
		if (prior === 0) return recent > 0 ? 100 : 0;
		return Math.round(((recent - prior) / prior) * 100);
	}

	const dlTotal = $derived(sum(dlCounts));
	const impTotal = $derived(sum(impCounts));
	const zapTotal = $derived(sum(zapCounts));

	const dlPct = $derived(pctChange(dlCounts));
	const impPct = $derived(pctChange(impCounts));
	const zapPct = $derived(pctChange(zapCounts));

	let timeframeOpen = $state(false);
	let selectedTimeframe = $state('30 Days');
	const timeframes = ['7 Days', '30 Days', '90 Days', '1 Year'];

	const combinedAppData = $derived(
		dlCounts.length > 0 || zapCounts.length > 0
			? [
					{
						id: 'dl',
						name: 'Downloads',
						icon: '',
						counts: dlCounts.length > 0 ? dlCounts : Array(30).fill(0)
					},
					{
						id: 'zap',
						name: 'Zaps',
						icon: '',
						counts: zapCounts.length > 0 ? zapCounts : Array(30).fill(0)
					}
				]
			: null
	);
</script>

<div class="detail-wrap">

	<!-- App info header — app info left, 30 Days dropdown right -->
	<div class="app-info">
		<div class="app-info-left">
			{#if app.icon}
				<img src={app.icon} alt={app.name} class="app-icon" />
			{/if}
			<div class="app-text">
				<h2 class="app-name">{app.name}</h2>
				{#if app.description}
					<p class="app-desc">{app.description}</p>
				{/if}
			</div>
		</div>
		<div class="timerange-wrap app-info-timerange">
			<button class="timerange-btn" onclick={() => (timeframeOpen = !timeframeOpen)}>
				<span class="eyebrow-label tr-label tr-label--white66">{selectedTimeframe}</span>
				<span class="chevron-wrap">
					<ChevronDownIcon variant="outline" color="hsl(var(--white16))" size={12} strokeWidth={1.4} />
				</span>
			</button>
			{#if timeframeOpen}
				<div class="tr-dropdown">
					{#each timeframes as tf}
						<button
							class="tr-option"
							class:tr-selected={tf === selectedTimeframe}
							onclick={() => { selectedTimeframe = tf; timeframeOpen = false; }}
						>{tf}</button>
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
				<DownloadIcon size={24} color="hsl(var(--white33))" strokeWidth={1.4} />
				<span class="count-num">{dlTotal.toLocaleString('en-US')}</span>
			</div>
			{#if dlPct !== null && dlPct !== 0}
				<span class="count-ticker" class:ticker-up={dlPct > 0} class:ticker-down={dlPct < 0}>
					{#if dlPct > 0}
						<ArrowUpIcon size={12} color="hsl(var(--greenColor66))" strokeWidth={1.4} variant="outline" />
					{:else}
						<ArrowDownIcon size={12} color="hsl(var(--rougeColor66))" strokeWidth={1.4} variant="outline" />
					{/if}
					<span class="ticker-pct">{Math.abs(dlPct)}%</span>
				</span>
			{/if}
		</div>
		<div class="count-item">
			<span class="eyebrow-label count-eyebrow">Zaps</span>
			<div class="count-value-row">
				<ZapIcon size={24} color="hsl(var(--white33))" strokeWidth={1.4} />
				<span class="count-num">{zapTotal.toLocaleString('en-US')}</span>
			</div>
			{#if zapPct !== null && zapPct !== 0}
				<span class="count-ticker" class:ticker-up={zapPct > 0} class:ticker-down={zapPct < 0}>
					{#if zapPct > 0}
						<ArrowUpIcon size={12} color="hsl(var(--greenColor66))" strokeWidth={1.4} variant="outline" />
					{:else}
						<ArrowDownIcon size={12} color="hsl(var(--rougeColor66))" strokeWidth={1.4} variant="outline" />
					{/if}
					<span class="ticker-pct">{Math.abs(zapPct)}%</span>
				</span>
			{/if}
		</div>
		<div class="count-item count-item--last">
			<span class="eyebrow-label count-eyebrow">Impressions</span>
			<div class="count-value-row">
				<span class="count-num">{impTotal.toLocaleString('en-US')}</span>
			</div>
			{#if impPct !== null && impPct !== 0}
				<span class="count-ticker" class:ticker-up={impPct > 0} class:ticker-down={impPct < 0}>
					{#if impPct > 0}
						<ArrowUpIcon size={12} color="hsl(var(--greenColor66))" strokeWidth={1.4} variant="outline" />
					{:else}
						<ArrowDownIcon size={12} color="hsl(var(--rougeColor66))" strokeWidth={1.4} variant="outline" />
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
				color0="#5445FF"
				color1="#636AFF"
				glowColor="#5445FF"
				dotColor="#5C5FFF"
				appColors={['#636AFF', '#FFB237']}
				appBadgeBgs={['rgba(60,58,80,0.92)', 'rgba(90,55,0,0.92)']}
				hideTotalLine={true}
				padTop={20}
				appData={combinedAppData}
			/>
		</div>
	</section>

	<!-- Activity section -->
	<section class="activity-section">
		<span class="eyebrow-label activity-eyebrow">Activity</span>
		<div class="activity-empty">Nothing here yet.</div>
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
		border-bottom: 1px solid hsl(var(--border));
	}

	.app-info-left {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		min-width: 0;
	}

	.app-icon {
		width: 44px;
		height: 44px;
		border-radius: 10px;
		object-fit: cover;
		flex-shrink: 0;
	}

	.app-text {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 0;
	}

	.app-name {
		font-size: 16px;
		font-weight: 600;
		color: hsl(var(--foreground));
		line-height: 1.2;
		margin: 0;
	}

	.app-desc {
		font-size: 13px;
		color: hsl(var(--white33));
		line-height: 1.5;
		margin: 0;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* ── Counts row ────────────────────────────────────────────────────────── */
	.counts-row {
		display: flex;
		border-bottom: 1px solid hsl(var(--border));
	}

	.count-item {
		flex: 1;
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		border-right: 1px solid hsl(var(--border));
		position: relative;
	}

	.count-eyebrow {
		color: hsl(var(--white33));
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
		color: hsl(var(--greenColor66));
	}

	.count-ticker.ticker-down {
		color: hsl(var(--rougeColor66));
	}

	.ticker-pct {
		line-height: 1;
	}

	.count-num {
		font-size: 32px;
		font-weight: 600;
		color: hsl(var(--foreground));
		line-height: 1;
		letter-spacing: -0.02em;
	}

	/* ── Chart section ─────────────────────────────────────────────────────── */
	.chart-section {
		position: relative;
		padding: 0 20px 20px;
		border-bottom: 1px solid hsl(var(--border));
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
		background: hsl(var(--white8));
		border: none;
		cursor: pointer;
		border-radius: 8px;
	}

	.tr-label--white66 {
		color: hsl(var(--white66));
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
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
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
		color: hsl(var(--white66));
		cursor: pointer;
		transition: background 0.12s, color 0.12s;
	}

	.tr-option:hover {
		background: hsl(var(--white8));
		color: hsl(var(--foreground));
	}

	.tr-option.tr-selected {
		color: hsl(var(--foreground));
		background: hsl(var(--white8));
	}

	.chart-area {
		width: 100%;
	}

	/* ── Activity ──────────────────────────────────────────────────────────── */
	.activity-section {
		padding: 20px 20px 40px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.activity-eyebrow {
		color: hsl(var(--white33));
	}

	.activity-empty {
		font-size: 13px;
		color: hsl(var(--white33));
	}

	/* ── Mobile ────────────────────────────────────────────────────────────── */
	@media (max-width: 600px) {
		.app-info {
			padding: 16px;
		}

		.count-item {
			padding: 16px;
		}

		.count-ticker {
			bottom: 16px;
			right: 16px;
		}

		.count-num {
			font-size: 24px;
		}

		.chart-section {
			padding: 0 16px 16px;
		}

		.activity-section {
			padding: 16px 16px 32px;
		}
	}
</style>
