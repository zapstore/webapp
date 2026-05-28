<script lang="js">
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import FaqPage from '$lib/components/faq/FaqPage.svelte';
	import { COMMUNITY_FAQ_SECTIONS } from '$lib/data/community-faq-content.js';
	import { SITE_URL } from '$lib/config';
</script>

<SeoHead
	title="FAQ — Zapstore"
	description="Answers about installing Zapstore, app safety, trust signals, comparisons with other stores, features, and troubleshooting."
	url="{SITE_URL}/community/faq"
/>

<div class="community-faq-scroll" data-main-scroll>
	<div class="community-faq-page">
		<h1 class="community-faq-title">FAQ</h1>
		<p class="community-faq-lead text-muted-foreground">
			Install, safety, comparisons, and everyday use. Publishing an app?
			<a href="/docs/faq" class="community-faq-crosslink">See the Developer FAQ</a>.
		</p>
		<FaqPage sections={COMMUNITY_FAQ_SECTIONS} />
	</div>
</div>

<style>
	.community-faq-scroll {
		flex: 1;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}

	.community-faq-page {
		padding: 1.5rem 1rem 2.5rem;
		max-width: 42rem;
		margin: 0 auto;
	}

	.community-faq-title {
		font-size: 1.5rem;
		font-weight: 650;
		letter-spacing: -0.02em;
		color: var(--white);
		margin: 0 0 0.5rem;
	}

	.community-faq-lead {
		font-size: 0.9375rem;
		line-height: 1.5;
		margin: 0 0 1.75rem;
	}

	.community-faq-crosslink {
		color: var(--blurple, #7c6cff);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
</style>
