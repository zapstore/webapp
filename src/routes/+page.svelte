<script lang="ts">
  import DownloadModal from "$lib/components/common/DownloadModal.svelte";
  import ParallaxHero from "$lib/components/landing/ParallaxHero.svelte";
  import GetTheAppSection from "$lib/components/landing/GetTheAppSection.svelte";
  import TestimonialsSection from "$lib/components/landing/TestimonialsSection.svelte";
  import ZapTheAppSection from "$lib/components/landing/ZapTheAppSection.svelte";
  import ReleaseYourAppsSection from "$lib/components/landing/ReleaseYourAppsSection.svelte";
  import DifferenceSection from "$lib/components/landing/DifferenceSection.svelte";
  import RoadmapSection from "$lib/components/landing/RoadmapSection.svelte";
  import TeamSection from "$lib/components/landing/TeamSection.svelte";

  export let data;

  let testimonials = data.testimonials || [];
  let showDownloadModal = false;
</script>

<svelte:head>
  <title>Zapstore</title>
  <meta name="description" content="Discover apps on Nostr. Open source, decentralized app store." />
</svelte:head>

<DownloadModal bind:open={showDownloadModal} isZapstore={true} />

<!-- Hero Section -->
<ParallaxHero />

<!-- Get The App Section -->
<GetTheAppSection showDownloadModal={() => (showDownloadModal = true)} />

<!-- Release with ease Section -->
<ReleaseYourAppsSection />

<!-- Testimonials Section -->
<TestimonialsSection {testimonials} />

<!-- What's the difference Section -->
<DifferenceSection />

<!-- Zap The App Section -->
<ZapTheAppSection />

<!-- Roadmap Section -->
<RoadmapSection />

<!-- Team Section -->
<TeamSection />
