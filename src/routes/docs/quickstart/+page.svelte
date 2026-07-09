<script lang="js">
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import DocsGetStarted from '$lib/components/docs/DocsGetStarted.svelte';
	import {
		DOCS_OG_IMAGE,
		DOCS_OG_IMAGE_ALT,
		DOCS_OG_IMAGE_WIDTH,
		DOCS_OG_IMAGE_HEIGHT
	} from '$lib/config';

	const seoTitle = 'Get started — Zapstore Documentation';
	const seoDescription =
		'Get started with Zapstore: install the Android app as a user, or publish your APK as a developer.';
</script>

<SeoHead
	title={seoTitle}
	description={seoDescription}
	image={DOCS_OG_IMAGE}
	imageAlt={DOCS_OG_IMAGE_ALT}
	imageWidth={DOCS_OG_IMAGE_WIDTH}
	imageHeight={DOCS_OG_IMAGE_HEIGHT}
/>

<DocsGetStarted />
