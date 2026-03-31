<script lang="js">
import { onMount } from 'svelte';
import { browser } from '$app/environment';
import DownloadModal from '$lib/components/common/DownloadModal.svelte';
import HeroSection from '$lib/components/landing/HeroSection.svelte';
import GetTheAppSection from '$lib/components/landing/GetTheAppSection.svelte';
// import StatusQuoSection from '$lib/components/landing/StatusQuoSection.svelte';
import OldWaySection from '$lib/components/landing/OldWaySection.svelte';
import TestimonialsSection from '$lib/components/landing/TestimonialsSection.svelte';
// import ZapTheAppSection from "$lib/components/landing/ZapTheAppSection.svelte";
import ReleaseYourAppsSection from '$lib/components/landing/ReleaseYourAppsSection.svelte';
import WithZapstoreSection from '$lib/components/landing/WithZapstoreSection.svelte';
import RoadmapSection from '$lib/components/landing/RoadmapSection.svelte';
import TeamSection from '$lib/components/landing/TeamSection.svelte';
import { SvelteMap } from 'svelte/reactivity';
import { fetchProfilesBatch } from '$lib/nostr';
import SeoHead from '$lib/components/layout/SeoHead.svelte';
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, SITE_ICON, SITE_GITHUB } from '$lib/config';

const homeJsonLd = {
	'@context': 'https://schema.org',
	'@graph': [
		{
			'@type': 'Organization',
			'@id': `${SITE_URL}/#organization`,
			name: SITE_NAME,
			url: SITE_URL,
			logo: SITE_ICON,
			sameAs: [SITE_GITHUB, 'https://x.com/zapstore_']
		},
		{
			'@type': 'WebSite',
			'@id': `${SITE_URL}/#website`,
			url: SITE_URL,
			name: SITE_NAME,
			description: SITE_DESCRIPTION,
			publisher: { '@id': `${SITE_URL}/#organization` },
			potentialAction: {
				'@type': 'SearchAction',
				target: `${SITE_URL}/apps?q={search_term_string}`,
				'query-input': 'required name=search_term_string'
			}
		}
	]
};
let { data } = $props();
const initialTestimonials = $derived(data?.testimonials ?? []);
let testimonials = $state([]);
let showDownloadModal = $state(false);
if (browser) {
    onMount(async () => {
        const raw = Array.isArray(initialTestimonials) ? initialTestimonials : [];
        testimonials = raw;
        if (raw.length === 0)
            return;
        const profilesByPubkey = new SvelteMap();
        const pubkeys = [...new Set(raw.map((t) => t.pubkey).filter(Boolean))].slice(0, 30);
        const fetched = await fetchProfilesBatch(pubkeys);
        for (const pubkey of pubkeys) {
            const event = fetched.get(pubkey);
            if (!event?.content)
                continue;
            try {
                const content = JSON.parse(event.content);
                profilesByPubkey.set(pubkey, {
                    displayName: content.display_name ?? content.name,
                    name: content.name,
                    picture: content.picture,
                    nip05: content.nip05
                });
            }
            catch {
                /* ignore malformed profile content */
            }
        }
        testimonials = raw.map((t) => ({
            ...t,
            profile: profilesByPubkey.get(t.pubkey) ?? t.profile
        }));
    });
}
$effect(() => {
    if (!browser)
        return;
    if (testimonials.length > 0)
        return;
    if (initialTestimonials.length > 0)
        testimonials = initialTestimonials;
});
</script>

<SeoHead url={SITE_URL} jsonld={homeJsonLd} />

<DownloadModal bind:open={showDownloadModal} isZapstore={true} />

<!-- Hero Section -->
<HeroSection showDownloadModal={() => (showDownloadModal = true)} />

<!-- Status Quo Section -->
<!-- <StatusQuoSection /> -->

<!-- Missing Out Section -->
<OldWaySection />

<!-- With Zapstore Section -->
<WithZapstoreSection />

<!-- Get The App Section -->
<GetTheAppSection showDownloadModal={() => (showDownloadModal = true)} />

<!-- Release with ease Section -->
<ReleaseYourAppsSection />

<!-- Testimonials Section -->
<TestimonialsSection {testimonials} />

<!-- Zap The App Section (commented out for now) -->
<!-- <ZapTheAppSection /> -->

<!-- Roadmap Section -->
<RoadmapSection />

<!-- Team Section -->
<TeamSection />
