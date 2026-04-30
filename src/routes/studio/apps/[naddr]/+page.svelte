<script>
	import { getContext } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import StudioAppDetail from '$lib/components/studio/StudioAppDetail.svelte';
	import StudioAppEdit from '$lib/components/studio/StudioAppEdit.svelte';
	import {
		buildIsoDateRange,
		fetchImpressions,
		loadCountryBreakdownForApp,
		loadDownloadAppData,
		mapImpressionRowsToAppData,
		loadPlatformBreakdownForApp,
		timeframeToDays
	} from '$lib/studio/analytics-http.js';
	import { collectBlobHashesForDeveloper } from '$lib/studio/collect-blob-hashes.js';
	import { loadZapAppData } from '$lib/studio/zap-series.js';
	import { getIsSignedIn, signEvent } from '$lib/stores/auth.svelte.js';

	const studio = getContext('studio');

	const naddr = $derived($page.params.naddr);
	const app = $derived(studio.userApps.find((a) => a.naddr === naddr) ?? null);

	let editingApp = $state(false);

	// ── Per-app chart data ───────────────────────────────────────────────────
	let dlAppData = $state(null);
	let zapAppData = $state(null);
	let impAppData = $state(null);

	let dlMetricsLoading = $state(true);
	let zapMetricsLoading = $state(true);
	let impMetricsLoading = $state(true);

	let selectedImpTimeframe = $state('30 Days');
	let selectedDlTimeframe = $state('30 Days');
	let selectedZapTimeframe = $state('30 Days');

	// ── Per-app country / platform breakdown ─────────────────────────────────
	let detailCountryRows = $state([]);
	let detailCountryLoading = $state(false);
	let detailPlatformRows = $state([]);
	let detailPlatformLoading = $state(false);

	let detailCountryGen = 0;
	let detailPlatformGen = 0;

	const detailChartDays = $derived(
		Math.max(
			timeframeToDays(selectedDlTimeframe),
			timeframeToDays(selectedImpTimeframe),
			timeframeToDays(selectedZapTimeframe),
			1
		)
	);

	// ── Derived counts for the current app ───────────────────────────────────
	const dlCounts = $derived(dlAppData?.find((a) => a.id === app?.id)?.counts ?? []);
	const zapCounts = $derived(zapAppData?.find((a) => a.id === app?.id)?.counts ?? []);
	const impCounts = $derived(impAppData?.find((a) => a.id === app?.id)?.counts ?? []);

	// ── Generation counter (prevents stale async writes) ─────────────────────
	let loadGen = 0;
	let prevDlDays = -1;
	let prevImpDays = -1;
	let prevZapDays = -1;

	function isStale(gen) { return gen !== loadGen; }

	// ── Analytics flows ──────────────────────────────────────────────────────
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
				if (!isStale(gen)) impAppData = mapImpressionRowsToAppData(studio.userApps, impRows, spanDays);
			} catch (err) {
				if (!isStale(gen)) impAppData = null;
				const msg = err instanceof Error ? err.message : String(err);
				if (msg !== 'ANALYTICS_HTTP_DISABLED') console.warn('[AppDetail] v1 impressions failed:', err);
			}
			if (!v1Ok && !isStale(gen)) await loadLegacyNip98Impressions(pubkey, impDays, gen);
		} finally {
			if (!isStale(gen)) { impMetricsLoading = false; prevImpDays = impDays; }
		}
	}

	async function dlFlow(gen, dlDays, hashPromise) {
		try {
			const hashMap = await hashPromise;
			if (isStale(gen)) return;
			const spanDays = 2 * dlDays;
			const wideRange = buildIsoDateRange(spanDays);
			const data = await loadDownloadAppData(studio.userApps, hashMap, wideRange, spanDays);
			if (!isStale(gen)) dlAppData = data;
		} catch (err) {
			console.warn('[AppDetail] downloads failed:', err);
			if (!isStale(gen)) dlAppData = null;
		} finally {
			if (!isStale(gen)) { dlMetricsLoading = false; prevDlDays = dlDays; }
		}
	}

	async function zapFlow(gen, pubkey, zapDays) {
		try {
			const data = await loadZapAppData(pubkey, studio.userApps, 2 * zapDays);
			if (!isStale(gen)) zapAppData = data;
		} catch (err) {
			console.warn('[AppDetail] zaps failed:', err);
			if (!isStale(gen)) zapAppData = null;
		} finally {
			if (!isStale(gen)) { zapMetricsLoading = false; prevZapDays = zapDays; }
		}
	}

	async function loadLegacyNip98Impressions(pubkeyHex, days, gen) {
		const apiUrl = `${location.origin}/api/studio/analytics?pubkey=${pubkeyHex}`;
		if (!getIsSignedIn()) { if (!isStale(gen)) impAppData = null; return; }
		let authEvent;
		try {
			authEvent = await signEvent({
				kind: 27235,
				created_at: Math.floor(Date.now() / 1000),
				tags: [['u', apiUrl], ['method', 'GET']],
				content: ''
			});
		} catch { if (!isStale(gen)) impAppData = null; return; }
		if (isStale(gen)) return;
		const res = await fetch(apiUrl, { headers: { Authorization: `Nostr ${btoa(JSON.stringify(authEvent))}` } });
		if (!res.ok) { if (!isStale(gen)) impAppData = null; return; }
		if (isStale(gen)) return;
		const data = await res.json();
		if (!isStale(gen)) impAppData = mapImpressionRowsToAppData(studio.userApps, data.impressions ?? [], days);
	}

	// ── Trigger load when app / timeframes change ─────────────────────────────
	$effect(() => {
		const dlD = timeframeToDays(selectedDlTimeframe);
		const impD = timeframeToDays(selectedImpTimeframe);
		const zapD = timeframeToDays(selectedZapTimeframe);
		const pk = studio.studioPubkey;
		const apps = studio.userApps;
		const appsLoading = studio.appsLoading;

		if (!pk || apps.length === 0) {
			if (!appsLoading) {
				dlMetricsLoading = false;
				zapMetricsLoading = false;
				impMetricsLoading = false;
			}
			return;
		}

		loadGen += 1;
		const gen = loadGen;

		const needDl = dlD !== prevDlDays;
		const needImp = impD !== prevImpDays;
		const needZap = zapD !== prevZapDays;

		if (needDl) dlMetricsLoading = true; else dlMetricsLoading = false;
		if (needImp) impMetricsLoading = true; else impMetricsLoading = false;
		if (needZap) zapMetricsLoading = true; else zapMetricsLoading = false;

		const hashPromise = collectBlobHashesForDeveloper(pk, apps);

		if (needDl) void dlFlow(gen, dlD, hashPromise);
		if (needImp) void impFlow(gen, pk, impD);
		if (needZap) void zapFlow(gen, pk, zapD);
	});

	// ── Country breakdown ─────────────────────────────────────────────────────
	$effect(() => {
		app; selectedImpTimeframe;
		const pk = studio.studioPubkey;
		const apps = studio.userApps;
		const currentApp = app;
		if (!currentApp || !pk || apps.length === 0) {
			detailCountryRows = [];
			detailCountryLoading = false;
			return;
		}
		detailCountryGen += 1;
		const gen = detailCountryGen;
		detailCountryLoading = true;
		const days = timeframeToDays(selectedImpTimeframe);
		const range = buildIsoDateRange(days);
		void (async () => {
			try {
				const hashMap = await collectBlobHashesForDeveloper(pk, apps);
				if (gen !== detailCountryGen) return;
				const rows = await loadCountryBreakdownForApp(pk, range, currentApp, hashMap, 10);
				if (gen !== detailCountryGen) return;
				detailCountryRows = rows;
			} catch {
				if (gen === detailCountryGen) detailCountryRows = [];
			} finally {
				if (gen === detailCountryGen) detailCountryLoading = false;
			}
		})();
	});

	// ── Platform breakdown ────────────────────────────────────────────────────
	$effect(() => {
		app; selectedImpTimeframe;
		const pk = studio.studioPubkey;
		const apps = studio.userApps;
		const currentApp = app;
		if (!currentApp || !pk || apps.length === 0) {
			detailPlatformRows = [];
			detailPlatformLoading = false;
			return;
		}
		detailPlatformGen += 1;
		const gen = detailPlatformGen;
		detailPlatformLoading = true;
		const days = timeframeToDays(selectedImpTimeframe);
		const range = buildIsoDateRange(days);
		void (async () => {
			try {
				const hashMap = await collectBlobHashesForDeveloper(pk, apps);
				if (gen !== detailPlatformGen) return;
				const rows = await loadPlatformBreakdownForApp(pk, range, currentApp, hashMap);
				if (gen !== detailPlatformGen) return;
				detailPlatformRows = rows;
			} catch {
				if (gen === detailPlatformGen) detailPlatformRows = [];
			} finally {
				if (gen === detailPlatformGen) detailPlatformLoading = false;
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
			<p class="eyebrow-label">Loading…</p>
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
