<script lang="js">
	import { page } from '$app/stores';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import DocsMarkdownArticle from '$lib/components/docs/DocsMarkdownArticle.svelte';
	import {
		SITE_URL,
		DOCS_OG_IMAGE,
		DOCS_OG_IMAGE_ALT,
		DOCS_OG_IMAGE_WIDTH,
		DOCS_OG_IMAGE_HEIGHT
	} from '$lib/config';

	let { data } = $props();
	const title = $derived(data.metadata?.title || 'Documentation');
	const description = $derived(data.metadata?.description || 'Zapstore documentation');
	const canonicalUrl = $derived(SITE_URL + $page.url.pathname);
</script>

<SeoHead
	title="{title} — Zapstore Documentation"
	{description}
	url={canonicalUrl}
	image={DOCS_OG_IMAGE}
	imageAlt={DOCS_OG_IMAGE_ALT}
	imageWidth={DOCS_OG_IMAGE_WIDTH}
	imageHeight={DOCS_OG_IMAGE_HEIGHT}
/>

<DocsMarkdownArticle title={data.metadata?.title} body={data.body} />
