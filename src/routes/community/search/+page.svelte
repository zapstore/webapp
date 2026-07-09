<script lang="js">
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import CommunitySearchShell from '$lib/components/community/CommunitySearchShell.svelte';
	import { SITE_URL } from '$lib/config';
</script>

<SeoHead
	title="Search — Zapstore Community"
	description="Search forum posts and comments in the Zapstore community."
	url="{SITE_URL}/community/search"
/>

<CommunitySearchShell />
