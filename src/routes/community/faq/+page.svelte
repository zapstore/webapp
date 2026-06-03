<script lang="js">
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import DownloadModal from '$lib/components/common/DownloadModal.svelte';
	import FaqShell from '$lib/components/faq/FaqShell.svelte';
	import { COMMUNITY_FAQ_SECTIONS } from '$lib/data/community-faq-content.js';
	import { buildCommunityFaqJsonLd } from '$lib/utils/community-faq-seo.js';
	import { SITE_URL } from '$lib/config';

	const faqUrl = `${SITE_URL}/community/faq`;
	const seoTitle = 'User FAQ — Zapstore';
	const seoDescription =
		'User FAQ for Zapstore: how to install, stay safe with Web of Trust, compare with Google Play, F-Droid and Obtainium, use Stacks and tips, and fix common update errors.';

	const faqJsonLd = buildCommunityFaqJsonLd(COMMUNITY_FAQ_SECTIONS, faqUrl);

	let showDownloadModal = $state(false);
</script>

<SeoHead title={seoTitle} description={seoDescription} url={faqUrl} jsonld={faqJsonLd} />

<FaqShell
	title="User FAQ"
	crosslinkHref="/docs/faq"
	crosslinkLabel="Developer FAQ"
	crosslinkIconRotate="45deg"
	sections={COMMUNITY_FAQ_SECTIONS}
	onZapstoreDownload={() => (showDownloadModal = true)}
/>

<DownloadModal bind:open={showDownloadModal} isZapstore={true} />
