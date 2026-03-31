<script>
  import Hero from '$lib/components/reachkit/Hero.svelte';
  import PainSection from '$lib/components/reachkit/PainSection.svelte';
  import SolutionSection from '$lib/components/reachkit/SolutionSection.svelte';
  import PlatformsSection from '$lib/components/reachkit/PlatformsSection.svelte';
  import CTASection from '$lib/components/reachkit/CTASection.svelte';
  import SeoHead from '$lib/components/layout/SeoHead.svelte';
  import { SITE_URL } from '$lib/config';
</script>

<SeoHead
  title="ReachKit — Ship to every app store, faster"
  description="AI trained on thousands of real submissions predicts what reviewers will flag. Validate once, ship to 15+ app stores."
  url="{SITE_URL}/studio/reachkit"
/>

<Hero />
<PainSection />
<SolutionSection />
<PlatformsSection />
<CTASection />
