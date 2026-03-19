<script>
	import DownloadChart from './DownloadChart.svelte';
	import DownloadIcon from '$lib/components/icons/Download.svelte';
	import ZapIcon from '$lib/components/icons/Zap.svelte';
	import InsightsIcon from '$lib/components/icons/Insights.svelte';
	import InboxIcon from '$lib/components/icons/Inbox.svelte';
	import ChevronDownIcon from '$lib/components/icons/ChevronDown.svelte';
	import StudioAppDetail from './StudioAppDetail.svelte';
	import StudioAppActivity from './StudioAppActivity.svelte';
	import {
		DUMMY_MODE,
		TEST_PUBKEY,
		DUMMY_APPS,
		DL_SEEDS,
		ZAP_SEEDS,
		IMP_SEEDS,
		buildDummyAppData,
		totalCount
	} from './studio-config.js';
	import { queryEvents, putEvents } from '$lib/nostr/dexie.js';
	import { parseApp } from '$lib/nostr/models.js';
	import { fetchAppsByAuthorFromRelays } from '$lib/nostr/service.js';
	import { DEFAULT_CATALOG_RELAYS } from '$lib/config.js';
	import { nip19 } from 'nostr-tools';

	let activeNav = $state('insights');
	let dlDropdownOpen = $state(false);
	let selectedDlTimeframe = $state('30 Days');
	let zapDropdownOpen = $state(false);
	let selectedZapTimeframe = $state('30 Days');
	let mobileMenuOpen = $state(false);

	const timeframes = ['7 Days', '30 Days', '90 Days', '1 Year'];

	const navItems = [
		{ id: 'insights', label: 'Insights' },
		{ id: 'inbox', label: 'Inbox' }
	];

	const activeNavLabel = $derived(navItems.find((n) => n.id === activeNav)?.label ?? 'Insights');

	function selectNav(id) {
		activeNav = id;
		selectedApp = null;
		mobileMenuOpen = false;
	}

	function selectApp(app) {
		selectedApp = selectedApp?.id === app.id ? null : app;
		mobileMenuOpen = false;
	}

	// ── App data passed to charts ───────────────────────────────────────────
	// Shape: Array<{ id, name, icon, counts: number[] }> | null
	// null → DownloadChart falls back to its own wave generator (same visual).
	//
	// In DUMMY_MODE we pre-fill with wave data so the totals in the header
	// always match what the chart is showing (single source of truth).
	let dlAppData = $state(DUMMY_MODE ? buildDummyAppData(DL_SEEDS) : null);
	let zapAppData = $state(DUMMY_MODE ? buildDummyAppData(ZAP_SEEDS) : null);
	let impAppData = $state(DUMMY_MODE ? buildDummyAppData(IMP_SEEDS) : null);

	// Sidebar app list — real apps when signed in, dummies in DUMMY_MODE.
	let userApps = $state(DUMMY_MODE ? DUMMY_APPS : []);

	/** Hex pubkey for the studio dashboard (TEST_PUBKEY or NIP-07); drives activity feed filters. */
	let studioPubkey = $state(/** @type {string | null} */ (null));

	// ── App detail view ──────────────────────────────────────────────────────
	// When set, show the app detail panel instead of the overview charts.
	let selectedApp = $state(null);

	// Header totals — derived from the same appData the charts consume.
	const formattedTotal = $derived(dlAppData ? totalCount(dlAppData).toLocaleString('en-US') : '—');
	const formattedZaps = $derived(zapAppData ? totalCount(zapAppData).toLocaleString('en-US') : '—');

	// ── Real data loading (only runs when DUMMY_MODE = false) ───────────────
	$effect(() => {
		if (DUMMY_MODE) return;
		loadStudioData().catch((err) => {
			// Graceful degradation: chart falls back to wave generator (appData stays null).
			console.error('[Studio] data load failed:', err);
		});
	});

	async function loadStudioData() {
		// Resolve pubkey: TEST_PUBKEY override → NIP-07 → bail
		let pubkey = TEST_PUBKEY
			? TEST_PUBKEY.startsWith('npub1')
				? /** @type {string} */ (nip19.decode(TEST_PUBKEY).data)
				: TEST_PUBKEY
			: null;

		if (!pubkey) {
			if (!window.nostr) throw new Error('NIP-07 extension not found');
			pubkey = await window.nostr.getPublicKey();
		}

		studioPubkey = pubkey;

		// 1. Fetch this developer's published apps — Dexie first, relay fallback.
		let events = await queryEvents({ kinds: [32267], authors: [pubkey] });
		if (events.length === 0) {
			events = await fetchAppsByAuthorFromRelays(DEFAULT_CATALOG_RELAYS, pubkey);
			if (events.length > 0) await putEvents(events);
		}

		const parsedApps = events.map(parseApp);
		userApps = parsedApps.map((a) => ({
			id: a.dTag,
			name: a.name,
			icon: a.icon ?? '',
			description: a.description ?? ''
		}));

		if (parsedApps.length === 0) return; // no apps — charts keep wave fallback

		// 2. Fetch analytics from the SvelteKit server route (NIP-98 authenticated).
		// Pass the target pubkey as a query param so the server queries the right data
		// even when TEST_PUBKEY differs from the signed-in NIP-07 key.
		const apiUrl = `${location.origin}/api/studio/analytics?pubkey=${pubkey}`;

		let authEvent;
		if (window.nostr) {
			authEvent = await window.nostr.signEvent({
				kind: 27235,
				created_at: Math.floor(Date.now() / 1000),
				tags: [
					['u', apiUrl],
					['method', 'GET']
				],
				content: ''
			});
		} else {
			// No NIP-07 extension — skip analytics, charts keep wave fallback.
			console.warn('[Studio] No NIP-07 extension found — analytics skipped');
			return;
		}

		const res = await fetch(apiUrl, {
			headers: { Authorization: `Nostr ${btoa(JSON.stringify(authEvent))}` }
		});

		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			if (res.status === 503) {
				console.warn('[Studio] Analytics DB not configured on server:', body.error);
			} else if (res.status === 401) {
				console.error('[Studio] Analytics auth failed — check NIP-07 extension is unlocked');
			} else {
				throw new Error(`Analytics API ${res.status}: ${body.error ?? 'unknown'}`);
			}
			return;
		}

		const data = await res.json();

		// 3. Align impression rows to appData shape for DownloadChart.
		//    Impressions keyed by app_id = app dTag.
		dlAppData = mapImpressionsToAppData(userApps, data.impressions ?? []);

		// TODO: wire zapAppData once zap fetch is implemented.
	}

	// Align per-app impression rows to the 30-day window.
	function mapImpressionsToAppData(apps, rows) {
		// Build { appId → { isoDate → count } } index.
		/** @type {Map<string, Map<string, number>>} */
		const byApp = new Map();
		for (const row of rows) {
			if (!byApp.has(row.app_id)) byApp.set(row.app_id, new Map());
			byApp.get(row.app_id).set(row.date, row.count);
		}

		// Build date strings for the last 30 days in ISO format (YYYY-MM-DD).
		const today = new Date();
		const isoDates = Array.from({ length: 30 }, (_, i) => {
			const d = new Date(today);
			d.setDate(d.getDate() - (29 - i));
			return d.toISOString().split('T')[0];
		});

		return apps.map((app) => {
			const dayMap = byApp.get(app.id) ?? new Map();
			return {
				id: app.id,
				name: app.name,
				icon: app.icon,
				counts: isoDates.map((iso) => dayMap.get(iso) ?? 0)
			};
		});
	}
