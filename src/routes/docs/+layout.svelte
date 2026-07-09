<script lang="js">
	import { page } from '$app/stores';
	import DocsDashboardShell from '$lib/components/docs/DocsDashboardShell.svelte';

	let { data, children } = $props();

	const path = $derived($page.url.pathname);
	const isFlushDocsPage = $derived(
		path === '/docs/faq' ||
			path === '/docs/quickstart' ||
			path === '/docs/publish' ||
			path === '/docs/trust-model'
	);
</script>

<DocsDashboardShell
	navigation={data.navigation}
	contentProse={!isFlushDocsPage}
	contentFlush={isFlushDocsPage}
>
	{@render children()}
</DocsDashboardShell>
