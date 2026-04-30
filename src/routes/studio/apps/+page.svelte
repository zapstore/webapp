<script>
	import { getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import StudioEmptyState from '$lib/components/studio/StudioEmptyState.svelte';

	const studio = getContext('studio');

	$effect(() => {
		if (!studio.appsLoading && studio.userApps.length > 0) {
			goto(`/studio/apps/${studio.userApps[0].naddr}`, { replaceState: true });
		}
	});
</script>

{#if !studio.appsLoading && studio.userApps.length === 0}
	<StudioEmptyState context="apps" />
{/if}
