<script>
	import DownloadChart from './DownloadChart.svelte';
	import DownloadIcon from '$lib/components/icons/Download.svelte';
	import ZapIcon from '$lib/components/icons/Zap.svelte';
	import ImpressionIcon from '$lib/components/icons/Impression.svelte';
	import StudioCountryChart from './StudioCountryChart.svelte';
	import {
		studioInsightsDummyAppSeries,
		studioInsightsDummyCountryRows,
		STUDIO_INSIGHTS_DUMMY_DAY_COUNT
	} from './studio-insights-dummy-data.js';
	import { totalForWindow } from '$lib/stores/studio-analytics.svelte.js';

	const dummy = $derived(studioInsightsDummyAppSeries());
	const countryRows = studioInsightsDummyCountryRows();
	const dayCount = STUDIO_INSIGHTS_DUMMY_DAY_COUNT;

	const downloadsTotal = $derived(totalForWindow(dummy.downloads, dayCount));
	const zapsTotal = $derived(totalForWindow(dummy.zaps, dayCount));
	const impressionsTotal = $derived(totalForWindow(dummy.impressions, dayCount));

	const downloadsFmt = $derived(downloadsTotal.toLocaleString('en-US'));
	const zapsFmt = $derived(zapsTotal.toLocaleString('en-US'));
	const impressionsFmt = $derived(impressionsTotal.toLocaleString('en-US'));
</script>

<div class="empty-preview-root">
	<div class="empty-preview-stack">
		<div class="empty-preview-stage" aria-hidden="true" inert>
			<section class="content-section insights-chart-section">
				<div class="insights-metric-head">
					<div class="dl-meta">
						<DownloadIcon size={24} color="var(--blurpleColor66)" />
						<span class="dl-count">{downloadsFmt}</span>
					</div>
				</div>
				<div class="insights-timerange-head">
					<span class="eyebrow-label tr-label muted-tf">Last 30 days</span>
				</div>
				<div class="chart-area">
					<DownloadChart
						chartId="dl-preview"
						dayCount={dayCount}
						color0="#5445FF"
						color1="#636AFF"
						glowColor="#5445FF"
						dotColor="#5C5FFF"
						badgeBg="rgba(60,58,80,0.92)"
						appData={dummy.downloads}
						maxPerAppLines={2}
						loading={false}
					/>
				</div>
			</section>

			<section class="content-section insights-chart-section">
				<div class="insights-metric-head">
					<div class="dl-meta">
						<ZapIcon size={24} color="var(--goldColor66)" />
						<span class="dl-count">{zapsFmt}</span>
					</div>
				</div>
				<div class="insights-timerange-head">
					<span class="eyebrow-label tr-label muted-tf">Last 30 days</span>
				</div>
				<div class="chart-area">
					<DownloadChart
						chartId="zap-preview"
						dayCount={dayCount}
						color0="#CC7A00"
						color1="#FFB237"
						glowColor="#FFB237"
						glowOpacity={0.12}
						dotColor="#FFB237"
						badgeBg="rgba(90,55,0,0.92)"
						appData={dummy.zaps}
						maxPerAppLines={2}
						loading={false}
					/>
				</div>
			</section>

			<section class="content-section insights-chart-section">
				<div class="insights-metric-head">
					<div class="dl-meta">
						<ImpressionIcon size={24} />
						<span class="dl-count">{impressionsFmt}</span>
					</div>
				</div>
				<div class="insights-timerange-head">
					<span class="eyebrow-label tr-label muted-tf">Last 30 days</span>
				</div>
				<div class="chart-area">
					<DownloadChart
						chartId="imp-preview"
						dayCount={dayCount}
						color0="var(--white33)"
						color1="var(--white66)"
						glowColor="var(--white33)"
						glowOpacity={0.16}
						dotColor="var(--white66)"
						totalDotBackdropFill="var(--black)"
						badgeBg="rgba(52, 52, 58, 0.94)"
						appData={dummy.impressions}
						maxPerAppLines={2}
						loading={false}
					/>
				</div>
			</section>

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
						<span class="eyebrow-label tr-label muted-tf country-tf">Last 30 days</span>
					</div>
				</div>
				<div class="chart-area country-chart-wrap">
					<StudioCountryChart rows={countryRows} loading={false} />
				</div>
			</section>
		</div>

		<div class="empty-preview-vignette" aria-hidden="true"></div>
	</div>

	<div class="empty-preview-overlay">
		<div class="empty-preview-panel panel-p-24">
			<h2 class="empty-preview-title">Publish your first app</h2>
			<p class="empty-preview-lead">
				Get detailed analytics for downloads, earnings and impressions.
			</p>
			<div class="empty-preview-actions">
				<a href="/docs/publish" class="btn-primary">Start Publishing</a>
			</div>
		</div>
	</div>
