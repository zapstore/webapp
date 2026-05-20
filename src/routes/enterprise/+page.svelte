<script>
	import BusinessHero from '$lib/components/business/BusinessHero.svelte';
	import PressurePointsSection from '$lib/components/business/PressurePointsSection.svelte';
	import CapabilitiesSection from '$lib/components/business/CapabilitiesSection.svelte';
	import ContactFormSection from '$lib/components/business/ContactFormSection.svelte';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import { ChevronRight } from '$lib/components/icons';
	import { SITE_URL, SITE_NAME } from '$lib/config';

	/** @type {HTMLAnchorElement | null} */
	let crosslinkBtn = null;

	/** @param {MouseEvent} event */
	function handleCrosslinkMouseMove(event) {
		if (!crosslinkBtn) return;
		const rect = crosslinkBtn.getBoundingClientRect();
		crosslinkBtn.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
		crosslinkBtn.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
	}

	const title = `${SITE_NAME} for Organizations — Private app catalogs, deployed for your users`;
	const description =
		'Stand up a curated, signed, verifiable app catalog for your users — under your brand, on your infrastructure. Bespoke deployments by the team behind Zapstore.';

	const businessJsonLd = {
		'@context': 'https://schema.org',
		'@type': 'Service',
		name: `${SITE_NAME} for Organizations`,
		serviceType: 'Private app catalog deployment and advisory',
		provider: {
			'@type': 'Organization',
			name: SITE_NAME,
			url: SITE_URL
		},
		areaServed: 'Worldwide',
		description,
		url: `${SITE_URL}/enterprise`
	};
</script>

<SeoHead {title} {description} url="{SITE_URL}/enterprise" jsonld={businessJsonLd} />

<BusinessHero />
<PressurePointsSection />
<CapabilitiesSection />
<ContactFormSection />

<section class="border-t border-shell py-10 sm:py-12">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
		<p class="cross-link-text">Building an app yourself?</p>
		<a
			href="/developers"
			bind:this={crosslinkBtn}
			onmousemove={handleCrosslinkMouseMove}
			class="btn-glass-large btn-glass-with-chevron group inline-flex items-center gap-3 cross-link-btn"
		>
			Zapstore for developers
			<ChevronRight variant="outline" color="var(--white33)" size={18} className="transition-transform group-hover:translate-x-0.5" />
		</a>
	</div>
</section>

<style>
	.cross-link-text {
		margin: 0 0 1rem;
		font-size: 1.125rem;
		color: var(--white66);
	}

	.cross-link-btn {
		display: inline-flex;
	}
</style>
