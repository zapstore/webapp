<script lang="js">
	import { page } from '$app/stores';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import BlogArticleDetail from '$lib/components/community/BlogArticleDetail.svelte';
	import { SITE_URL } from '$lib/config';

	let { data } = $props();

	const title = $derived(data.metadata?.title || 'Blog');
	const description = $derived(data.summary || 'Zapstore blog');
	const canonicalUrl = $derived(SITE_URL + $page.url.pathname);
</script>

<SeoHead
	title="{title} — Zapstore Blog"
	{description}
	url={canonicalUrl}
	image={data.cardImage ? SITE_URL + data.cardImage : undefined}
	publishedTime={data.metadata?.date || undefined}
	author={data.metadata?.author || 'Zapstore'}
/>

<div class="blog-article-page">
	<BlogArticleDetail
		{title}
		body={data.body}
		publishedAt={data.metadata?.date || null}
		cardImage={data.cardImage}
	/>
</div>

<style>
	.blog-article-page {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
</style>
