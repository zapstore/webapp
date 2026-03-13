<script>
	import DownloadChart from './DownloadChart.svelte';
	import DownloadIcon from '$lib/components/icons/Download.svelte';
	import ZapIcon from '$lib/components/icons/Zap.svelte';
	import InsightsIcon from '$lib/components/icons/Insights.svelte';
	import InboxIcon from '$lib/components/icons/Inbox.svelte';
	import ChevronDownIcon from '$lib/components/icons/ChevronDown.svelte';

	let activeNav = $state('insights');
	let dlDropdownOpen = $state(false);
	let selectedDlTimeframe = $state('30 Days');
	let zapDropdownOpen = $state(false);
	let selectedZapTimeframe = $state('30 Days');

	const timeframes = ['7 Days', '30 Days', '90 Days', '1 Year'];

	const navItems = [
		{ id: 'insights', label: 'Insights' },
		{ id: 'inbox', label: 'Inbox' }
	];

	// Total downloads — same formula as DownloadChart dummy data
	const DAYS = 30;
	function wave(i, seed, base, amp) {
		const trend = (i / (DAYS - 1)) * amp * 1.5;
		const s1 = Math.sin(i * 0.9 + seed) * amp * 0.3;
		const s2 = Math.sin(i * 2.5 + seed * 1.4) * amp * 0.18;
		const s3 = Math.sin(i * 0.4 + seed * 2.1) * amp * 0.22;
		return Math.max(2, Math.round(base * 0.4 + trend + s1 + s2 + s3));
	}
	// Downloads total (seeds match DownloadChart defaults)
	const dlApp1 = Array.from({ length: DAYS }, (_, i) => wave(i, 1.2, 68, 42));
	const dlApp2 = Array.from({ length: DAYS }, (_, i) => wave(i, 3.1, 36, 24));
	const totalDownloads = dlApp1.reduce((s, v, i) => s + v + dlApp2[i], 0);
	const formattedTotal = totalDownloads.toLocaleString('en-US');

	// Zaps total (different seeds → different curve)
	const zapApp1 = Array.from({ length: DAYS }, (_, i) => wave(i, 2.4, 28, 18));
	const zapApp2 = Array.from({ length: DAYS }, (_, i) => wave(i, 5.7, 14, 10));
	const totalZaps = zapApp1.reduce((s, v, i) => s + v + zapApp2[i], 0);
	const formattedZaps = totalZaps.toLocaleString('en-US');
</script>

