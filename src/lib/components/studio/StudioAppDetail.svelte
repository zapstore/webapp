<script>
	import DownloadChart from './DownloadChart.svelte';
	import DownloadIcon from '$lib/components/icons/Download.svelte';
	import ZapIcon from '$lib/components/icons/Zap.svelte';
	import ChevronDownIcon from '$lib/components/icons/ChevronDown.svelte';
	import ArrowUpIcon from '$lib/components/icons/ArrowUp.svelte';
	import ArrowDownIcon from '$lib/components/icons/ArrowDown.svelte';
	import ImpressionIcon from '$lib/components/icons/Impression.svelte';
	import AppPic from '$lib/components/common/AppPic.svelte';

	let {
		app,
		chartDayCount = 30,
		dlCounts = [],
		impCounts = [],
		zapCounts = [],
		selectedDlTimeframe = $bindable('30 Days'),
		selectedImpTimeframe = $bindable('30 Days'),
		selectedZapTimeframe = $bindable('30 Days'),
		onBack: _onBack
	} = $props();

	const timeframes = ['7 Days', '30 Days', '90 Days', '1 Year'];
	let detailRangeOpen = $state(false);

	function applyDetailTimeframe(tf) {
		selectedDlTimeframe = tf;
		selectedImpTimeframe = tf;
		selectedZapTimeframe = tf;
		detailRangeOpen = false;
	}

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

	const pad = (/** @type {number[]} */ arr) => {
		const n = chartDayCount;
		if (!arr?.length) return Array(n).fill(0);
		if (arr.length === n) return arr;
		if (arr.length > n) return arr.slice(-n);
		return [...Array(n - arr.length).fill(0), ...arr];
	};

	const combinedAppData = $derived(
		dlCounts.length > 0 || zapCounts.length > 0
			? [
					{
						id: 'dl',
						name: 'Downloads',
						icon: '',
						counts: pad(dlCounts)
					},
					{
						id: 'zap',
						name: 'Zaps',
						icon: '',
						counts: pad(zapCounts)
					}
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
					<a
						class="btn-secondary-xs btn-secondary-light studio-detail-action-btn"
						href="https://docs.zapstore.dev"
						target="_blank"
						rel="noopener noreferrer"
					>
						Edit
					</a>
				</div>
			</div>
		</div>
		<div class="timerange-wrap app-info-timerange">
			<button
				type="button"
				class="timerange-btn"
				onclick={() => (detailRangeOpen = !detailRangeOpen)}
			>
				<span class="eyebrow-label tr-label tr-label--white66">{selectedDlTimeframe}</span>
				<span class="chevron-wrap">
					<ChevronDownIcon
						variant="outline"
						color="hsl(var(--white16))"
						size={12}
						strokeWidth={1.4}
					/>
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
				<DownloadIcon size={24} color="hsl(var(--blurpleColor66))" strokeWidth={1.4} />
				<span class="count-num">{dlTotal.toLocaleString('en-US')}</span>
			</div>
			{#if dlPct !== null && dlPct !== 0}
				<span class="count-ticker" class:ticker-up={dlPct > 0} class:ticker-down={dlPct < 0}>
					{#if dlPct > 0}
						<ArrowUpIcon
							size={12}
							color="hsl(var(--greenColor66))"
							strokeWidth={1.4}
							variant="outline"
						/>
					{:else}
						<ArrowDownIcon
							size={12}
							color="hsl(var(--rougeColor66))"
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
				<ZapIcon size={24} color="hsl(var(--goldColor66))" strokeWidth={1.4} />
				<span class="count-num">{zapTotal.toLocaleString('en-US')}</span>
			</div>
			{#if zapPct !== null && zapPct !== 0}
				<span class="count-ticker" class:ticker-up={zapPct > 0} class:ticker-down={zapPct < 0}>
					{#if zapPct > 0}
						<ArrowUpIcon
							size={12}
							color="hsl(var(--greenColor66))"
							strokeWidth={1.4}
							variant="outline"
						/>
					{:else}
						<ArrowDownIcon
							size={12}
							color="hsl(var(--rougeColor66))"
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
				<span class="count-num">{impTotal.toLocaleString('en-US')}</span>
			</div>
			{#if impPct !== null && impPct !== 0}
				<span class="count-ticker" class:ticker-up={impPct > 0} class:ticker-down={impPct < 0}>
					{#if impPct > 0}
						<ArrowUpIcon
							size={12}
							color="hsl(var(--greenColor66))"
							strokeWidth={1.4}
							variant="outline"
						/>
					{:else}
						<ArrowDownIcon
							size={12}
							color="hsl(var(--rougeColor66))"
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
		gap: 8px;
	}

	.studio-detail-action-btn {
		color: hsl(var(--white33));
		text-decoration: none;
	}

	.app-name {
		font-size: 16px;
		font-weight: 600;
		color: hsl(var(--foreground));
		line-height: 1.2;
		margin: 0;
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
		padding: 28px 20px 20px;
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
		transition:
			background 0.12s,
			color 0.12s;
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
			padding: 24px 16px 16px;
		}

		.activity-section {
			padding: 16px 16px 32px;
		}
	}
</style>
