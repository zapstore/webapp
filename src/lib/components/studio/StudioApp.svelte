<script>
	import DownloadChart from './DownloadChart.svelte';
	import DownloadIcon from '$lib/components/icons/Download.svelte';
	import ZapIcon from '$lib/components/icons/Zap.svelte';
	import InsightsIcon from '$lib/components/icons/Insights.svelte';
	import ImpressionIcon from '$lib/components/icons/Impression.svelte';
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
		STUDIO_DAYS,
		buildDummyAppData,
		totalCount
	} from './studio-config.js';
	import { queryEvents, putEvents } from '$lib/nostr/dexie.js';
	import { parseApp } from '$lib/nostr/models.js';
	import { fetchAppsByAuthorFromRelays } from '$lib/nostr/service.js';
	import { DEFAULT_CATALOG_RELAYS } from '$lib/config.js';
	import {
		buildIsoDateRange,
		fetchImpressions,
		loadDownloadAppData,
		mapImpressionRowsToAppData,
		npubToHex,
		timeframeToDays
	} from '$lib/studio/analytics-http.js';
	import { collectBlobHashesForDeveloper } from '$lib/studio/collect-blob-hashes.js';

	let activeNav = $state('insights');
	let dlDropdownOpen = $state(false);
	let selectedDlTimeframe = $state('30 Days');
	let impDropdownOpen = $state(false);
	let selectedImpTimeframe = $state('30 Days');
	let zapDropdownOpen = $state(false);
	let selectedZapTimeframe = $state('30 Days');
	let mobileMenuOpen = $state(false);

	/** Bumps when insights time ranges change; stale async loads must not overwrite UI. */
	let studioLoadGeneration = 0;

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

	const dlInsightDays = $derived(timeframeToDays(selectedDlTimeframe));
	const impInsightDays = $derived(timeframeToDays(selectedImpTimeframe));

	// Sidebar app list — real apps when signed in, dummies in DUMMY_MODE.
	let userApps = $state(DUMMY_MODE ? DUMMY_APPS : []);

	/** Hex pubkey for the studio dashboard (TEST_PUBKEY or NIP-07); drives activity feed filters. */
	let studioPubkey = $state(/** @type {string | null} */ (null));

	// ── App detail view ──────────────────────────────────────────────────────
	// When set, show the app detail panel instead of the overview charts.
	let selectedApp = $state(null);
	/** True while the inbox thread modal is open — used to lock .content scroll. */
	let inboxThreadOpen = $state(false);

	// Header totals (download chart / zap chart / impression chart).
	const formattedImpressions = $derived(impAppData ? totalCount(impAppData).toLocaleString('en-US') : '—');
	const formattedDownloads = $derived(dlAppData ? totalCount(dlAppData).toLocaleString('en-US') : '—');
	const formattedZaps = $derived(zapAppData ? totalCount(zapAppData).toLocaleString('en-US') : '—');

	// ── Real data loading (only runs when DUMMY_MODE = false) ───────────────
	$effect(() => {
		if (DUMMY_MODE) return;
		selectedImpTimeframe;
		selectedDlTimeframe;
		const impD = timeframeToDays(selectedImpTimeframe);
		const dlD = timeframeToDays(selectedDlTimeframe);
		studioLoadGeneration += 1;
		const gen = studioLoadGeneration;
		loadStudioData(gen, impD, dlD).catch((err) => {
			console.error('[Studio] data load failed:', err);
		});
	});

	/** TEST_PUBKEY or NIP-07 hex pubkey (lowercase). No extension required when TEST_PUBKEY is set. */
	async function resolveStudioPubkeyHex() {
		const raw = TEST_PUBKEY == null || TEST_PUBKEY === '' ? '' : String(TEST_PUBKEY).trim();
		if (raw) {
			try {
				return npubToHex(raw);
			} catch (e) {
				console.error('[Studio] Invalid TEST_PUBKEY in studio-config.js:', e);
				return null;
			}
		}
		if (typeof window !== 'undefined' && window.nostr) {
			try {
				const pk = await window.nostr.getPublicKey();
				return String(pk).toLowerCase();
			} catch {
				return null;
			}
		}
		return null;
	}

	function studioLoadStale(gen) {
		return gen !== studioLoadGeneration;
	}

	/**
	 * @param {number} gen
	 * @param {number} impDays
	 * @param {number} dlDays
	 */
	async function loadStudioData(gen, impDays, dlDays) {
		const impRange = buildIsoDateRange(impDays);
		const dlRange = buildIsoDateRange(dlDays);

		const pubkey = await resolveStudioPubkeyHex();
		if (studioLoadStale(gen)) return;
		if (!pubkey) {
			console.warn(
				'[Studio] Set TEST_PUBKEY in studio-config.js (npub or hex) or unlock NIP-07 to load apps and analytics.'
			);
			studioPubkey = null;
			userApps = [];
			impAppData = null;
			dlAppData = null;
			return;
		}

		studioPubkey = pubkey;

		let events = await queryEvents({ kinds: [32267], authors: [pubkey] });
		if (studioLoadStale(gen)) return;
		if (events.length === 0) {
			events = await fetchAppsByAuthorFromRelays(DEFAULT_CATALOG_RELAYS, pubkey);
			if (events.length > 0) await putEvents(events);
		}
		if (studioLoadStale(gen)) return;

		const parsedApps = events.map(parseApp);
		userApps = parsedApps.map((a) => ({
			id: a.dTag,
			name: a.name,
			icon: a.icon ?? '',
			description: a.description ?? ''
		}));

		if (parsedApps.length === 0) {
			impAppData = null;
			dlAppData = null;
			return;
		}

		let v1ImpressionsOk = false;

		try {
			const impRows = await fetchImpressions(pubkey, {
				from: impRange.from,
				to: impRange.to,
				groupBy: 'app_id,day'
			});
			if (studioLoadStale(gen)) return;
			impAppData = mapImpressionRowsToAppData(userApps, impRows, impDays);
			v1ImpressionsOk = true;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg === 'ANALYTICS_HTTP_DISABLED') {
				console.warn(
					'[Studio] v1 analytics proxy disabled. Set STUDIO_ANALYTICS_HTTP_URL in .env (e.g. http://127.0.0.1:3336) and restart the dev server.'
				);
			} else {
				console.warn('[Studio] v1 impressions failed:', err);
			}
			if (!studioLoadStale(gen)) impAppData = null;
		}

		try {
			const hashMap = await collectBlobHashesForDeveloper(pubkey, userApps);
			if (studioLoadStale(gen)) return;
			dlAppData = await loadDownloadAppData(userApps, hashMap, dlRange, dlDays);
		} catch (err) {
			console.warn('[Studio] v1 downloads failed:', err);
			if (!studioLoadStale(gen)) dlAppData = null;
		}

		if (!v1ImpressionsOk && !studioLoadStale(gen)) {
			await loadLegacyNip98Impressions(pubkey, impDays, gen);
		}
	}

	/**
	 * Legacy relay analytics behind /api/studio/analytics (NIP-98).
	 * @param {string} pubkeyHex
	 * @param {number} days
	 * @param {number} gen
	 */
	async function loadLegacyNip98Impressions(pubkeyHex, days, gen) {
		const apiUrl = `${location.origin}/api/studio/analytics?pubkey=${pubkeyHex}`;

		if (!window.nostr) {
			console.warn('[Studio] No NIP-07 — legacy impressions skipped (v1 downloads unchanged if loaded).');
			if (!studioLoadStale(gen)) impAppData = null;
			return;
		}

		let authEvent;
		try {
			authEvent = await window.nostr.signEvent({
				kind: 27235,
				created_at: Math.floor(Date.now() / 1000),
				tags: [
					['u', apiUrl],
					['method', 'GET']
				],
				content: ''
			});
		} catch {
			if (!studioLoadStale(gen)) impAppData = null;
			return;
		}

		if (studioLoadStale(gen)) return;

		const res = await fetch(apiUrl, {
			headers: { Authorization: `Nostr ${btoa(JSON.stringify(authEvent))}` }
		});

		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			if (res.status === 503) {
				console.warn('[Studio] Legacy analytics not configured:', body.error);
			} else if (res.status === 401) {
				console.error('[Studio] Legacy analytics auth failed');
			} else {
				console.warn('[Studio] Legacy analytics error:', res.status, body.error);
			}
			if (!studioLoadStale(gen)) impAppData = null;
			return;
		}

		if (studioLoadStale(gen)) return;

		const data = await res.json();
		if (!studioLoadStale(gen)) {
			impAppData = mapImpressionRowsToAppData(userApps, data.impressions ?? [], days);
		}
	}
