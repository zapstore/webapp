<script>
	import { getContext } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import StudioAppDetail from '$lib/components/studio/StudioAppDetail.svelte';
	import StudioAppEdit from '$lib/components/studio/StudioAppEdit.svelte';
	import {
		buildIsoDateRange,
		timeframeToDays
	} from '$lib/studio/analytics-http.js';
	import { collectBlobHashesForDeveloper } from '$lib/studio/collect-blob-hashes.js';
	import { loadCountryBreakdownForApp, loadPlatformBreakdownForApp } from '$lib/studio/analytics-http.js';

	const studio = getContext('studio');

	const naddr = $derived($page.params.naddr);
	const app = $derived(studio.userApps.find((a) => a.naddr === naddr) ?? null);

	let editingApp = $state(false);

	// ── Per-app analytics ───────────────────────────────────────────────────
	let selectedImpTimeframe = $state('30 Days');
	let selectedDlTimeframe = $state('30 Days');
	let selectedZapTimeframe = $state('30 Days');

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
			dlCounts={[]}
			impCounts={[]}
			zapCounts={[]}
			dlMetricsLoading={false}
			zapMetricsLoading={false}
			impMetricsLoading={false}
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
