<script lang="js">
	import DocsDashboardShell from '$lib/components/docs/DocsDashboardShell.svelte';

	let { data, children } = $props();
</script>

<DocsDashboardShell navigation={data.navigation} contentProse={false}>
	{@render children()}
</DocsDashboardShell>
