<script>
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';

	/**
	 * @typedef {{ source: string, label: string, impressions: number, downloads: number }} PlatformRow
	 */

	let {
		rows = /** @type {PlatformRow[]} */ ([]),
		loading = false
	} = $props();

	const maxImp = $derived(Math.max(1, ...rows.map((r) => r.impressions)));
	const maxDl = $derived(Math.max(1, ...rows.map((r) => r.downloads)));

	/** Source key → platform emoji. */
	function platformEmoji(/** @type {string} */ source) {
		switch (String(source ?? '').toLowerCase()) {
			case 'web': return '🌐';
			case 'app': return '📱';
			default: return '❔';
		}
	}

	function pct(value, max) {
		return `${Math.min(100, Math.round((value / max) * 100))}%`;
	}
</script>

<div class="platform-chart">
	{#if loading}
		<div class="platform-skel-grid" aria-hidden="true">
			{#each [1, 2, 3] as i (i)}
				<div class="platform-skel-row">
					<div class="platform-skel-label"><SkeletonLoader /></div>
					<div class="platform-skel-bars">
						<div class="platform-skel-metric-line">
							<div class="platform-skel-bar"><SkeletonLoader /></div>
							<div class="platform-skel-num"><SkeletonLoader /></div>
						</div>
						<div class="platform-skel-metric-line">
							<div class="platform-skel-bar platform-skel-bar--dl"><SkeletonLoader /></div>
							<div class="platform-skel-num"><SkeletonLoader /></div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if rows.length === 0}
		<p class="platform-empty">
			No platform data for this range. Subscription IDs must start with <code>web-</code> or
			<code>app-</code>; downloads require the <code>X-Zapstore-Client</code> header on Blossom
			fetches.
		</p>
	{:else}
		<ul class="platform-list">
			{#each rows as row (row.source)}
				{@const emoji = platformEmoji(row.source)}
				<li class="platform-row">
					<div class="platform-name" title={row.label}>
						{#if emoji}
							<span class="platform-icon" aria-hidden="true">{emoji}</span>
						{/if}
						<span class="platform-name-text">{row.label}</span>
					</div>
					<div class="platform-metrics">
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
	.platform-chart {
		width: 100%;
	}

	.platform-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.platform-row {
		display: grid;
		grid-template-columns: clamp(52px, 22%, 96px) minmax(0, 1fr);
		gap: 8px 10px;
		align-items: center;
	}

	.platform-name {
		display: flex;
		align-items: baseline;
		gap: 6px;
		min-width: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--white66);
		line-height: 1.3;
		padding-top: 2px;
	}

	.platform-icon {
		flex-shrink: 0;
		font-size: 1rem;
		line-height: 1;
	}

	.platform-name-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.platform-metrics {
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
		background: var(--white8);
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
		background: linear-gradient(90deg, var(--white33), var(--white66));
	}

	.bar-fill--dl {
		background: linear-gradient(90deg, #5445ff, #636aff);
	}

	.metric-num {
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: var(--white66);
		min-width: 3.25rem;
		text-align: right;
		flex-shrink: 0;
	}

	.metric-num--zero {
		color: var(--white33);
	}

	.platform-empty {
		font-size: 13px;
		color: var(--white33);
		line-height: 1.45;
		margin: 0;
	}

	.platform-empty code {
		font-family: monospace;
		font-size: 12px;
		color: var(--white33);
		background: var(--white8);
		padding: 1px 4px;
		border-radius: 3px;
	}

	/* ── Skeleton ────────────────────────────────────────────────────────── */
	.platform-skel-grid {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.platform-skel-row {
		display: grid;
		grid-template-columns: clamp(52px, 22%, 96px) minmax(0, 1fr);
		gap: 8px 10px;
		align-items: center;
	}

	.platform-skel-bars {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}

	.platform-skel-metric-line {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 10px;
		align-items: center;
	}

	.platform-skel-label {
		height: 14px;
		border-radius: 6px;
		overflow: hidden;
		max-width: 72px;
	}

	.platform-skel-bar {
		height: 8px;
		border-radius: 4px;
		overflow: hidden;
		min-width: 0;
	}

	.platform-skel-bar--dl {
		opacity: 0.85;
	}

	.platform-skel-num {
		width: 3.25rem;
		height: 12px;
		border-radius: 4px;
		overflow: hidden;
		flex-shrink: 0;
	}
</style>
