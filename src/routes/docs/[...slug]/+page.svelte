<script lang="js">
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import DocsMarkdownArticle from '$lib/components/docs/DocsMarkdownArticle.svelte';
	import {
		DOCS_OG_IMAGE,
		DOCS_OG_IMAGE_ALT,
		DOCS_OG_IMAGE_WIDTH,
		DOCS_OG_IMAGE_HEIGHT
	} from '$lib/config';

	let { data } = $props();
	const title = $derived(data.metadata?.title || 'Documentation');
	const description = $derived(data.metadata?.description || 'Zapstore documentation');
</script>

<SeoHead
	title="{title} — Zapstore Documentation"
	{description}
	image={DOCS_OG_IMAGE}
	imageAlt={DOCS_OG_IMAGE_ALT}
	imageWidth={DOCS_OG_IMAGE_WIDTH}
	imageHeight={DOCS_OG_IMAGE_HEIGHT}
/>

<DocsMarkdownArticle title={data.metadata?.title} body={data.body} />
