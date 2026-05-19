<script lang="js">
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import AppsSearchPage from '$lib/components/apps/AppsSearchPage.svelte';
	import { SITE_URL } from '$lib/config';

	let { data } = $props();
</script>

<SeoHead
	title="Apps — Zapstore"
	description="Discover apps and stacks on Zapstore"
	url="{SITE_URL}/apps"
/>

<AppsSearchPage seedEvents={data.seedEvents ?? []} />
