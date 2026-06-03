<script lang="js">
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import DocsGetStarted from '$lib/components/docs/DocsGetStarted.svelte';
	import { SITE_URL } from '$lib/config';

	const pageUrl = `${SITE_URL}/docs/quickstart`;
	const seoTitle = 'Get started — Zapstore Documentation';
	const seoDescription =
		'Get started with Zapstore: install the Android app as a user, or publish your APK as a developer.';
</script>

<SeoHead title={seoTitle} description={seoDescription} url={pageUrl} />

<DocsGetStarted />
