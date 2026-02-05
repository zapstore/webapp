<script>
  import ReachKitHeader from '$lib/components/reachkit/ReachKitHeader.svelte';
  import Footer from '$lib/components/layout/Footer.svelte';
</script>

<div class="min-h-screen relative bg-background reachkit-theme">
  <div class="fixed inset-0 bg-gradient-subtle pointer-events-none"></div>
  <div class="fixed inset-0 bg-dither pointer-events-none opacity-40"></div>

  <div class="relative z-10 flex flex-col min-h-screen">
    <ReachKitHeader />
    <main class="flex-1">
      <slot />
    </main>
    <Footer />
  </div>
</div>
