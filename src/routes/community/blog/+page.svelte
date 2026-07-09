<script lang="js">
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import CommunityBlogFeed from '$lib/components/community/CommunityBlogFeed.svelte';
	import { SITE_URL } from '$lib/config';

	let { data } = $props();
</script>

<SeoHead
	title="Blog — Zapstore Community"
	description="Updates, essays, and notes from the Zapstore team."
	url="{SITE_URL}/community/blog"
/>

<div class="blog-page">
	<CommunityBlogFeed posts={data.posts} />
</div>

<style>
	.blog-page {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
</style>
