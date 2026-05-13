<script>
	import { getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import StudioEmptyState from '$lib/components/studio/StudioEmptyState.svelte';

	const ctx = getContext('studio');
const studio = ctx ?? { appsLoading: true, userApps: [] };

	$effect(() => {
		if (!studio.appsLoading && studio.userApps.length > 0) {
			goto(`/studio/apps/${encodeURIComponent(studio.userApps[0].id)}`, { replaceState: true });
		}
	});
</script>

{#if !studio.appsLoading && studio.userApps.length === 0}
	<StudioEmptyState context="apps" />
{/if}
