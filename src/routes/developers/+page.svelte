<script>
	import DevFeaturesSection from '$lib/components/developer/DevFeaturesSection.svelte';
	import OpenProtocolsSection from '$lib/components/developer/OpenProtocolsSection.svelte';
	import StudioHero from '$lib/components/developer/StudioHero.svelte';
	import StudioToolsSection from '$lib/components/developer/StudioToolsSection.svelte';
	import WhatIfHero from '$lib/components/developer/WhatIfHero.svelte';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import { ChevronRight } from '$lib/components/icons';
	import { SITE_URL } from '$lib/config';

	/** @type {HTMLAnchorElement | null} */
	let crosslinkBtn = null;

	/** @param {MouseEvent} event */
	function handleCrosslinkMouseMove(event) {
		if (!crosslinkBtn) return;
		const rect = crosslinkBtn.getBoundingClientRect();
		crosslinkBtn.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
		crosslinkBtn.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
	}
</script>

<SeoHead
	title="Zapstore — Developers"
	description="Publish without permission. Sign with your keys. Let communities curate. A developer suite built on open protocols."
	url="{SITE_URL}/developers"
	image="{SITE_URL}/images/og-studio.png"
	imageWidth={1200}
	imageHeight={630}
	imageAlt="Zapstore Studio — The developer suite for open app distribution"
/>

<WhatIfHero />
<DevFeaturesSection />
<OpenProtocolsSection />
<!-- <SignedSection /> -->
<StudioToolsSection />
<StudioHero />

<section class="dev-crosslink-section py-10 sm:py-12">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
		<p class="dev-cross-link-text">Deploying to your own users?</p>
		<a
			href="/enterprise"
			bind:this={crosslinkBtn}
			onmousemove={handleCrosslinkMouseMove}
			class="btn-glass-large btn-glass-with-chevron group inline-flex items-center gap-3 dev-crosslink-btn"
		>
			Zapstore for organizations
			<ChevronRight
				variant="outline"
				color="var(--white33)"
				size={18}
				className="transition-transform group-hover:translate-x-0.5"
			/>
		</a>
	</div>
</section>

<style>
	.dev-crosslink-section {
		border-top: none;
	}

	.dev-cross-link-text {
		margin: 0 0 1rem;
		font-size: 1.125rem;
		color: var(--white66);
	}

	.dev-crosslink-btn {
		display: inline-flex;
	}
</style>
