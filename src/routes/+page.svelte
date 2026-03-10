<script lang="js">
import { onMount } from 'svelte';
import { browser } from '$app/environment';
import DownloadModal from '$lib/components/common/DownloadModal.svelte';
import ParallaxHero from '$lib/components/landing/ParallaxHero.svelte';
import GetTheAppSection from '$lib/components/landing/GetTheAppSection.svelte';
import TestimonialsSection from '$lib/components/landing/TestimonialsSection.svelte';
// import ZapTheAppSection from "$lib/components/landing/ZapTheAppSection.svelte";
import ReleaseYourAppsSection from '$lib/components/landing/ReleaseYourAppsSection.svelte';
import ComparisonSection from '$lib/components/landing/ComparisonSection.svelte';
import RoadmapSection from '$lib/components/landing/RoadmapSection.svelte';
import TeamSection from '$lib/components/landing/TeamSection.svelte';
import { fetchProfilesBatch } from '$lib/nostr';
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
        const profilesByPubkey = new Map();
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

<svelte:head>
	<title>Zapstore</title>
	<meta
		name="description"
		content="Discover apps on Nostr. Open source, decentralized app store."
	/>
</svelte:head>

<DownloadModal bind:open={showDownloadModal} isZapstore={true} />

<!-- Hero Section -->
<ParallaxHero showDownloadModal={() => (showDownloadModal = true)} />

<!-- Get The App Section -->
<GetTheAppSection showDownloadModal={() => (showDownloadModal = true)} />

<!-- Comparison Section -->
<ComparisonSection />

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