</script>

<div class="dashboard-outer container mx-auto px-0 sm:px-6 lg:px-8">
	<div class="dashboard">
		<!-- Mobile nav zone — replaces sidebar on small screens -->
		<div class="mobile-nav">
			{#if mobileMenuOpen}
				<!-- Full-screen overlay when open -->
				<div class="mobile-nav-panel">
					<!-- Close zone at top (mirrors the closed state) -->
					<button class="mobile-nav-zone" onclick={() => (mobileMenuOpen = false)}>
						<span class="mobile-nav-label">{activeNavLabel}</span>
						<span class="mobile-chevron open">
							<ChevronDownIcon
								variant="outline"
								color="hsl(var(--white33))"
								size={14}
								strokeWidth={1.4}
							/>
						</span>
					</button>
					<div class="mobile-nav-content">
						<nav class="sidebar-nav">
							{#each navItems as item}
								{@const isActive = activeNav === item.id && selectedApp === null}
								{@const iconColor = isActive ? 'hsl(var(--white66))' : 'hsl(var(--white33))'}
								<button class="nav-item" class:active={isActive} onclick={() => selectNav(item.id)}>
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
						<div class="apps-section">
							<span class="eyebrow-label apps-eyebrow">Your Apps</span>
							{#each userApps as app (app.id)}
								<button
									class="nav-item"
									class:active={selectedApp?.id === app.id}
									onclick={() => selectApp(app)}
								>
									<span class="icon-wrap">
										<img src={app.icon} alt={app.name} class="app-img" />
									</span>
									<span class="nav-label">{app.name}</span>
								</button>
							{/each}
						</div>
						<div class="sidebar-section">
							<span class="eyebrow-label section-eyebrow">Docs &amp; Tools</span>
							<a href="/docs" class="nav-item" onclick={() => (mobileMenuOpen = false)}>
								<span class="nav-label">Documentation</span>
							</a>
							<a
								href="https://github.com/zapstore/zsp"
								class="nav-item"
								target="_blank"
								rel="noopener noreferrer"
								onclick={() => (mobileMenuOpen = false)}
							>
								<span class="nav-label">ZSP</span>
							</a>
						</div>
					</div>
				</div>
			{:else}
				<!-- Collapsed zone trigger -->
				<button class="mobile-nav-zone" onclick={() => (mobileMenuOpen = true)}>
					<span class="mobile-nav-label">{activeNavLabel}</span>
					<span class="mobile-chevron">
						<ChevronDownIcon
							variant="outline"
							color="hsl(var(--white33))"
							size={14}
							strokeWidth={1.4}
						/>
					</span>
				</button>
			{/if}
		</div>

		<!-- Sidebar — hidden on mobile -->
		<aside class="sidebar">
			<nav class="sidebar-nav">
				{#each navItems as item}
					{@const isActive = activeNav === item.id && selectedApp === null}
					{@const iconColor = isActive ? 'hsl(var(--white66))' : 'hsl(var(--white33))'}
					<button class="nav-item" class:active={isActive} onclick={() => selectNav(item.id)}>
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

			<!-- Your Apps section -->
			<div class="apps-section">
				<span class="eyebrow-label apps-eyebrow">Your Apps</span>
				{#each userApps as app (app.id)}
					<button
						class="nav-item"
						class:active={selectedApp?.id === app.id}
						onclick={() => selectApp(app)}
					>
						<span class="icon-wrap">
							<img src={app.icon} alt={app.name} class="app-img" />
						</span>
						<span class="nav-label">{app.name}</span>
					</button>
				{/each}
			</div>

			<!-- Docs & Tools section — pinned to bottom of sidebar -->
			<div class="sidebar-section">
				<span class="eyebrow-label section-eyebrow">Docs &amp; Tools</span>
				<a href="/docs" class="nav-item">
					<span class="nav-label">Documentation</span>
				</a>
				<a
					href="https://github.com/zapstore/zsp"
					class="nav-item"
					target="_blank"
					rel="noopener noreferrer"
				>
					<span class="nav-label">ZSP</span>
				</a>
			</div>
		</aside>

		<!-- Content area (border-left acts as the column divider) -->
		<div class="content">
			{#if selectedApp !== null}
				<StudioAppDetail
					app={selectedApp}
					dlCounts={dlAppData?.find((a) => a.id === selectedApp.id)?.counts ?? []}
					impCounts={impAppData?.find((a) => a.id === selectedApp.id)?.counts ?? []}
					zapCounts={zapAppData?.find((a) => a.id === selectedApp.id)?.counts ?? []}
					onBack={() => (selectedApp = null)}
				/>
			{:else if activeNav === 'inbox'}
				<!-- Inbox: comments on your apps (no header) -->
				<section class="activity-section inbox-section">
					<StudioAppActivity devPubkey={studioPubkey} apps={userApps} />
				</section>
			{:else}
				<!-- Insights: downloads + zaps + placeholder for future active-discussions summary -->
				<section class="content-section">
					<div class="section-head">
						<div class="dl-meta">
							<DownloadIcon size={24} color="hsl(var(--blurpleColor66))" />
							<span class="dl-count">{formattedTotal}</span>
						</div>
						<div class="timerange-wrap">
							<button class="timerange-btn" onclick={() => (dlDropdownOpen = !dlDropdownOpen)}>
								<span class="eyebrow-label tr-label">{selectedDlTimeframe}</span>
								<span class="chevron-wrap">
									<ChevronDownIcon
										variant="outline"
										color="hsl(var(--white16))"
										size={12}
										strokeWidth={1.4}
									/>
								</span>
							</button>
							{#if dlDropdownOpen}
								<div class="tr-dropdown">
									{#each timeframes as tf}
										<button
											class="tr-option"
											class:tr-selected={tf === selectedDlTimeframe}
											onclick={() => {
												selectedDlTimeframe = tf;
												dlDropdownOpen = false;
											}}
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
							appData={dlAppData}
						/>
					</div>
				</section>

				<!-- Zaps section -->
				<section class="content-section">
					<div class="section-head">
						<div class="dl-meta">
							<ZapIcon size={24} color="hsl(var(--goldColor66))" />
							<span class="dl-count">{formattedZaps}</span>
						</div>
						<div class="timerange-wrap">
							<button class="timerange-btn" onclick={() => (zapDropdownOpen = !zapDropdownOpen)}>
								<span class="eyebrow-label tr-label">{selectedZapTimeframe}</span>
								<span class="chevron-wrap">
									<ChevronDownIcon
										variant="outline"
										color="hsl(var(--white16))"
										size={12}
										strokeWidth={1.4}
									/>
								</span>
							</button>
							{#if zapDropdownOpen}
								<div class="tr-dropdown">
									{#each timeframes as tf}
										<button
											class="tr-option"
											class:tr-selected={tf === selectedZapTimeframe}
											onclick={() => {
												selectedZapTimeframe = tf;
												zapDropdownOpen = false;
											}}
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
							badgeBg="rgba(90,55,0,0.92)"
							appData={zapAppData}
						/>
					</div>
				</section>

				<!-- Placeholder for future: summary of active discussions -->
				<section class="activity-section">
					<span class="eyebrow-label activity-eyebrow">Activity</span>
					<p class="activity-empty">Nothing here yet.</p>
				</section>
			{/if}
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

	@media (max-width: 767px) {
		.dashboard {
			border-left: none;
			border-right: none;
			margin-left: 0;
			margin-right: 0;
		}

		/* Remove the column divider border that creates a visible left line */
		.content {
			border-left: none;
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
		transition:
			color 0.15s,
			background 0.15s;
	}

	.nav-item:hover:not(.active) {
		background: hsl(var(--white4));
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

	/* ── Your Apps section ────────────────────────────────────────────────── */
	.apps-section {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 16px;
	}

	.apps-eyebrow {
		padding: 0 10px;
		margin-bottom: 4px;
		color: hsl(var(--white33));
		display: block;
	}

	.app-img {
		width: 18px;
		height: 18px;
		border-radius: 4px;
		object-fit: cover;
		flex-shrink: 0;
	}

	/* ── Docs & Tools section — pushed to bottom with full-width divider ─── */
	.sidebar-section {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: auto;
		/* Negative horizontal margins let the border bleed to full sidebar width */
		margin-left: -12px;
		margin-right: -12px;
		padding-top: 16px;
		padding-left: 12px;
		padding-right: 12px;
		border-top: 1px solid hsl(var(--border));
	}

	.section-eyebrow {
		padding: 0 10px;
		margin-bottom: 4px;
		color: hsl(var(--white33));
		display: block;
	}

	/* Nav items that are anchors (Documentation, ZSP) — no icon gap */
	a.nav-item {
		text-decoration: none;
	}

	/* ── Mobile nav ───────────────────────────────────────────────────────── */
	.mobile-nav {
		display: none;
	}

	@media (max-width: 767px) {
		.sidebar {
			display: none;
		}

		.mobile-nav {
			display: block;
		}

		/* Collapsed trigger zone */
		.mobile-nav-zone {
			display: flex;
			align-items: center;
			justify-content: space-between;
			width: 100%;
			padding: 10px 16px;
			background: transparent;
			border: none;
			border-bottom: 1px solid hsl(var(--border));
			cursor: pointer;
			color: hsl(var(--foreground));
		}

		.mobile-nav-label {
			font-size: 14px;
			font-weight: 500;
		}

		.mobile-chevron {
			display: flex;
			align-items: center;
			transition: transform 0.2s;
		}

		.mobile-chevron.open {
			transform: rotate(180deg);
		}

		/* Full-screen overlay panel */
		.mobile-nav-panel {
			position: fixed;
			inset: 0;
			z-index: 100;
			background: hsl(var(--background));
			display: flex;
			flex-direction: column;
			overflow-y: auto;
		}

		/* The close-zone inside the panel mirrors the collapsed zone */
		.mobile-nav-panel .mobile-nav-zone {
			flex-shrink: 0;
		}

		.mobile-nav-content {
			flex: 1;
			padding: 8px 4px 24px;
			display: flex;
			flex-direction: column;
		}

		/* Docs & Tools inside mobile panel also pins to bottom */
		.mobile-nav-content .sidebar-section {
			margin-top: auto;
		}

		/* On mobile the dashboard stacks vertically */
		.dashboard {
			flex-direction: column;
		}
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

	/* ── Chart area ───────────────────────────────────────────────────────── */
	.chart-area {
		width: 100%;
	}

	/* ── Activity section ─────────────────────────────────────────────────── */
	.activity-section {
		padding: 20px 26px 40px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.inbox-section {
		padding: 16px 20px;
	}

	.activity-eyebrow {
		color: hsl(var(--white33));
	}

	.activity-empty {
		font-size: 13px;
		color: hsl(var(--white33));
	}
</style>
