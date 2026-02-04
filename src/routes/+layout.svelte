<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { initCatalogs } from '$lib/stores/catalogs.svelte';
  import { initOnlineStatus, isOnline } from '$lib/stores/online.svelte';
  import { initNostrService } from '$lib/nostr';
  import Header from '$lib/components/layout/Header.svelte';
  import Footer from '$lib/components/layout/Footer.svelte';
  import NavigationProgress from '$lib/components/layout/NavigationProgress.svelte';
  import '../app.css';
  
  let { children } = $props();
  let online = $derived(isOnline());
  
  // Determine header variant based on route
  let isLandingPage = $derived($page.url.pathname === '/');
  let isBrowsePage = $derived(
    $page.url.pathname === '/discover' ||
    $page.url.pathname === '/apps' ||
    $page.url.pathname === '/stacks' ||
    $page.url.pathname === '/studio' ||
    $page.url.pathname === '/search'
  );
  
  // Detail pages use their own contextual header
  let isDetailPage = $derived(
    /^\/apps\/[^/]+$/.test($page.url.pathname) ||
    /^\/stacks\/[^/]+$/.test($page.url.pathname) ||
    /^\/p\/[^/]+$/.test($page.url.pathname)
  );
  
  // Determine page title for browse variant
  let pageTitle = $derived(
    $page.url.pathname === '/discover' ? 'Discover' :
    $page.url.pathname === '/apps' ? 'Apps' :
    $page.url.pathname === '/stacks' ? 'Stacks' :
    $page.url.pathname === '/studio' ? 'Studio' :
    $page.url.pathname === '/search' ? 'Search' : ''
  );
  
  onMount(async () => {
    if (browser) {
      // Initialize online/offline detection
      initOnlineStatus();
      // Initialize Nostr service (cache, store, persistence)
      await initNostrService();
      // Initialize catalog preferences from localStorage
      initCatalogs();
    }
  });
</script>

<div class="min-h-screen relative bg-background">
  <!-- Subtle gradient overlay -->
  <div class="fixed inset-0 bg-gradient-subtle pointer-events-none"></div>
  <!-- Noise/dither for depth -->
  <div class="fixed inset-0 bg-dither pointer-events-none opacity-40"></div>

  <div class="relative z-10 flex flex-col min-h-screen">
    <NavigationProgress />
    
    {#if !isDetailPage}
      <Header 
        variant={isLandingPage ? 'landing' : 'browse'} 
        pageTitle={isBrowsePage ? pageTitle : ''} 
      />
    {/if}
    
    {#if !online}
      <div class="offline-banner">
        <span class="offline-icon">📡</span>
        <span>You're offline — showing cached data</span>
      </div>
    {/if}
    
    <main class="flex-1 main-content" class:has-header={!isDetailPage}>
      {@render children()}
    </main>
    
    {#if !isDetailPage}
      <Footer />
    {/if}
  </div>
</div>

<style>
  .has-header {
    padding-top: 64px;
  }
  
  .offline-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: hsl(var(--goldColor33));
    color: hsl(var(--goldColor));
    font-size: 0.875rem;
    font-weight: 500;
  }
  
  .offline-icon {
    font-size: 1rem;
  }
</style>
