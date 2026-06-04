<script lang="js">
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import StudioAssets from '$lib/components/studio/StudioAssets.svelte';
	import {
		SITE_URL,
		DOCS_OG_IMAGE,
		DOCS_OG_IMAGE_ALT,
		DOCS_OG_IMAGE_WIDTH,
		DOCS_OG_IMAGE_HEIGHT
	} from '$lib/config';
</script>

<SeoHead
	title="Zapstore Badge & Logo — Zapstore"
	description="Download the Zapstore badge and logo for your app website, GitHub README, or marketing materials."
	url="{SITE_URL}/assets"
	image={DOCS_OG_IMAGE}
	imageAlt={DOCS_OG_IMAGE_ALT}
	imageWidth={DOCS_OG_IMAGE_WIDTH}
	imageHeight={DOCS_OG_IMAGE_HEIGHT}
/>

<StudioAssets showTopbar={false} />
