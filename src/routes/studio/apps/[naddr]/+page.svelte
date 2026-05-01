<script>
	import { getContext } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import StudioAppDetail from '$lib/components/studio/StudioAppDetail.svelte';
	import StudioAppEdit from '$lib/components/studio/StudioAppEdit.svelte';
	import { buildIsoDateRange, timeframeToDays } from '$lib/studio/analytics-http.js';
	import {
		counts2xForApp,
		getCountryBreakdown,
		getPlatformBreakdown,
		studioAnalytics
	} from '$lib/stores/studio-analytics.svelte.js';

	const studio = getContext('studio');

	const naddr = $derived($page.params.naddr);
	const app = $derived(studio.userApps.find((a) => a.naddr === naddr) ?? null);

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

	// ── Chart counts: slice the cached publisher series for the current app ───
	// Two windows back-to-back so StudioAppDetail can compute the prior-period % ticker.
	const dlCounts = $derived(
		app ? counts2xForApp(studioAnalytics.downloadsSeries, app.id, timeframeToDays(selectedDlTimeframe)) : []
	);
	const zapCounts = $derived(
		app ? counts2xForApp(studioAnalytics.zapsSeries, app.id, timeframeToDays(selectedZapTimeframe)) : []
	);
	const impCounts = $derived(
		app ? counts2xForApp(studioAnalytics.impressionsSeries, app.id, timeframeToDays(selectedImpTimeframe)) : []
	);

	const dlMetricsLoading = $derived(studioAnalytics.downloadsLoading);
	const zapMetricsLoading = $derived(studioAnalytics.zapsLoading);
	const impMetricsLoading = $derived(studioAnalytics.impressionsLoading);

	// ── Per-app country / platform breakdowns ─────────────────────────────────
	let detailCountryRows = $state(/** @type {Array<{ countryKey: string, label: string, impressions: number, downloads: number }>} */ ([]));
	let detailCountryLoading = $state(false);
	let detailPlatformRows = $state(/** @type {Array<{ source: string, label: string, impressions: number, downloads: number }>} */ ([]));
	let detailPlatformLoading = $state(false);

	let countryGen = 0;
	let platformGen = 0;

	$effect(() => {
		const pk = studioAnalytics.pubkey;
		const currentApp = app;
		const days = timeframeToDays(selectedImpTimeframe);
		if (!currentApp || !pk) {
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
				const rows = await getCountryBreakdown(range, currentApp.id);
				if (gen !== countryGen) return;
				detailCountryRows = rows;
			} finally {
				if (gen === countryGen) detailCountryLoading = false;
			}
		})();
	});

	$effect(() => {
		const pk = studioAnalytics.pubkey;
		const currentApp = app;
		const days = timeframeToDays(selectedImpTimeframe);
		if (!currentApp || !pk) {
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
				const rows = await getPlatformBreakdown(range, currentApp.id);
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
