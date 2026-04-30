<script>
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { getIsSignedIn } from '$lib/stores/auth.svelte.js';
	import { SHOW_STUDIO_SIGNED_IN_DASHBOARD } from '$lib/constants.js';
	import DevFeaturesSection from '$lib/components/developer/DevFeaturesSection.svelte';
	import OpenProtocolsSection from '$lib/components/developer/OpenProtocolsSection.svelte';
	import PublishAppSection from '$lib/components/developer/PublishAppSection.svelte';
	import SkillPubSection from '$lib/components/developer/ReachKitGatewaySection.svelte';
	import SignedSection from '$lib/components/developer/SignedSection.svelte';
	import StudioHero from '$lib/components/developer/StudioHero.svelte';
	import StudioToolsSection from '$lib/components/developer/StudioToolsSection.svelte';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import { SITE_URL } from '$lib/config';

	const signedIn = $derived(getIsSignedIn());

	$effect(() => {
		if (browser && signedIn && SHOW_STUDIO_SIGNED_IN_DASHBOARD) {
			goto('/studio');
		}
	});
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
<SkillPubSection />
