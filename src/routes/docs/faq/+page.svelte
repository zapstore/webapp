<script lang="js">
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import FaqShell from '$lib/components/faq/FaqShell.svelte';
	import { DEVELOPER_FAQ_SECTIONS } from '$lib/data/developer-faq-content.js';
	import { buildCommunityFaqJsonLd } from '$lib/utils/community-faq-seo.js';
	import { SITE_URL } from '$lib/config';

	const faqUrl = `${SITE_URL}/docs/faq`;
	const seoTitle = 'Developer FAQ — Zapstore Docs';
	const seoDescription =
		'Developer FAQ for publishing apps on Zapstore with zsp, APK signing, Nostr verification, relay publishing, and troubleshooting.';

	const faqJsonLd = buildCommunityFaqJsonLd(DEVELOPER_FAQ_SECTIONS, faqUrl);
</script>

<SeoHead title={seoTitle} description={seoDescription} url={faqUrl} jsonld={faqJsonLd} />

<FaqShell
	title="Developer FAQ"
	crosslinkHref="/community/faq"
	crosslinkLabel="User FAQ"
	sections={DEVELOPER_FAQ_SECTIONS}
/>
