<script lang="js">
	import { page } from '$app/stores';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import DocsMarkdownArticle from '$lib/components/docs/DocsMarkdownArticle.svelte';
	import { SITE_URL } from '$lib/config';

	let { data } = $props();

	const title = $derived(data.metadata?.title || 'Blog');
	const description = $derived(data.metadata?.description || '');
	const canonicalUrl = $derived(SITE_URL + $page.url.pathname);
</script>

<SeoHead
	title="{title} — Zapstore Blog"
	{description}
	url={canonicalUrl}
	publishedTime={data.metadata?.date || undefined}
	author={data.metadata?.author || 'Zapstore'}
/>

<DocsMarkdownArticle title={data.metadata?.title} body={data.body} />