</div>

<style>
	.empty-preview-root {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.empty-preview-stack {
		position: relative;
		flex: 1;
		min-height: min(72vh, 920px);
		overflow: hidden;
		border-radius: 0;
	}

	.empty-preview-stage {
		position: absolute;
		inset: 0;
		overflow-y: auto;
		filter: blur(4px) saturate(0.94);
		transform: scale(1.015);
		opacity: 0.82;
		pointer-events: none;
		user-select: none;
	}

	.empty-preview-vignette {
		pointer-events: none;
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 92% 78% at 50% 42%,
			transparent 0%,
			color-mix(in srgb, var(--black) 35%, transparent) 55%,
			color-mix(in srgb, var(--black) 68%, transparent) 100%
		);
		opacity: 0.72;
	}

	.empty-preview-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		z-index: 40;
	}

	.empty-preview-panel {
		width: 100%;
		max-width: min(396px, 100%);
		text-align: center;
		border-radius: 32px;
		background-color: color-mix(in srgb, var(--gray66) 78%, transparent);
		backdrop-filter: blur(28px) saturate(1.05);
		-webkit-backdrop-filter: blur(28px) saturate(1.05);
		box-shadow:
			0 24px 80px hsl(0 0% 0% / 0.45),
			0 0 0 0.33px var(--white16);
		animation: preview-panel-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) backwards;
	}

	@keyframes preview-panel-rise {
		from {
			opacity: 0;
			transform: translateY(12px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.empty-preview-title {
		font-size: clamp(22px, 5vw, 28px);
		font-weight: 650;
		letter-spacing: -0.03em;
		color: var(--white);
		margin: 0 0 14px;
		line-height: 1.2;
	}

	.empty-preview-lead {
		font-size: 15px;
		line-height: 1.6;
		color: var(--white66);
		margin: 0 auto 24px;
		max-width: 100%;
		text-wrap: balance;
	}

	.empty-preview-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		justify-content: center;
	}

	.muted-tf {
		color: var(--white33);
		padding: 4px 6px;
		border-radius: 6px;
	}

	.country-tf {
		flex-shrink: 0;
	}

	.content-section {
		position: relative;
		padding: 18px 26px 20px;
		border-bottom: 1px solid var(--shell-border);
	}

	.insights-chart-section .insights-metric-head {
		position: absolute;
		top: 18px;
		left: 26px;
		z-index: 1;
		pointer-events: none;
	}

	.insights-chart-section .insights-timerange-head {
		position: absolute;
		top: 18px;
		right: 26px;
		z-index: 20;
	}

	.insights-chart-section .chart-area {
		z-index: 5;
		isolation: auto;
	}

	.chart-area {
		position: relative;
		z-index: 0;
		width: 100%;
		isolation: isolate;
	}

	.dl-meta {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.dl-count {
		font-size: 28px;
		font-weight: 650;
		letter-spacing: -0.03em;
		color: var(--white);
	}

	.country-section {
		--label-col: clamp(56px, 26%, 140px);
		padding-bottom: 24px;
	}

	@media (max-width: 600px) {
		.country-section {
			--label-col: clamp(56px, 26%, 118px);
		}
	}

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

	.country-section-head-right {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-width: 0;
	}

	.country-head-legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 14px;
		min-width: 0;
	}

	.country-legend-item {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.country-legend-icon-wrap {
		display: flex;
		opacity: 0.66;
		flex-shrink: 0;
	}

	.country-legend-icon-wrap :global(svg) {
		display: block;
	}

	.country-legend-text {
		font-size: 12px;
		font-weight: 500;
		color: var(--white33);
	}

	.country-section-title {
		color: var(--white66);
		flex-shrink: 0;
	}

	.country-chart-wrap {
		min-height: 120px;
		padding-top: 48px;
	}

	@media (max-width: 520px) {
		.country-section-head-right {
			flex-wrap: wrap;
			justify-content: flex-end;
		}
	}
</style>
