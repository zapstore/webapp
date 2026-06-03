<script lang="js">
import { page } from '$app/stores';
import SeoHead from '$lib/components/layout/SeoHead.svelte';
import { SITE_URL } from '$lib/config';

let { data } = $props();
let title = $derived(data.metadata?.title || 'Documentation');
let description = $derived(data.metadata?.description || 'Zapstore documentation');
let Content = $derived(data.content);
const canonicalUrl = $derived(SITE_URL + $page.url.pathname);
</script>

<SeoHead title="{title} — Zapstore Documentation" {description} url={canonicalUrl} />

<article class="prose max-w-none">
	{#if data.metadata?.title}
		<h1>{data.metadata.title}</h1>
	{/if}
	<Content />
</article>
