<script>
	import BusinessHero from '$lib/components/business/BusinessHero.svelte';
	import PressurePointsSection from '$lib/components/business/PressurePointsSection.svelte';
	import CapabilitiesSection from '$lib/components/business/CapabilitiesSection.svelte';
	import ContactFormSection from '$lib/components/business/ContactFormSection.svelte';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import { SITE_URL, SITE_NAME } from '$lib/config';

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

<section class="border-t border-border/50 py-8 sm:py-10">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
		<p class="cross-link-text">
			Building an app yourself? See <a href="/developers" class="cross-link"
				>Zapstore for developers</a
			>.
		</p>
	</div>
</section>

<style>
	.cross-link-text {
		margin: 0;
		font-size: 0.9375rem;
		color: var(--white33);
	}

	.cross-link {
		color: var(--white66);
		text-decoration: none;
		border-bottom: 1px solid var(--white16);
		transition: color 0.15s ease, border-color 0.15s ease;
	}

	.cross-link:hover {
		color: var(--white);
		border-bottom-color: var(--white33);
	}
</style>
