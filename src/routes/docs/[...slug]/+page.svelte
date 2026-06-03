<script lang="js">
	import { page } from '$app/stores';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import DocsMarkdownArticle from '$lib/components/docs/DocsMarkdownArticle.svelte';
	import { SITE_URL } from '$lib/config';

	let { data } = $props();
	const title = $derived(data.metadata?.title || 'Documentation');
	const description = $derived(data.metadata?.description || 'Zapstore documentation');
	const canonicalUrl = $derived(SITE_URL + $page.url.pathname);
</script>

<SeoHead title="{title} — Zapstore Documentation" {description} url={canonicalUrl} />

<DocsMarkdownArticle title={data.metadata?.title} body={data.body} />
