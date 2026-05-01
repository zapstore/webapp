<script>
	import DevFeaturesSection from '$lib/components/developer/DevFeaturesSection.svelte';
	import OpenProtocolsSection from '$lib/components/developer/OpenProtocolsSection.svelte';
	import PublishCTA from '$lib/components/developer/PublishCTA.svelte';
	import StudioHero from '$lib/components/developer/StudioHero.svelte';
	import StudioToolsSection from '$lib/components/developer/StudioToolsSection.svelte';
	import WhatIfHero from '$lib/components/developer/WhatIfHero.svelte';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import { SITE_URL } from '$lib/config';
</script>

<SeoHead
	title="Zapstore — Developers"
	description="Publish without permission. Sign with your keys. Let communities curate. A developer suite built on open protocols."
	url="{SITE_URL}/developers"
/>

<WhatIfHero />
<DevFeaturesSection />
<OpenProtocolsSection />
<!-- <SignedSection /> -->
<StudioToolsSection />
<StudioHero />
<!-- <PublishAppSection /> -->
<PublishCTA />

<section class="border-t border-border/50 py-8 sm:py-10">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
		<p class="dev-cross-link-text">
			Deploying to your own users? See <a href="/enterprise" class="dev-cross-link"
				>Zapstore for organizations</a
			>.
		</p>
	</div>
</section>

<style>
	.dev-cross-link-text {
		margin: 0;
		font-size: 0.9375rem;
		color: var(--white33);
	}

	.dev-cross-link {
		color: var(--white66);
		text-decoration: none;
		border-bottom: 1px solid var(--white16);
		transition:
			color 0.15s ease,
			border-color 0.15s ease;
	}

	.dev-cross-link:hover {
		color: var(--white);
		border-bottom-color: var(--white33);
	}
</style>
