<script>
	import { browser } from '$app/environment';
	import DownloadChart from './DownloadChart.svelte';
	import DownloadIcon from '$lib/components/icons/Download.svelte';
	import ZapIcon from '$lib/components/icons/Zap.svelte';
	import InsightsIcon from '$lib/components/icons/Insights.svelte';
	import ImpressionIcon from '$lib/components/icons/Impression.svelte';
	import InboxIcon from '$lib/components/icons/Inbox.svelte';
	import ChevronDownIcon from '$lib/components/icons/ChevronDown.svelte';
	import StudioAppDetail from './StudioAppDetail.svelte';
	import StudioAppEdit from './StudioAppEdit.svelte';
	import StudioAppActivity from './StudioAppActivity.svelte';
	import StudioCountryChart from './StudioCountryChart.svelte';
	import StudioPlatformChart from './StudioPlatformChart.svelte';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
	import {
		DUMMY_MODE,
		TEST_PUBKEY,
		DUMMY_APPS,
		DUMMY_COUNTRY_ROWS,
		DUMMY_PLATFORM_ROWS,
		DL_SEEDS,
		ZAP_SEEDS,
		IMP_SEEDS,
		STUDIO_DAYS,
		buildDummyAppData,
		isStudioIndexerCatalogPubkey,
		sortStudioIndexerAppsZapstoreFirst,
		totalCountInLastNDays
	} from './studio-config.js';
	import { resolveStudioCatalogPubkey } from '$lib/studio/resolve-studio-catalog-pubkey.js';
	import { getCurrentPubkey, getIsSignedIn, signEvent } from '$lib/stores/auth.svelte.js';
	import { queryEvents, putEvents } from '$lib/nostr/dexie.js';
	import { parseApp } from '$lib/nostr/models.js';
	import { fetchAllAppsByAuthorFromRelays, fetchAppsByAuthorFromRelays } from '$lib/nostr/service.js';
	import { DEFAULT_CATALOG_RELAYS } from '$lib/config.js';
	import {
		buildIsoDateRange,
		fetchImpressions,
		loadCountryBreakdown,
		loadCountryBreakdownForApp,
		loadPlatformBreakdown,
		loadPlatformBreakdownForApp,
		loadDownloadAppData,
		mapImpressionRowsToAppData,
		npubToHex,
		timeframeToDays
	} from '$lib/studio/analytics-http.js';
	import { collectBlobHashesForDeveloper } from '$lib/studio/collect-blob-hashes.js';
	import { loadZapAppData } from '$lib/studio/zap-series.js';

	let activeNav = $state('insights');
	let dlDropdownOpen = $state(false);
	let selectedDlTimeframe = $state('30 Days');
	let impDropdownOpen = $state(false);
	let selectedImpTimeframe = $state('30 Days');
	let countryDropdownOpen = $state(false);
	let selectedCountryTimeframe = $state('30 Days');
	let platformDropdownOpen = $state(false);
	let zapDropdownOpen = $state(false);
	let selectedZapTimeframe = $state('30 Days');
	let mobileMenuOpen = $state(false);

	/** Close insights timeframe menus on outside click (capture so chart hover does not eat it). */
	$effect(() => {
		if (!browser) return;
		if (!dlDropdownOpen && !zapDropdownOpen && !impDropdownOpen && !countryDropdownOpen && !platformDropdownOpen) return;

		const onPointerDown = (/** @type {PointerEvent} */ e) => {
			const t = e.target;
			if (!(t instanceof Element)) return;
			const root = t.closest('[data-studio-dropdown]');
			const id = root?.getAttribute('data-studio-dropdown');

			if (dlDropdownOpen && id !== 'dl') dlDropdownOpen = false;
			if (zapDropdownOpen && id !== 'zap') zapDropdownOpen = false;
			if (impDropdownOpen && id !== 'imp') impDropdownOpen = false;
			if (countryDropdownOpen && id !== 'country') countryDropdownOpen = false;
			if (platformDropdownOpen && id !== 'platform') platformDropdownOpen = false;
		};

		document.addEventListener('pointerdown', onPointerDown, true);
		return () => document.removeEventListener('pointerdown', onPointerDown, true);
	});

	/** Bumps when insights time ranges change; stale async loads must not overwrite UI. */
	let studioLoadGeneration = 0;

	/** App detail: country breakdown async generation (separate from overview). */
	let detailCountryGen = 0;

	/** App detail: platform breakdown async generation (separate from overview). */
	let detailPlatformGen = 0;

	/** Last completed analytics window per series — avoid refetch + skeleton when another chart’s timeframe changes. */
	let prevStudioImpDays = $state(-1);
	let prevStudioDlDays = $state(-1);
	let prevStudioZapDays = $state(-1);
	let prevStudioCountryDays = $state(-1);
	let prevStudioPlatformDays = $state(-1);

	/** Per-chart loading so slow impressions/downloads/zaps/country/platform API do not block each other’s UI. */
	let impChartLoading = $state(!DUMMY_MODE);
	let dlChartLoading = $state(!DUMMY_MODE);
	let zapChartLoading = $state(!DUMMY_MODE);
	let countryChartLoading = $state(!DUMMY_MODE);
	let platformChartLoading = $state(!DUMMY_MODE);

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
		editingApp = false;
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
	let countryRows = $state([...(DUMMY_MODE ? DUMMY_COUNTRY_ROWS : [])]);
	let platformRows = $state([...(DUMMY_MODE ? DUMMY_PLATFORM_ROWS : [])]);
	let detailCountryRows = $state([]);
	let detailCountryLoading = $state(false);
	let detailPlatformRows = $state([]);
	let detailPlatformLoading = $state(false);

	const dlInsightDays = $derived(timeframeToDays(selectedDlTimeframe));
	const impInsightDays = $derived(timeframeToDays(selectedImpTimeframe));
	const zapInsightDays = $derived(timeframeToDays(selectedZapTimeframe));
	const detailChartDays = $derived(
		Math.max(dlInsightDays, impInsightDays, zapInsightDays, 1)
	);

	// Sidebar app list — real apps when signed in, dummies in DUMMY_MODE.
	let userApps = $state(DUMMY_MODE ? DUMMY_APPS : []);

	/** Hex pubkey for the studio dashboard (TEST_PUBKEY or NIP-07); drives activity feed filters. */
	let studioPubkey = $state(/** @type {string | null} */ (null));

	/** Zapstore indexer catalog (Franzaps mapped pubkey) — show loaded app count in sidebar. */
	const showIndexerAppCount = $derived(
		!DUMMY_MODE && studioPubkey != null && isStudioIndexerCatalogPubkey(studioPubkey)
	);

	// ── App detail / edit view ───────────────────────────────────────────────
	// selectedApp: show app detail panel. editingApp: show edit screen.
	let selectedApp = $state(null);
	/** When true, right panel shows StudioAppEdit instead of StudioAppDetail. */
	let editingApp = $state(false);
	/** True while the inbox thread modal is open — used to lock .content scroll. */
	let inboxThreadOpen = $state(false);

	// Header totals (download chart / zap chart / impression chart).
	const formattedImpressions = $derived(
		impAppData ? totalCountInLastNDays(impAppData, impInsightDays).toLocaleString('en-US') : '—'
	);
	const formattedDownloads = $derived(
		dlAppData ? totalCountInLastNDays(dlAppData, dlInsightDays).toLocaleString('en-US') : '—'
	);
	const formattedZaps = $derived(
		zapAppData ? totalCountInLastNDays(zapAppData, zapInsightDays).toLocaleString('en-US') : '—'
	);

	// ── Real data loading (only runs when DUMMY_MODE = false) ───────────────
	$effect(() => {
		if (DUMMY_MODE) return;
		selectedImpTimeframe;
		selectedDlTimeframe;
		selectedZapTimeframe;
		selectedCountryTimeframe;
		const impD = timeframeToDays(selectedImpTimeframe);
		const dlD = timeframeToDays(selectedDlTimeframe);
		const zapD = timeframeToDays(selectedZapTimeframe);
		const countryD = timeframeToDays(selectedCountryTimeframe);
		studioLoadGeneration += 1;
		const gen = studioLoadGeneration;
		loadStudioData(gen, impD, dlD, zapD, countryD).catch((err) => {
			console.error('[Studio] data load failed:', err);
		});
	});

	// ── App detail: country breakdown for selected app (detail date range = impressions timeframe) ──
	$effect(() => {
		if (DUMMY_MODE) {
			detailCountryRows = selectedApp ? [...DUMMY_COUNTRY_ROWS] : [];
			detailCountryLoading = false;
			return;
		}
		selectedApp;
		selectedImpTimeframe;
		studioPubkey;
		userApps;

		detailCountryGen += 1;
		const gen = detailCountryGen;
		const app = selectedApp;
		const pk = studioPubkey;

		if (!app || !pk || userApps.length === 0) {
			detailCountryRows = [];
			detailCountryLoading = false;
			return;
		}

		detailCountryLoading = true;
		const days = timeframeToDays(selectedImpTimeframe);
		const range = buildIsoDateRange(days);

		void (async () => {
			try {
				const hashMap = await collectBlobHashesForDeveloper(pk, userApps);
				if (gen !== detailCountryGen) return;
				const rows = await loadCountryBreakdownForApp(pk, range, app, hashMap, 10);
				if (gen !== detailCountryGen) return;
				detailCountryRows = rows;
			} catch (e) {
				console.warn('[Studio] app detail country breakdown failed:', e);
				if (gen === detailCountryGen) detailCountryRows = [];
			} finally {
				if (gen === detailCountryGen) detailCountryLoading = false;
			}
		})();
	});

	// ── App detail: platform breakdown for selected app (same date range as country detail) ──
	$effect(() => {
		if (DUMMY_MODE) {
			detailPlatformRows = selectedApp ? [...DUMMY_PLATFORM_ROWS] : [];
			detailPlatformLoading = false;
			return;
		}
		selectedApp;
		selectedImpTimeframe;
		studioPubkey;
		userApps;

		detailPlatformGen += 1;
		const gen = detailPlatformGen;
		const app = selectedApp;
		const pk = studioPubkey;

		if (!app || !pk || userApps.length === 0) {
			detailPlatformRows = [];
			detailPlatformLoading = false;
			return;
		}

		detailPlatformLoading = true;
		const days = timeframeToDays(selectedImpTimeframe);
		const range = buildIsoDateRange(days);

		void (async () => {
			try {
				const hashMap = await collectBlobHashesForDeveloper(pk, userApps);
				if (gen !== detailPlatformGen) return;
				const rows = await loadPlatformBreakdownForApp(pk, range, app, hashMap);
				if (gen !== detailPlatformGen) return;
				detailPlatformRows = rows;
			} catch (e) {
				console.warn('[Studio] app detail platform breakdown failed:', e);
				if (gen === detailPlatformGen) detailPlatformRows = [];
			} finally {
				if (gen === detailPlatformGen) detailPlatformLoading = false;
			}
		})();
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
		const fromAuth = getCurrentPubkey();
		if (fromAuth) {
			try {
				return npubToHex(fromAuth);
			} catch {
				return String(fromAuth).toLowerCase();
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
	 * @param {number} zapDays
	 * @param {number} countryDays
	 */
	async function loadStudioData(gen, impDays, dlDays, zapDays, countryDays) {
		const countryRange = buildIsoDateRange(countryDays);

		const signerPubkey = await resolveStudioPubkeyHex();
		if (studioLoadStale(gen)) return;
		if (!signerPubkey) {
			console.warn(
				'[Studio] Set TEST_PUBKEY in studio-config.js (npub or hex) or sign in to load apps and analytics.'
			);
			studioPubkey = null;
			userApps = [];
			impAppData = null;
			dlAppData = null;
			zapAppData = null;
			countryRows = [];
			platformRows = [];
			impChartLoading = false;
			dlChartLoading = false;
			zapChartLoading = false;
			countryChartLoading = false;
			platformChartLoading = false;
			prevStudioImpDays = -1;
			prevStudioDlDays = -1;
			prevStudioZapDays = -1;
			prevStudioCountryDays = -1;
			prevStudioPlatformDays = -1;
			return;
		}

		const catalogPubkey = await resolveStudioCatalogPubkey(signerPubkey);
		if (studioLoadStale(gen)) return;
		studioPubkey = catalogPubkey;

		let events = await queryEvents({ kinds: [32267], authors: [catalogPubkey] });
		if (studioLoadStale(gen)) return;

		/* Indexer catalog: paginate until EOSE pages are exhausted. Do not send #f (PLATFORM_FILTER):
		   many kind 32267 events omit or vary `f`; relay-side #f would hide most of the catalog. */
		const indexerCatalog = isStudioIndexerCatalogPubkey(catalogPubkey);
		if (indexerCatalog) {
			const thinLocalIndex = events.length === 0 || events.length < 500;
			const sessionKey = `zs.studio.indexerRelayBackfill:${catalogPubkey}`;
			let sessionBackfillDone = false;
			try {
				sessionBackfillDone = sessionStorage.getItem(sessionKey) === '1';
			} catch {
				/* private mode */
			}
			const shouldPaginateRelays = thinLocalIndex || !sessionBackfillDone;
			if (shouldPaginateRelays) {
				await fetchAllAppsByAuthorFromRelays(DEFAULT_CATALOG_RELAYS, catalogPubkey, {
					pageLimit: 500,
					maxPages: 40,
					timeout: 15000,
					skipPlatformFilter: true
				});
				if (studioLoadStale(gen)) return;
				try {
					sessionStorage.setItem(sessionKey, '1');
				} catch {
					/* ignore */
				}
				events = await queryEvents({ kinds: [32267], authors: [catalogPubkey] });
			}
		} else if (events.length === 0) {
			events = await fetchAppsByAuthorFromRelays(DEFAULT_CATALOG_RELAYS, catalogPubkey);
			if (events.length > 0) await putEvents(events);
		}
		if (studioLoadStale(gen)) return;

		const parsedApps = events.map(parseApp);
		let nextUserApps = parsedApps.map((a) => ({
			id: a.dTag,
			name: a.name,
			icon: a.icon ?? '',
			description: a.description ?? '',
			url: a.url ?? '',
			images: a.images ?? [],
			eventId: a.id,
			event: a.event
		}));
		if (isStudioIndexerCatalogPubkey(catalogPubkey)) {
			nextUserApps = sortStudioIndexerAppsZapstoreFirst(nextUserApps);
		}
		userApps = nextUserApps;

		if (parsedApps.length === 0) {
			impAppData = null;
			dlAppData = null;
			zapAppData = null;
			countryRows = [];
			platformRows = [];
			impChartLoading = false;
			dlChartLoading = false;
			zapChartLoading = false;
			countryChartLoading = false;
			platformChartLoading = false;
			prevStudioImpDays = -1;
			prevStudioDlDays = -1;
			prevStudioZapDays = -1;
			prevStudioCountryDays = -1;
			prevStudioPlatformDays = -1;
			return;
		}

		const needImp = impDays !== prevStudioImpDays;
		const needDl = dlDays !== prevStudioDlDays;
		const needZap = zapDays !== prevStudioZapDays;
		const needCountry = countryDays !== prevStudioCountryDays;
		const needPlatform = countryDays !== prevStudioPlatformDays;

		if (needImp) impChartLoading = true;
		else impChartLoading = false;
		if (needCountry) countryChartLoading = true;
		else countryChartLoading = false;
		if (needPlatform) platformChartLoading = true;
		else platformChartLoading = false;
		if (needDl) dlChartLoading = true;
		else dlChartLoading = false;
		if (needZap) zapChartLoading = true;
		else zapChartLoading = false;

		const hashPromise = collectBlobHashesForDeveloper(catalogPubkey, userApps);

		if (needImp) void impFlow(gen, catalogPubkey, impDays);
		if (needDl) void dlFlow(gen, dlDays, hashPromise);
		if (needZap) void zapFlow(gen, catalogPubkey, zapDays);
		if (needCountry) void countryFlow(gen, catalogPubkey, countryDays, countryRange, hashPromise);
		if (needPlatform) void platformFlow(gen, catalogPubkey, countryDays, countryRange, hashPromise);
	}

	/**
	 * @param {number} gen
	 * @param {string} pubkey
	 * @param {number} impDays
	 */
	async function impFlow(gen, pubkey, impDays) {
		try {
			let v1Ok = false;
			try {
				const spanDays = 2 * impDays;
				const wideRange = buildIsoDateRange(spanDays);
				const impRows = await fetchImpressions(pubkey, {
					from: wideRange.from,
					to: wideRange.to,
					groupBy: 'app_id,day'
				});
				v1Ok = true;
				if (!studioLoadStale(gen)) {
					impAppData = mapImpressionRowsToAppData(userApps, impRows, spanDays);
				}
			} catch (err) {
				if (!studioLoadStale(gen)) impAppData = null;
				const msg = err instanceof Error ? err.message : String(err);
				if (msg === 'ANALYTICS_HTTP_DISABLED') {
					console.warn(
						'[Studio] v1 analytics proxy disabled. Set STUDIO_ANALYTICS_HTTP_URL in .env (e.g. http://127.0.0.1:3336) and restart the dev server.'
					);
				} else {
					console.warn('[Studio] v1 impressions failed:', err);
				}
			}
			if (!v1Ok && !studioLoadStale(gen)) {
				await loadLegacyNip98Impressions(pubkey, impDays, gen);
			}
		} finally {
			if (!studioLoadStale(gen)) {
				impChartLoading = false;
				prevStudioImpDays = impDays;
			}
		}
	}

	/**
	 * @param {number} gen
	 * @param {number} dlDays
	 * @param {Promise<Map<string, string>>} hashPromise
	 */
	async function dlFlow(gen, dlDays, hashPromise) {
		try {
			const hashMap = await hashPromise;
			if (studioLoadStale(gen)) return;
			const spanDays = 2 * dlDays;
			const wideRange = buildIsoDateRange(spanDays);
			const data = await loadDownloadAppData(userApps, hashMap, wideRange, spanDays);
			if (!studioLoadStale(gen)) dlAppData = data;
		} catch (err) {
			console.warn('[Studio] v1 downloads failed:', err);
			if (!studioLoadStale(gen)) dlAppData = null;
		} finally {
			if (!studioLoadStale(gen)) {
				dlChartLoading = false;
				prevStudioDlDays = dlDays;
			}
		}
	}

	/**
	 * @param {number} gen
	 * @param {string} pubkey
	 * @param {number} zapDays
	 */
	async function zapFlow(gen, pubkey, zapDays) {
		try {
			const data = await loadZapAppData(pubkey, userApps, 2 * zapDays);
			if (!studioLoadStale(gen)) zapAppData = data;
		} catch (err) {
			console.warn('[Studio] zaps load failed:', err);
			if (!studioLoadStale(gen)) zapAppData = null;
		} finally {
			if (!studioLoadStale(gen)) {
				zapChartLoading = false;
				prevStudioZapDays = zapDays;
			}
		}
	}

	/**
	 * @param {number} gen
	 * @param {string} pubkey
	 * @param {number} countryDays
	 * @param {{ from: string, to: string }} countryRange
	 * @param {Promise<Map<string, string>>} hashPromise
	 */
	async function countryFlow(gen, pubkey, countryDays, countryRange, hashPromise) {
		try {
			const hashMap = await hashPromise;
			if (studioLoadStale(gen)) return;
			const rows = await loadCountryBreakdown(pubkey, countryRange, hashMap, 10);
			if (!studioLoadStale(gen)) countryRows = rows;
		} catch (err) {
			console.warn('[Studio] country breakdown failed:', err);
			if (!studioLoadStale(gen)) countryRows = [];
		} finally {
			if (!studioLoadStale(gen)) {
				countryChartLoading = false;
				prevStudioCountryDays = countryDays;
			}
		}
	}

	/**
	 * @param {number} gen
	 * @param {string} pubkey
	 * @param {number} platformDays
	 * @param {{ from: string, to: string }} platformRange
	 * @param {Promise<Map<string, string>>} hashPromise
	 */
	async function platformFlow(gen, pubkey, platformDays, platformRange, hashPromise) {
		try {
			const hashMap = await hashPromise;
			if (studioLoadStale(gen)) return;
			const rows = await loadPlatformBreakdown(pubkey, platformRange, hashMap);
			if (!studioLoadStale(gen)) platformRows = rows;
		} catch (err) {
			console.warn('[Studio] platform breakdown failed:', err);
			if (!studioLoadStale(gen)) platformRows = [];
		} finally {
			if (!studioLoadStale(gen)) {
				platformChartLoading = false;
				prevStudioPlatformDays = platformDays;
			}
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

		if (!getIsSignedIn()) {
			console.warn('[Studio] Not signed in — legacy impressions skipped (v1 downloads unchanged if loaded).');
			if (!studioLoadStale(gen)) impAppData = null;
			return;
		}

		let authEvent;
		try {
			authEvent = await signEvent({
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
						color="var(--white33)"
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
								{@const iconColor = isActive ? 'var(--white66)' : 'var(--white33)'}
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
							<div class="apps-section-head">
								<span class="eyebrow-label apps-eyebrow">Your Apps</span>
								{#if showIndexerAppCount}
									<span class="apps-eyebrow-count" aria-label="{userApps.length} apps loaded"
										>{userApps.length.toLocaleString('en-US')}</span
									>
								{/if}
							</div>
							{#each userApps as app (app.id)}
								<button
									class="nav-item"
									class:active={selectedApp?.id === app.id}
									onclick={() => selectApp(app)}
								>
									<span class="icon-wrap">
										<img src={app.icon} alt={app.name} class="app-img" loading="lazy" />
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
					{@const iconColor = isActive ? 'var(--white66)' : 'var(--white33)'}
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
				<div class="apps-section-head">
					<span class="eyebrow-label apps-eyebrow">Your Apps</span>
					{#if showIndexerAppCount}
						<span class="apps-eyebrow-count" aria-label="{userApps.length} apps loaded"
							>{userApps.length.toLocaleString('en-US')}</span
						>
					{/if}
				</div>
				{#each userApps as app (app.id)}
					<button
						class="nav-item"
						class:active={selectedApp?.id === app.id}
						onclick={() => selectApp(app)}
					>
						<span class="icon-wrap">
							<img src={app.icon} alt={app.name} class="app-img" loading="lazy" />
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
			{#if selectedApp !== null && editingApp}
				<div class="detail-scroll">
					<StudioAppEdit
						app={selectedApp}
						onBack={() => (editingApp = false)}
						onSaved={(updatedApp) => {
							if (updatedApp) {
								// Keep sidebar shape (`id` = d-tag); `parseApp` uses `id` for event id.
								const row = {
									id: updatedApp.dTag,
									name: updatedApp.name,
									icon: updatedApp.icon ?? '',
									description: updatedApp.description ?? '',
									url: updatedApp.url ?? '',
									images: updatedApp.images ?? [],
									eventId: updatedApp.id,
									event: updatedApp.event
								};
								selectedApp = row;
								const d = updatedApp.dTag.toLowerCase();
								userApps = userApps.map((a) =>
									a.id.toLowerCase() === d
										? {
												...a,
												name: row.name,
												icon: row.icon,
												description: row.description,
												url: row.url,
												images: row.images,
												eventId: row.eventId,
												event: row.event
											}
										: a
								);
							}
							editingApp = false;
						}}
					/>
				</div>
			{:else if selectedApp !== null}
				<div class="detail-scroll">
					<StudioAppDetail
						app={selectedApp}
						bind:selectedDlTimeframe
						bind:selectedImpTimeframe
						bind:selectedZapTimeframe
						chartDayCount={detailChartDays}
						dlCounts={dlAppData?.find((a) => a.id === selectedApp.id)?.counts ?? []}
						impCounts={impAppData?.find((a) => a.id === selectedApp.id)?.counts ?? []}
						zapCounts={zapAppData?.find((a) => a.id === selectedApp.id)?.counts ?? []}
						dlMetricsLoading={!DUMMY_MODE && dlChartLoading}
						zapMetricsLoading={!DUMMY_MODE && zapChartLoading}
						impMetricsLoading={!DUMMY_MODE && impChartLoading}
					countryRows={detailCountryRows}
					countryLoading={!DUMMY_MODE && detailCountryLoading}
					platformRows={detailPlatformRows}
					platformLoading={!DUMMY_MODE && detailPlatformLoading}
					onBack={() => (selectedApp = null)}
						onEdit={() => (editingApp = true)}
					/>
				</div>
			{:else if activeNav === 'inbox'}
				<!-- Inbox: comments on your apps. Scrolls inside .content so modals stay in viewport. -->
				<section class="activity-section inbox-section inbox-scroll" class:scroll-locked={inboxThreadOpen}>
					<StudioAppActivity devPubkey={studioPubkey} apps={userApps} bind:threadModalOpen={inboxThreadOpen} />
				</section>
			{:else}
				<!-- Insights: wrap in scrollable div so .content itself stays overflow:hidden -->
				<div class="insights-scroll">
				<section class="content-section insights-chart-section">
					<div class="insights-metric-head">
						<div class="dl-meta">
							<DownloadIcon size={24} color="var(--blurpleColor66)" />
							{#if !DUMMY_MODE && dlChartLoading}
								<div class="studio-metric-count-skel">
									<SkeletonLoader />
								</div>
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
									<ChevronDownIcon
										variant="outline"
										color="var(--white16)"
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
							maxPerAppLines={2}
							loading={!DUMMY_MODE && dlChartLoading}
						/>
					</div>
				</section>

				<!-- Zaps section -->
				<section class="content-section insights-chart-section">
					<div class="insights-metric-head">
						<div class="dl-meta">
							<ZapIcon size={24} color="var(--goldColor66)" />
							{#if !DUMMY_MODE && zapChartLoading}
								<div class="studio-metric-count-skel">
									<SkeletonLoader />
								</div>
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
									<ChevronDownIcon
										variant="outline"
										color="var(--white16)"
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
							dayCount={DUMMY_MODE ? STUDIO_DAYS : zapInsightDays}
							color0="#CC7A00"
							color1="#FFB237"
							glowColor="#FFB237"
							glowOpacity={0.12}
							dotColor="#FFB237"
							badgeBg="rgba(90,55,0,0.92)"
							appData={zapAppData}
							maxPerAppLines={2}
							loading={!DUMMY_MODE && zapChartLoading}
						/>
					</div>
				</section>

				<section class="content-section insights-chart-section">
					<div class="insights-metric-head">
						<div class="dl-meta">
							<ImpressionIcon size={24} />
							{#if !DUMMY_MODE && impChartLoading}
								<div class="studio-metric-count-skel">
									<SkeletonLoader />
								</div>
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
									<ChevronDownIcon
										variant="outline"
										color="var(--white16)"
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
							color0="var(--white33)"
							color1="var(--white66)"
							glowColor="var(--white33)"
							glowOpacity={0.16}
							dotColor="var(--white66)"
							totalDotBackdropFill="var(--black)"
							badgeBg="rgba(52, 52, 58, 0.94)"
							appData={impAppData}
							maxPerAppLines={2}
							loading={!DUMMY_MODE && impChartLoading}
						/>
					</div>
				</section>

			<!-- Platform breakdown — shares the country timeframe dropdown -->
			<section class="content-section country-section">
				<div class="section-head country-section-head">
					<span class="eyebrow-label country-section-title">By platform</span>
					<div class="country-section-head-right">
						<div class="country-head-legend">
							<span class="country-legend-item">
								<span class="country-legend-icon-wrap">
									<ImpressionIcon size={14} />
								</span>
								<span class="country-legend-text">Impressions</span>
							</span>
							<span class="country-legend-item">
								<span class="country-legend-icon-wrap">
									<DownloadIcon size={14} color="var(--blurpleColor66)" strokeWidth={1.4} />
								</span>
								<span class="country-legend-text">Downloads</span>
							</span>
						</div>
						<div class="timerange-wrap" data-studio-dropdown="platform">
							<button
								class="timerange-btn"
								onclick={() => (platformDropdownOpen = !platformDropdownOpen)}
							>
								<span class="eyebrow-label tr-label">{selectedCountryTimeframe}</span>
								<span class="chevron-wrap">
									<ChevronDownIcon
										variant="outline"
										color="var(--white16)"
										size={12}
										strokeWidth={1.4}
									/>
								</span>
							</button>
							{#if platformDropdownOpen}
								<div class="tr-dropdown">
									{#each timeframes as tf (tf)}
										<button
											class="tr-option"
											class:tr-selected={tf === selectedCountryTimeframe}
											onclick={() => {
												selectedCountryTimeframe = tf;
												platformDropdownOpen = false;
											}}
										>
											{tf}
										</button>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				</div>
				<div class="chart-area country-chart-wrap">
					<StudioPlatformChart rows={platformRows} loading={!DUMMY_MODE && platformChartLoading} />
				</div>
			</section>

			<section class="content-section country-section">
				<div class="section-head country-section-head">
					<span class="eyebrow-label country-section-title">By country</span>
					<div class="country-section-head-right">
						<div class="country-head-legend">
							<span class="country-legend-item">
								<span class="country-legend-icon-wrap">
									<ImpressionIcon size={14} />
								</span>
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
							<button
								class="timerange-btn"
								onclick={() => (countryDropdownOpen = !countryDropdownOpen)}
							>
								<span class="eyebrow-label tr-label">{selectedCountryTimeframe}</span>
								<span class="chevron-wrap">
									<ChevronDownIcon
										variant="outline"
										color="var(--white16)"
										size={12}
										strokeWidth={1.4}
									/>
								</span>
							</button>
							{#if countryDropdownOpen}
								<div class="tr-dropdown">
									{#each timeframes as tf (tf)}
										<button
											class="tr-option"
											class:tr-selected={tf === selectedCountryTimeframe}
											onclick={() => {
												selectedCountryTimeframe = tf;
												countryDropdownOpen = false;
											}}
										>
											{tf}
										</button>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				</div>
					<div class="chart-area country-chart-wrap">
						<StudioCountryChart rows={countryRows} loading={!DUMMY_MODE && countryChartLoading} />
					</div>
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
		border-left: 1px solid var(--white16);
		border-right: 1px solid var(--white16);
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
		color: var(--white66);
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
		background: var(--white4);
	}

	.nav-item.active {
		color: var(--white);
		background: var(--white8);
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

	.apps-section-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		padding: 0 10px;
		margin-bottom: 4px;
		min-width: 0;
	}

	.apps-eyebrow {
		color: var(--white33);
		display: block;
		min-width: 0;
	}

	.apps-eyebrow-count {
		flex-shrink: 0;
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0.06em;
		font-variant-numeric: tabular-nums;
		color: var(--blurpleColor66);
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
		border-top: 1px solid var(--white16);
	}

	.section-eyebrow {
		padding: 0 10px;
		margin-bottom: 4px;
		color: var(--white33);
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
			border-bottom: 1px solid var(--white16);
			cursor: pointer;
			color: var(--white);
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
			background: var(--black);
			border-top: 1px solid var(--white16);
			box-shadow: 0 12px 40px color-mix(in srgb, var(--black) 35%, transparent);
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
			background: color-mix(in srgb, var(--black) 35%, transparent);
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
		border-left: 1px solid var(--white16);
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

	/* Per-app detail: same as insights/inbox — .content stays overflow:hidden */
	.detail-scroll {
		flex: 1;
		min-width: 0;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}

	@media (max-width: 767px) {
		.content {
			border-left: none;
			/* Match community/+layout .right-page-viewport: full-viewport fixed modals (mobile nav + section switcher are z-90). */
			transform: none;
		}
	}

	.content-section {
		position: relative;
		/* Bottom matches per-app detail chart section (StudioAppDetail .chart-section). */
		padding: 18px 26px 20px;
		border-bottom: 1px solid var(--white16);
	}

	/* Downloads / Zaps / Impressions: count row sits under the chart so hover badges paint on top;
	   timerange stays above the chart for clicks. */
	.insights-chart-section .insights-metric-head {
		position: absolute;
		top: 18px;
		left: 26px;
		z-index: 1;
		pointer-events: none;
	}

	.insights-chart-section .insights-metric-head .dl-meta {
		flex: 0 1 auto;
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

	/* ── Section header — floats over the graph ───────────────────────────── */
	.section-head {
		position: absolute;
		top: 18px;
		left: 26px;
		right: 26px;
		/* Above .chart-area / .chart-svg (z-index 1) so timerange button + dropdown stay clickable */
		z-index: 10;
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
		color: var(--white);
		line-height: 1;
		letter-spacing: -0.02em;
	}

	/* ── Timerange dropdown ───────────────────────────────────────────────── */
	.timerange-wrap {
		position: relative;
		align-self: flex-start;
		z-index: 11;
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
		background: var(--white8);
	}

	/* .eyebrow-label global class handles size/weight/spacing/uppercase */
	.tr-label {
		color: var(--white33);
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

	/* ── Insights header: skeleton for count only (~32px cap height) ───────── */
	.studio-metric-count-skel {
		height: 32px;
		width: 6.5rem;
		min-width: 5rem;
		border-radius: 12px;
		overflow: hidden;
	}

	/* ── Chart area ───────────────────────────────────────────────────────── */
	.chart-area {
		position: relative;
		z-index: 0;
		width: 100%;
		isolation: isolate;
	}

	/* Label-column width token — slightly wider on desktop, capped at mobile value on small screens */
	.country-section {
		--label-col: clamp(56px, 26%, 140px);
	}

	@media (max-width: 600px) {
		.country-section {
			--label-col: clamp(56px, 26%, 118px);
		}
	}

	/* Override section-head flex → 2-col grid so title aligns with chart label col */
	.country-section-head {
		display: grid;
		grid-template-columns: var(--label-col, clamp(56px, 26%, 118px)) minmax(0, 1fr);
		gap: 0 10px;
		align-items: center;
	}

	/* Right cell of the country head grid: legend on left, timerange on right */
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
</style>