</script>

<div class="dashboard-outer container mx-auto px-0 sm:px-6 lg:px-8">
	<div class="dashboard">
		<!-- Mobile nav — sheet from below header; does not cover site navbar -->
		<div class="mobile-nav">
			<button
				type="button"
				class="mobile-nav-zone"
				onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
				aria-expanded={mobileMenuOpen}
				aria-haspopup="true"
			>
				<span class="mobile-nav-label">{activeNavLabel}</span>
				<span class="mobile-chevron" class:open={mobileMenuOpen}>
					<ChevronDownIcon
						variant="outline"
						color="hsl(var(--white33))"
						size={14}
						strokeWidth={1.4}
					/>
				</span>
			</button>
			{#if mobileMenuOpen}
				<div class="mobile-nav-panel" role="dialog" aria-modal="true" aria-label="Studio navigation">
					<div class="mobile-nav-content">
						<nav class="sidebar-nav">
							{#each navItems as item (item.id)}
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
					<button
						type="button"
						class="mobile-nav-rest"
						onclick={() => (mobileMenuOpen = false)}
						aria-label="Close menu"
					></button>
				</div>
			{/if}
		</div>

		<!-- Sidebar — hidden on mobile -->
		<aside class="sidebar">
			<nav class="sidebar-nav">
				{#each navItems as item (item.id)}
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
					chartDayCount={dlInsightDays}
					dlCounts={dlAppData?.find((a) => a.id === selectedApp.id)?.counts ?? []}
					impCounts={impAppData?.find((a) => a.id === selectedApp.id)?.counts ?? []}
					zapCounts={zapAppData?.find((a) => a.id === selectedApp.id)?.counts ?? []}
					onBack={() => (selectedApp = null)}
				/>
			{:else if activeNav === 'inbox'}
				<!-- Inbox: comments on your apps. Scrolls inside .content so modals stay in viewport. -->
				<section class="activity-section inbox-section inbox-scroll" class:scroll-locked={inboxThreadOpen}>
					<StudioAppActivity devPubkey={studioPubkey} apps={userApps} bind:threadModalOpen={inboxThreadOpen} />
				</section>
			{:else}
				<!-- Insights: wrap in scrollable div so .content itself stays overflow:hidden -->
				<div class="insights-scroll">
				<section class="content-section">
					<div class="section-head">
						<div class="dl-meta">
							<DownloadIcon size={24} color="hsl(var(--blurpleColor66))" />
							<span class="dl-count">{formattedDownloads}</span>
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
									{#each timeframes as tf (tf)}
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
							dayCount={DUMMY_MODE ? STUDIO_DAYS : dlInsightDays}
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
									{#each timeframes as tf (tf)}
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
							dayCount={STUDIO_DAYS}
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

				<section class="content-section">
					<div class="section-head">
						<div class="dl-meta">
							<ImpressionIcon size={24} />
							<span class="dl-count">{formattedImpressions}</span>
						</div>
						<div class="timerange-wrap">
							<button class="timerange-btn" onclick={() => (impDropdownOpen = !impDropdownOpen)}>
								<span class="eyebrow-label tr-label">{selectedImpTimeframe}</span>
								<span class="chevron-wrap">
									<ChevronDownIcon
										variant="outline"
										color="hsl(var(--white16))"
										size={12}
										strokeWidth={1.4}
									/>
								</span>
							</button>
							{#if impDropdownOpen}
								<div class="tr-dropdown">
									{#each timeframes as tf (tf)}
										<button
											class="tr-option"
											class:tr-selected={tf === selectedImpTimeframe}
											onclick={() => {
												selectedImpTimeframe = tf;
												impDropdownOpen = false;
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
							chartId="imp"
							dayCount={DUMMY_MODE ? STUDIO_DAYS : impInsightDays}
							color0="hsl(var(--white33))"
							color1="hsl(var(--white66))"
							glowColor="hsl(var(--white33))"
							glowOpacity={0.16}
							dotColor="hsl(var(--white66))"
							badgeBg="rgba(52, 52, 58, 0.94)"
							appData={impAppData}
							useImpressionMarkers={true}
						/>
					</div>
				</section>

				<!-- Placeholder for future: summary of active discussions -->
				<section class="activity-section">
					<span class="eyebrow-label activity-eyebrow">Activity</span>
					<p class="activity-empty">Nothing here yet.</p>
				</section>
				</div><!-- /insights-scroll -->
			{/if}
		</div>
	</div>
</div>

<style>
	/* ── Outer layout ─────────────────────────────────────────────────────── */
	.dashboard {
		display: flex;
		height: calc(100dvh - 64px);
		min-height: 0;
		overflow: hidden;
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
			flex-direction: column;
		}
	}

	/* ── Sidebar ──────────────────────────────────────────────────────────── */
	.sidebar {
		width: 260px;
		flex-shrink: 0;
		padding: 12px;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}

	.sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex-shrink: 0;
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

	/* Scroll long app lists inside fixed-height sidebar; mobile sheet uses natural height */
	.sidebar > .apps-section {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
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
		flex-shrink: 0;
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
		.dashboard-outer {
			overflow-x: hidden;
			max-width: 100%;
		}

		.sidebar {
			display: none;
		}

		.mobile-nav {
			display: block;
			position: relative;
			z-index: 90;
			overflow-x: hidden;
			max-width: 100%;
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

		/* Sheet from below switcher row to bottom; site header stays visible */
		.mobile-nav-panel {
			position: fixed;
			z-index: 89;
			left: 0;
			right: 0;
			top: calc(64px + 2.625rem);
			bottom: 0;
			display: flex;
			flex-direction: column;
			background: hsl(var(--background));
			border-top: 1px solid hsl(var(--border));
			box-shadow: 0 12px 40px hsl(var(--black) / 0.35);
			overflow: hidden;
			overflow-x: hidden;
			max-width: 100%;
		}

		.mobile-nav-content {
			flex-shrink: 0;
			max-height: 55dvh;
			overflow-y: auto;
			overflow-x: hidden;
			padding: 8px 4px 8px;
			display: flex;
			flex-direction: column;
			max-width: 100%;
		}

		.mobile-nav-rest {
			flex: 1;
			min-height: 0;
			width: 100%;
			margin: 0;
			padding: 0;
			border: none;
			background: hsl(var(--black) / 0.35);
			cursor: default;
		}

		/* Docs & Tools: natural flow inside scrollable nav (no pin-to-bottom in sheet) */
		.mobile-nav-content .sidebar-section {
			margin-top: 16px;
			/* Desktop sidebar uses negative horizontal margins; those overflow the mobile sheet */
			margin-left: 0;
			margin-right: 0;
			padding-left: 12px;
			padding-right: 12px;
		}

		/* On mobile the dashboard stacks vertically (flex-direction set in base 767px block) */
		.dashboard {
			overflow-x: hidden;
			max-width: 100%;
		}
	}

	/* ── Column divider ───────────────────────────────────────────────────── */
	.content {
		flex: 1;
		min-width: 0;
		min-height: 0;
		/* overflow:hidden + transform so position:fixed children (thread modal) are
		   contained to this pane and never scroll with the feed */
		overflow: hidden;
		display: flex;
		flex-direction: column;
		border-left: 1px solid hsl(var(--border));
		position: relative;
		transform: translateZ(0);
	}

	/* Inbox section fills .content and scrolls internally */
	.inbox-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.inbox-scroll.scroll-locked {
		overflow-y: hidden;
	}

	/* Insights sections scroll inside their own wrapper */
	.insights-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	@media (max-width: 767px) {
		.content {
			border-left: none;
		}
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

	/* Match community /activity: list has no top padding; first row uses item padding only */
	.inbox-section {
		padding: 0 20px 16px;
	}

	.activity-eyebrow {
		color: hsl(var(--white33));
	}

	.activity-empty {
		font-size: 13px;
		color: hsl(var(--white33));
	}
</style>