<div class="dashboard-outer container mx-auto px-3 sm:px-6 lg:px-8">
	<div class="dashboard">
		<!-- Sidebar -->
		<aside class="sidebar">
			<nav class="sidebar-nav">
				{#each navItems as item}
					{@const isActive = activeNav === item.id}
					{@const iconColor = isActive ? 'hsl(var(--white66))' : 'hsl(var(--white33))'}
					<button
						class="nav-item"
						class:active={isActive}
						onclick={() => (activeNav = item.id)}
					>
						<span class="icon-wrap">
							{#if item.id === 'insights'}
								<InsightsIcon color={iconColor} strokeWidth={1.4} size={18} />
							{:else}
								<InboxIcon color={iconColor} strokeWidth={1.4} size={18} />
							{/if}
						</span>
						<span class="nav-label">{item.label}</span>
					</button>
				{/each}
			</nav>
		</aside>

		<!-- Content area (border-left acts as the column divider) -->
		<div class="content">
			<!-- Downloads section -->
			<section class="content-section">
				<div class="section-head">
					<div class="dl-meta">
						<DownloadIcon size={24} color="hsl(var(--white33))" />
						<span class="dl-count">{formattedTotal}</span>
					</div>
					<div class="timerange-wrap">
						<button
							class="timerange-btn"
							onclick={() => (dlDropdownOpen = !dlDropdownOpen)}
						>
							<span class="eyebrow-label tr-label">{selectedDlTimeframe}</span>
							<span class="chevron-wrap">
								<ChevronDownIcon variant="outline" color="hsl(var(--white16))" size={12} strokeWidth={1.4} />
							</span>
						</button>
						{#if dlDropdownOpen}
							<div class="tr-dropdown">
								{#each timeframes as tf}
									<button
										class="tr-option"
										class:tr-selected={tf === selectedDlTimeframe}
										onclick={() => { selectedDlTimeframe = tf; dlDropdownOpen = false; }}
									>
										{tf}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
				<div class="chart-area">
					<DownloadChart
						chartId="dl"
						color0="#5445FF"
						color1="#636AFF"
						glowColor="#5445FF"
						dotColor="#5C5FFF"
						seedA={1.2}
						seedB={3.1}
					/>
				</div>
			</section>

			<!-- Zaps section -->
			<section class="content-section">
				<div class="section-head">
					<div class="dl-meta">
						<ZapIcon size={24} color="hsl(var(--white33))" />
						<span class="dl-count">{formattedZaps}</span>
					</div>
					<div class="timerange-wrap">
						<button
							class="timerange-btn"
							onclick={() => (zapDropdownOpen = !zapDropdownOpen)}
						>
							<span class="eyebrow-label tr-label">{selectedZapTimeframe}</span>
							<span class="chevron-wrap">
								<ChevronDownIcon variant="outline" color="hsl(var(--white16))" size={12} strokeWidth={1.4} />
							</span>
						</button>
						{#if zapDropdownOpen}
							<div class="tr-dropdown">
								{#each timeframes as tf}
									<button
										class="tr-option"
										class:tr-selected={tf === selectedZapTimeframe}
										onclick={() => { selectedZapTimeframe = tf; zapDropdownOpen = false; }}
									>
										{tf}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
				<div class="chart-area">
					<DownloadChart
						chartId="zap"
						color0="#CC7A00"
						color1="#FFB237"
						glowColor="#FFB237"
						glowOpacity={0.12}
						dotColor="#FFB237"
						seedA={2.4}
						seedB={5.7}
					/>
				</div>
			</section>
		</div>
	</div>
</div>

<style>
	/* ── Outer layout ─────────────────────────────────────────────────────── */
	.dashboard {
		display: flex;
		min-height: calc(100dvh - 64px);
		border-left: 1px solid hsl(var(--border));
		border-right: 1px solid hsl(var(--border));
		margin-left: -16px;
		margin-right: -16px;
	}

	@media (max-width: 639px) {
		.dashboard {
			margin-left: -4px;
			margin-right: -4px;
		}
	}

	/* ── Sidebar ──────────────────────────────────────────────────────────── */
	.sidebar {
		width: 260px;
		flex-shrink: 0;
		padding: 12px;
		display: flex;
		flex-direction: column;
	}

	.sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: hsl(var(--white66));
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: color 0.15s, background 0.15s;
	}

	.nav-item:hover:not(.active) {
		background: hsl(var(--white8));
	}

	.nav-item.active {
		color: hsl(var(--foreground));
		background: hsl(var(--white8));
	}

	/* Fixed-width icon container for consistent alignment */
	.icon-wrap {
		width: 18px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* ── Column divider ───────────────────────────────────────────────────── */
	.content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		border-left: 1px solid hsl(var(--border));
	}

	.content-section {
		position: relative;
		padding: 18px 26px 26px;
		border-bottom: 1px solid hsl(var(--border));
	}

	/* ── Section header — floats over the graph ───────────────────────────── */
	.section-head {
		position: absolute;
		top: 18px;
		left: 26px;
		right: 26px;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.dl-meta {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		padding-top: 8px;
	}

	.dl-count {
		font-size: 32px;
		font-weight: 600;
		color: hsl(var(--foreground));
		line-height: 1;
		letter-spacing: -0.02em;
	}

	/* ── Timerange dropdown ───────────────────────────────────────────────── */
	.timerange-wrap {
		position: relative;
		align-self: flex-start;
	}

	.timerange-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: transparent;
		border: none;
		cursor: pointer;
		border-radius: 6px;
		transition: background 0.15s;
	}

	.timerange-btn:hover {
		background: hsl(var(--white8));
	}

	/* .eyebrow-label global class handles size/weight/spacing/uppercase */
	.tr-label {
		color: hsl(var(--white33));
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

	/* ── Chart area ───────────────────────────────────────────────────────── */
	.chart-area {
		width: 100%;
	}
</style>
