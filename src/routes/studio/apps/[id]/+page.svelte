<script>
	import { getContext } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import StudioAppDetail from '$lib/components/studio/StudioAppDetail.svelte';
	import StudioAppEdit from '$lib/components/studio/StudioAppEdit.svelte';
	import { buildIsoDateRange, timeframeToDays } from '$lib/studio/analytics-http.js';
	import {
		appSeriesFor,
		counts2xForApp,
		getCountryBreakdown,
		getPlatformBreakdown,
		loadAppSeriesIfNeeded,
		slice2x,
		studioAnalytics
	} from '$lib/stores/studio-analytics.svelte.js';
	import { ZAPSTORE_INDEXER_PUBKEY, DEFAULT_CATALOG_RELAYS } from '$lib/config.js';
	import { queryEvents } from '$lib/nostr/dexie.js';
	import { parseApp } from '$lib/nostr/models.js';
	import { fetchFromRelays } from '$lib/nostr/service.js';

	const studio = getContext('studio');

	// URL param `id` is the app's d-tag, percent-encoded.
	const appId = $derived.by(() => {
		const raw = $page.params.id ?? '';
		try {
			return decodeURIComponent(raw);
		} catch {
			return raw;
		}
	});

	// First check the signer's own catalog (already loaded by the layout). If the
	// app isn't there and the signer has indexer-access, fall back to a one-shot
	// lookup by d-tag against the Zapstore indexer catalog.
	const ownApp = $derived(studio.userApps.find((a) => a.id === appId) ?? null);
	let indexerApp = $state(/** @type {object | null} */ (null));
	let indexerLookupFailed = $state(false);
	const app = $derived(ownApp ?? indexerApp);

	$effect(() => {
		if (ownApp || !appId || !studio.indexerAccess) return;
		void loadIndexerApp(appId);
	});

	async function loadIndexerApp(/** @type {string} */ id) {
		indexerLookupFailed = false;
		try {
			let events = await queryEvents({
				kinds: [32267],
				authors: [ZAPSTORE_INDEXER_PUBKEY],
				'#d': [id]
			});
			if (events.length === 0) {
				// Direct relay lookup — `fetchFromRelays` persists hits to Dexie automatically.
				const fetched = await fetchFromRelays(
					DEFAULT_CATALOG_RELAYS,
					{ kinds: [32267], authors: [ZAPSTORE_INDEXER_PUBKEY], '#d': [id], limit: 1 },
					{ timeout: 5000, feature: 'studio-app' }
				);
				events = fetched;
			}
			const match = events.find(
				(e) => (e.tags.find((t) => t[0] === 'd')?.[1] ?? '').toLowerCase() === id.toLowerCase()
			);
			if (!match) {
				indexerLookupFailed = true;
				return;
			}
			const parsed = parseApp(match);
			indexerApp = {
				id: parsed.dTag,
				name: parsed.name,
				icon: parsed.icon ?? '',
				description: parsed.description ?? '',
				url: parsed.url ?? '',
				images: parsed.images ?? [],
				eventId: parsed.id,
				event: parsed.event,
				pubkey: ZAPSTORE_INDEXER_PUBKEY,
				/** Marks this app as outside the signer's own catalog — disables edit, swaps analytics source. */
				external: true
			};
		} catch (err) {
			console.warn('[Studio] indexer lookup failed:', err);
			indexerLookupFailed = true;
		}
	}

	// Pre-warm the per-app series cache for indexer-access apps. No-op for own
	// apps (their series come from the publisher-wide cache).
	$effect(() => {
		if (app?.external) loadAppSeriesIfNeeded(app.pubkey, app.id);
	});

	let editingApp = $state(false);

	let selectedImpTimeframe = $state('30 Days');
	let selectedDlTimeframe = $state('30 Days');
	let selectedZapTimeframe = $state('30 Days');

	const detailChartDays = $derived(
		Math.max(
			timeframeToDays(selectedDlTimeframe),
			timeframeToDays(selectedImpTimeframe),
			timeframeToDays(selectedZapTimeframe),
			1
		)
	);

	// Two windows back-to-back so StudioAppDetail can compute the prior-period % ticker.
	// Own apps: slice the publisher-wide cache. Indexer apps: slice the per-app cache.
	const externalEntry = $derived(
		app?.external ? appSeriesFor(app.pubkey, app.id) : undefined
	);

	const dlCounts = $derived.by(() => {
		if (!app) return [];
		if (app.external) return slice2x(externalEntry?.downloads, timeframeToDays(selectedDlTimeframe));
		return counts2xForApp(studioAnalytics.downloadsSeries, app.id, timeframeToDays(selectedDlTimeframe));
	});
	const impCounts = $derived.by(() => {
		if (!app) return [];
		if (app.external) return slice2x(externalEntry?.impressions, timeframeToDays(selectedImpTimeframe));
		return counts2xForApp(studioAnalytics.impressionsSeries, app.id, timeframeToDays(selectedImpTimeframe));
	});
	// Zaps are not collected for indexer-access apps (the signer can't claim them).
	const zapCounts = $derived(
		app && !app.external
			? counts2xForApp(studioAnalytics.zapsSeries, app.id, timeframeToDays(selectedZapTimeframe))
			: []
	);

	const dlMetricsLoading = $derived(
		app?.external ? externalEntry?.loading === true : studioAnalytics.downloadsLoading
	);
	const impMetricsLoading = $derived(
		app?.external ? externalEntry?.loading === true : studioAnalytics.impressionsLoading
	);
	const zapMetricsLoading = $derived(app?.external ? false : studioAnalytics.zapsLoading);

	// ── Per-app country / platform breakdowns (always pubkey-scoped) ─────────
	let detailCountryRows = $state(/** @type {Array<{ countryKey: string, label: string, impressions: number, downloads: number }>} */ ([]));
	let detailCountryLoading = $state(false);
	let detailPlatformRows = $state(/** @type {Array<{ source: string, label: string, impressions: number, downloads: number }>} */ ([]));
	let detailPlatformLoading = $state(false);

	let countryGen = 0;
	let platformGen = 0;

	$effect(() => {
		const currentApp = app;
		const days = timeframeToDays(selectedImpTimeframe);
		if (!currentApp) {
			detailCountryRows = [];
			detailCountryLoading = false;
			return;
		}
		countryGen += 1;
		const gen = countryGen;
		detailCountryLoading = true;
		const range = buildIsoDateRange(days);
		void (async () => {
			try {
				const rows = await getCountryBreakdown(currentApp.pubkey, range, currentApp.id);
				if (gen !== countryGen) return;
				detailCountryRows = rows;
			} finally {
				if (gen === countryGen) detailCountryLoading = false;
			}
		})();
	});

	$effect(() => {
		const currentApp = app;
		const days = timeframeToDays(selectedImpTimeframe);
		if (!currentApp) {
			detailPlatformRows = [];
			detailPlatformLoading = false;
			return;
		}
		platformGen += 1;
		const gen = platformGen;
		detailPlatformLoading = true;
		const range = buildIsoDateRange(days);
		void (async () => {
			try {
				const rows = await getPlatformBreakdown(currentApp.pubkey, range, currentApp.id);
				if (gen !== platformGen) return;
				detailPlatformRows = rows;
			} finally {
				if (gen === platformGen) detailPlatformLoading = false;
			}
		})();
	});

	function handleSaved(updatedApp) {
		if (updatedApp) studio.updateApp(updatedApp);
		editingApp = false;
	}
