<script lang="ts">
  import OpenProtocolsSection from '$lib/components/developer/OpenProtocolsSection.svelte';
  import PublishAppSection from '$lib/components/developer/PublishAppSection.svelte';
  import ReachKitGatewaySection from '$lib/components/developer/ReachKitGatewaySection.svelte';
  import SignedSection from '$lib/components/developer/SignedSection.svelte';
  import StudioHero from '$lib/components/developer/StudioHero.svelte';
  import StudioToolsSection from '$lib/components/developer/StudioToolsSection.svelte';
</script>

<svelte:head>
  <title>Zapstore Studio — Developers</title>
  <meta
    name="description"
    content="A purpose-built developer suite. Reliable tools for shipping apps and interacting with communities of users"
  />
</svelte:head>

<StudioHero />
<StudioToolsSection />
<OpenProtocolsSection />
<SignedSection />
<PublishAppSection />
<ReachKitGatewaySection />
