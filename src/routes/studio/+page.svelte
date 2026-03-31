<script>
	import { getIsSignedIn } from '$lib/stores/auth.svelte.js';
	import StudioApp from '$lib/components/studio/StudioApp.svelte';
	import DevFeaturesSection from '$lib/components/developer/DevFeaturesSection.svelte';
	import OpenProtocolsSection from '$lib/components/developer/OpenProtocolsSection.svelte';
	import PublishAppSection from '$lib/components/developer/PublishAppSection.svelte';
	import SkillPubSection from '$lib/components/developer/ReachKitGatewaySection.svelte';
	import SignedSection from '$lib/components/developer/SignedSection.svelte';
	import StudioHero from '$lib/components/developer/StudioHero.svelte';
	import StudioToolsSection from '$lib/components/developer/StudioToolsSection.svelte';
	import { SHOW_STUDIO_SIGNED_IN_DASHBOARD } from '$lib/constants.js';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import { SITE_URL } from '$lib/config';

	const signedIn = $derived(getIsSignedIn());
</script>

<SeoHead
	title="Zapstore Studio — Developers"
	description="A purpose-built developer suite. Reliable tools for shipping apps and interacting with communities of users."
	url="{SITE_URL}/studio"
/>

{#if signedIn && SHOW_STUDIO_SIGNED_IN_DASHBOARD}
	<StudioApp />
{:else}
	<StudioHero />
	<DevFeaturesSection />
	<StudioToolsSection />
	<OpenProtocolsSection />
	<SignedSection />
	<PublishAppSection />
	<SkillPubSection />
{/if}
