<script lang="js">
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import AppsSearchPage from '$lib/components/apps/AppsSearchPage.svelte';
	import { SITE_URL } from '$lib/config';

	let { data } = $props();
</script>

<SeoHead
	title="Apps — Zapstore"
	description="Browse Android apps on the open app store. Curated by communities."
	url="{SITE_URL}/apps"
/>

<AppsSearchPage seedEvents={data.seedEvents ?? []} />