</script>

<div class="detail-scroll">
	{#if !app}
		<div class="app-not-found">
			{#if indexerLookupFailed}
				<p class="eyebrow-label">App not found.</p>
			{:else}
				<p class="eyebrow-label">Loading…</p>
			{/if}
		</div>
	{:else if editingApp}
		<StudioAppEdit
			{app}
			onBack={() => (editingApp = false)}
			onSaved={handleSaved}
		/>
	{:else}
		<StudioAppDetail
			{app}
			bind:selectedDlTimeframe
			bind:selectedImpTimeframe
			bind:selectedZapTimeframe
			chartDayCount={detailChartDays}
			{dlCounts}
			{impCounts}
			{zapCounts}
			{dlMetricsLoading}
			{zapMetricsLoading}
			{impMetricsLoading}
			countryRows={detailCountryRows}
			countryLoading={detailCountryLoading}
			platformRows={detailPlatformRows}
			platformLoading={detailPlatformLoading}
			onBack={() => goto('/studio/insights')}
			onEdit={() => (editingApp = true)}
			canEdit={!app.external}
		/>
	{/if}
</div>

<style>
	.detail-scroll {
		flex: 1;
		min-width: 0;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		display: flex;
		flex-direction: column;
	}

	.app-not-found {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 40px;
		color: var(--white33);
	}
</style>
