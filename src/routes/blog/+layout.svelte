<script lang="js">
	import DocsDashboardShell from '$lib/components/docs/DocsDashboardShell.svelte';

	let { data, children } = $props();
</script>

<DocsDashboardShell
	navigation={data.navigation}
	sidebarTitle="Blog"
	showExtraNav={false}
	contentProse={false}
	contentFlush={true}
>
	{@render children()}
</DocsDashboardShell>
