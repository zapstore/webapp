<script>
/**
 * Studio App Edit Page — /studio/apps/[id]/edit
 *
 * Dedicated URL for editing an app. Resolves the app from the studio context
 * and renders StudioAppEdit directly (no detail view toggle needed).
 */
import { getContext } from 'svelte';
import { page } from '$app/stores';
import { goto } from '$app/navigation';
import StudioAppEdit from '$lib/components/studio/StudioAppEdit.svelte';

const ctx = getContext('studio');
const studio = ctx ?? { userApps: [], appsLoading: true, updateApp: () => {} };

const appId = $derived.by(() => {
	const raw = $page.params.id ?? '';
	try { return decodeURIComponent(raw); }
	catch { return raw; }
});

const app = $derived(studio.userApps.find((a) => a.id === appId) ?? null);

function handleSaved(updatedApp) {
	if (updatedApp) studio.updateApp(updatedApp);
	goto('/studio/apps/' + encodeURIComponent(appId));
}

function handleBack() {
	goto('/studio/apps/' + encodeURIComponent(appId));
}

function handleDeleted(_deletedEventId) {
	goto('/studio/apps');
}
</script>

<div class="detail-scroll" data-main-scroll>
	{#if !app}
		<div class="app-not-found">
			{#if studio.appsLoading}
				<p class="eyebrow-label">Loading…</p>
			{:else}
				<p class="eyebrow-label">App not found.</p>
			{/if}
		</div>
	{:else}
		<StudioAppEdit
			{app}
			onBack={handleBack}
			onSaved={handleSaved}
			onDeleted={handleDeleted}
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
