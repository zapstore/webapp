<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { initCatalogs } from '$lib/stores/catalogs.svelte';
  import { initOnlineStatus, isOnline } from '$lib/stores/online.svelte';
  import { initNostrService } from '$lib/nostr';
  import { Header, LoadingBar } from '$lib/components';
  import '../app.css';
  
  let { children } = $props();
  let online = $derived(isOnline());
  
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

<div class="app-layout">
  <LoadingBar />
  <Header />
  
  {#if !online}
    <div class="offline-banner">
      <span class="offline-icon">📡</span>
      <span>You're offline — showing cached data</span>
    </div>
  {/if}
  
  <main class="main-content">
    {@render children()}
  </main>
  <footer class="footer">
    <p>Powered by Nostr</p>
  </footer>
</div>

<style>
  .app-layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  
  .offline-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--color-warning-bg, #fef3c7);
    color: var(--color-warning-text, #92400e);
    font-size: 0.875rem;
    font-weight: 500;
  }
  
  .offline-icon {
    font-size: 1rem;
  }
  
  .main-content {
    flex: 1;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
    padding: 1.5rem 1rem;
  }
  
  .footer {
    text-align: center;
    padding: 2rem 1rem;
    color: var(--color-text-tertiary, #9ca3af);
    font-size: 0.875rem;
    border-top: 1px solid var(--color-border, #e5e7eb);
  }
</style>
