<script>
	import DevFeaturesSection from '$lib/components/developer/DevFeaturesSection.svelte';
	import OpenProtocolsSection from '$lib/components/developer/OpenProtocolsSection.svelte';
	import PublishAppSection from '$lib/components/developer/PublishAppSection.svelte';
	import SignedSection from '$lib/components/developer/SignedSection.svelte';
	import StudioHero from '$lib/components/developer/StudioHero.svelte';
	import StudioToolsSection from '$lib/components/developer/StudioToolsSection.svelte';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import { SITE_URL } from '$lib/config';
</script>

<SeoHead
	title="Zapstore — Developers"
	description="A purpose-built developer suite. Reliable tools for shipping apps and interacting with communities of users."
	url="{SITE_URL}/developers"
/>

<StudioHero />
<DevFeaturesSection />
<StudioToolsSection />
<OpenProtocolsSection />
<SignedSection />
<PublishAppSection />
