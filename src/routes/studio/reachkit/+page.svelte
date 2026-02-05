<script>
  import Hero from '$lib/components/reachkit/Hero.svelte';
  import PainSection from '$lib/components/reachkit/PainSection.svelte';
  import SolutionSection from '$lib/components/reachkit/SolutionSection.svelte';
  import PlatformsSection from '$lib/components/reachkit/PlatformsSection.svelte';
  import CTASection from '$lib/components/reachkit/CTASection.svelte';
</script>

<svelte:head>
  <title>ReachKit — Ship to every app store, faster</title>
  <meta name="description" content="AI trained on thousands of real submissions predicts what reviewers will flag. Validate once, ship to 15+ app stores." />
  <meta property="og:title" content="ReachKit — Ship to every app store, faster" />
  <meta property="og:description" content="AI trained on thousands of real submissions predicts what reviewers will flag — before you hit submit." />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<Hero />
<PainSection />
<SolutionSection />
<PlatformsSection />
<CTASection />
