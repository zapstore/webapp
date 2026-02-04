<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { beforeNavigate } from '$app/navigation';
  import { wheelScroll } from '$lib/actions/wheelScroll.js';
  import SectionHeader from '$lib/components/cards/SectionHeader.svelte';
  import AppSmallCard from '$lib/components/cards/AppSmallCard.svelte';
  import AppStackCard from '$lib/components/cards/AppStackCard.svelte';
  import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
  import {
    getApps,
    getHasMore,
    isRefreshing,
    isLoadingMore,
    isStoreInitialized,
    initWithPrerenderedData,
    scheduleRefresh,
    loadMore
  } from '$lib/stores/nostr.svelte';
  import {
    getStacks,
    isStacksInitialized,
    initWithPrerenderedStacks,
    scheduleStacksRefresh,
    resolveStackApps,
    getResolvedStacks,
    setResolvedStacks
  } from '$lib/stores/stacks.svelte';
  import { nip19 } from 'nostr-tools';
  import { encodeAppNaddr, encodeStackNaddr, type App, type AppStack } from '$lib/nostr/models';
  import { fetchProfile } from '$lib/nostr/service';
  import { parseProfile } from '$lib/nostr/models';
  import type { PageData } from './$types';

  // Server-provided data
  let { data }: { data: PageData } = $props();

  // Refs for horizontal scroll containers
  let appsScrollContainer: HTMLElement | null = $state(null);
  let stacksScrollContainer: HTMLElement | null = $state(null);

  // Save scroll positions before navigating away
  beforeNavigate(() => {
    if (!browser) return;
    
    const scrollState = {
      scrollY: window.scrollY,
      appsScrollX: appsScrollContainer?.scrollLeft ?? 0,
      stacksScrollX: stacksScrollContainer?.scrollLeft ?? 0,
      timestamp: Date.now()
    };
    sessionStorage.setItem('discover_scroll', JSON.stringify(scrollState));
  });

  // Restore scroll positions on mount (when coming back)
  let pendingScrollRestore: { scrollY: number; appsScrollX: number; stacksScrollX: number } | null = null;
  
  function restoreScrollPositions() {
    const saved = sessionStorage.getItem('discover_scroll');
    if (saved) {
      try {
        const scrollState = JSON.parse(saved);
        // Only restore if saved within last 5 minutes (avoid stale data)
        if (Date.now() - scrollState.timestamp < 5 * 60 * 1000) {
          pendingScrollRestore = scrollState;
          // Restore vertical scroll immediately
          if (scrollState.scrollY > 0) {
            window.scrollTo(0, scrollState.scrollY);
          }
          // Try to restore horizontal positions immediately
          tryRestoreHorizontalScroll();
        }
      } catch (e) {
        // Ignore parse errors
      }
      // Clear after restoring
      sessionStorage.removeItem('discover_scroll');
    }
  }
  
  function tryRestoreHorizontalScroll() {
    if (!pendingScrollRestore) return;
    
    let restored = false;
    if (appsScrollContainer && pendingScrollRestore.appsScrollX > 0) {
      appsScrollContainer.scrollLeft = pendingScrollRestore.appsScrollX;
      restored = true;
    }
    if (stacksScrollContainer && pendingScrollRestore.stacksScrollX > 0) {
      stacksScrollContainer.scrollLeft = pendingScrollRestore.stacksScrollX;
      restored = true;
    }
    
    // If both containers exist and we restored, clear pending
    if (appsScrollContainer && stacksScrollContainer) {
      pendingScrollRestore = null;
    } else if (!restored) {
      // Containers not ready, try again next frame
      requestAnimationFrame(tryRestoreHorizontalScroll);
    }
  }
  
  // Also try to restore when scroll containers become available
  $effect(() => {
    if (browser && pendingScrollRestore && (appsScrollContainer || stacksScrollContainer)) {
      tryRestoreHorizontalScroll();
    }
  });

  // Reactive state from stores
  const storeApps = $derived(getApps());
  const storeInitialized = $derived(isStoreInitialized());
  const stacks = $derived(getStacks());
  const hasMore = $derived(getHasMore());
  const refreshing = $derived(isRefreshing());
  const loadingMore = $derived(isLoadingMore());
  const stacksInitialized = $derived(isStacksInitialized());

  // Use prerendered data until store is initialized, then use store data
  const apps = $derived(storeInitialized ? storeApps : data.apps);

  // Horizontal infinite scroll: load more when near right edge
  const HORIZONTAL_SCROLL_THRESHOLD = 500; // pixels from right edge - load early for smooth experience
  
  function handleAppsScroll() {
    if (!appsScrollContainer || !hasMore || loadingMore) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = appsScrollContainer;
    const distanceFromEnd = scrollWidth - scrollLeft - clientWidth;
    
    if (distanceFromEnd < HORIZONTAL_SCROLL_THRESHOLD) {
      loadMore();
    }
  }

  // Resolved stacks with apps and creators - use cached version from store
  const cachedResolvedStacks = $derived(getResolvedStacks());
  let stacksLoading = $state(false);

  // Group apps into columns of 4 for horizontal scroll
  function getAppColumns(appList: App[], itemsPerColumn = 4) {
    const columns: App[][] = [];
    for (let i = 0; i < appList.length; i += itemsPerColumn) {
      columns.push(appList.slice(i, i + itemsPerColumn));
    }
    return columns;
  }

  const appColumns = $derived(getAppColumns(apps, 4));

  function getAppUrl(app: App): string {
    return `/apps/${app.naddr}`;
  }

  function getStackUrl(stack: { pubkey: string; dTag: string }): string {
    return `/stacks/${encodeStackNaddr(stack.pubkey, stack.dTag)}`;
  }

  async function loadResolvedStacks() {
    if (!browser || stacks.length === 0) return;

    stacksLoading = true;

    try {
      const resolved = await Promise.all(
        stacks.slice(0, 20).map(async (stack) => {
          // Resolve apps for the stack
          const stackApps = await resolveStackApps(stack);

          // Fetch creator profile from social relays
          let creator = undefined;
          if (stack.pubkey) {
            try {
              const profileEvent = await fetchProfile(stack.pubkey);
              if (profileEvent) {
                const profile = parseProfile(profileEvent);
                creator = {
                  name: profile.displayName || profile.name,
                  picture: profile.picture,
                  pubkey: stack.pubkey,
                  npub: nip19.npubEncode(stack.pubkey)
                };
              }
            } catch (e) {
              // Profile fetch failed, continue without creator
            }
          }

          return {
            name: stack.title,
            description: stack.description,
            apps: stackApps,
            creator,
            pubkey: stack.pubkey,
            dTag: stack.dTag
          };
        })
      );

      setResolvedStacks(resolved);
    } catch (err) {
      console.error('Error resolving stacks:', err);
    } finally {
      stacksLoading = false;
    }
  }

  // Load stacks when they become available (only if not already cached)
  $effect(() => {
    if (stacks.length > 0 && cachedResolvedStacks.length === 0 && !stacksLoading) {
      loadResolvedStacks();
    }
  });

  onMount(async () => {
    if (!browser) return;

    // Initialize store with prerendered data (or use existing if already initialized from /apps)
    if (!isStoreInitialized()) {
      initWithPrerenderedData(data.apps, data.nextCursor);
    }
    if (!isStacksInitialized()) {
      initWithPrerenderedStacks([], null);
    }

    // Schedule background refresh for apps and stacks
    scheduleRefresh();
    scheduleStacksRefresh();
    
    // Restore scroll positions if coming back from another page
    restoreScrollPositions();
  });
</script>

<svelte:head>
  <title>Discover — Zapstore</title>
  <meta name="description" content="Discover apps, stacks, communities and more on Zapstore" />
</svelte:head>

<section class="discover-page">
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
    <!-- Apps Section -->
    <div class="section-container">
      <SectionHeader title="Apps" linkText="See all" href="/apps" />
      {#if apps.length === 0}
        <!-- Apps loading skeleton -->
        <div class="horizontal-scroll" use:wheelScroll>
          <div class="scroll-content">
            {#each Array(4) as _}
              <div class="app-column">
                {#each Array(4) as _}
                  <div class="skeleton-card">
                    <div class="skeleton-icon">
                      <SkeletonLoader />
                    </div>
                    <div class="skeleton-info">
                      <div class="skeleton-name">
                        <SkeletonLoader />
                      </div>
                      <div class="skeleton-desc-lines">
                        <div class="skeleton-desc skeleton-desc-1"></div>
                        <div class="skeleton-desc skeleton-desc-2 desktop-only"></div>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div 
          class="horizontal-scroll" 
          use:wheelScroll 
          bind:this={appsScrollContainer}
          onscroll={handleAppsScroll}
        >
          <div class="scroll-content">
            {#each appColumns as column}
              <div class="app-column">
                {#each column as app}
                  <AppSmallCard 
                    {app} 
                    href={getAppUrl(app)}
                  />
                {/each}
              </div>
            {/each}

            {#if loadingMore}
              <div class="load-more-column">
                <div class="spinner"></div>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Stacks Section -->
    <div class="section-container">
      <SectionHeader title="Stacks" linkText="See all" href="/stacks" />
      {#if cachedResolvedStacks.length === 0}
        <div class="horizontal-scroll" use:wheelScroll>
          <div class="scroll-content">
            {#each Array(4) as _}
              <div class="stack-item">
                <div class="skeleton-stack">
                  <div class="skeleton-stack-grid">
                    <SkeletonLoader />
                  </div>
                  <div class="skeleton-stack-info">
                    <div class="skeleton-stack-text">
                      <div class="skeleton-stack-name"><SkeletonLoader /></div>
                      <div class="skeleton-stack-desc-lines">
                        <div class="skeleton-stack-desc skeleton-stack-desc-1"></div>
                        <div class="skeleton-stack-desc skeleton-stack-desc-2"></div>
                      </div>
                    </div>
                    <div class="skeleton-stack-creator">
                      <div class="skeleton-stack-avatar">
                        <SkeletonLoader />
                      </div>
                      <div class="skeleton-stack-creator-name"></div>
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else if cachedResolvedStacks.length > 0}
        <div class="horizontal-scroll" use:wheelScroll bind:this={stacksScrollContainer}>
          <div class="scroll-content">
            {#each cachedResolvedStacks as stack}
              <div class="stack-item">
                <AppStackCard
                  stack={stack}
                  href={getStackUrl(stack)}
                />
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="placeholder-content">
          <p class="text-muted-foreground text-sm">
            No app stacks found yet. Create one in the Zapstore app!
          </p>
        </div>
      {/if}
    </div>

    <!-- Catalogs Section (placeholder) -->
    <div class="section-container">
      <SectionHeader title="Catalogs" linkText="See all" href="/catalogs" />
      <div class="placeholder-content">
        <p class="text-muted-foreground text-sm">Catalogs coming soon...</p>
      </div>
    </div>
  </div>
</section>

<style>
  .discover-page {
    min-height: 100vh;
  }

  .section-container {
    margin-bottom: 24px;
  }

  /* Horizontal scroll container */
  .horizontal-scroll {
    margin-left: -1rem;
    margin-right: -1rem;
    padding-left: 1rem;
    padding-right: 1rem;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
    mask-image: linear-gradient(
      to right,
      transparent 0%,
      black 1rem,
      black calc(100% - 1rem),
      transparent 100%
    );
    -webkit-mask-image: linear-gradient(
      to right,
      transparent 0%,
      black 1rem,
      black calc(100% - 1rem),
      transparent 100%
    );
  }

  .horizontal-scroll::-webkit-scrollbar {
    display: none;
  }

  @media (min-width: 640px) {
    .horizontal-scroll {
      margin-left: -1.5rem;
      margin-right: -1.5rem;
      padding-left: 1.5rem;
      padding-right: 1.5rem;
      mask-image: linear-gradient(
        to right,
        transparent 0%,
        black 1.5rem,
        black calc(100% - 1.5rem),
        transparent 100%
      );
      -webkit-mask-image: linear-gradient(
        to right,
        transparent 0%,
        black 1.5rem,
        black calc(100% - 1.5rem),
        transparent 100%
      );
    }
  }

  @media (min-width: 1024px) {
    .horizontal-scroll {
      margin-left: -2rem;
      margin-right: -2rem;
      padding-left: 2rem;
      padding-right: 2rem;
      mask-image: linear-gradient(
        to right,
        transparent 0%,
        black 2rem,
        black calc(100% - 2rem),
        transparent 100%
      );
      -webkit-mask-image: linear-gradient(
        to right,
        transparent 0%,
        black 2rem,
        black calc(100% - 2rem),
        transparent 100%
      );
    }
  }

  .scroll-content {
    display: flex;
    gap: 16px;
    padding-bottom: 8px;
  }

  .app-column {
    flex-shrink: 0;
    width: 280px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  @media (min-width: 768px) {
    .app-column {
      width: 320px;
      gap: 16px;
    }
  }

  .stack-item {
    flex-shrink: 0;
    width: 280px;
  }

  @media (min-width: 768px) {
    .stack-item {
      width: 320px;
    }
  }

  .load-more-column {
    flex-shrink: 0;
    width: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .load-more-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px 20px;
    border-radius: 12px;
    background-color: hsl(var(--gray66));
    color: hsl(var(--white66));
    font-size: 0.875rem;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .load-more-btn:hover:not(:disabled) {
    background-color: hsl(var(--gray44));
    color: hsl(var(--foreground));
  }

  .load-more-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid hsl(var(--white33));
    border-top-color: hsl(var(--foreground));
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .placeholder-content {
    padding: 24px;
    background-color: hsl(var(--gray66));
    border-radius: 16px;
    text-align: center;
  }

  /* Skeleton loading styles */
  .skeleton-card {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 4px 0;
  }

  .skeleton-icon {
    width: 56px;
    height: 56px;
    border-radius: 16px;
    overflow: hidden;
    flex-shrink: 0;
  }
  
  @media (min-width: 768px) {
    .skeleton-card {
      gap: 20px;
    }
    .skeleton-icon {
      width: 72px;
      height: 72px;
      border-radius: 24px;
    }
    .skeleton-name {
      width: 140px;
      height: 20px;
    }
    .skeleton-desc {
      height: 12px;
    }
    .skeleton-desc-1 {
      width: 220px;
    }
    .skeleton-desc-2 {
      width: 160px;
    }
  }

  .skeleton-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 6px;
  }

  .skeleton-name {
    width: 100px;
    height: 18px;
    border-radius: 12px;
    overflow: hidden;
  }
  
  .skeleton-desc-lines {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .skeleton-desc {
    height: 10px;
    border-radius: 12px;
    background: hsl(var(--gray33));
  }
  
  .skeleton-desc-1 {
    width: 180px;
  }
  
  .skeleton-desc-2 {
    width: 120px;
  }
  
  .skeleton-desc-2.desktop-only {
    display: none;
  }
  
  @media (min-width: 768px) {
    .skeleton-desc-2.desktop-only {
      display: block;
    }
  }

  /* Stack skeleton styles */
  .skeleton-stack {
    display: flex;
    align-items: stretch;
    gap: 16px;
    padding: 8px 0;
    width: 100%;
  }

  .skeleton-stack-grid {
    width: 86px;
    height: 86px;
    border-radius: 16px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .skeleton-stack-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 4px 0;
  }
  
  .skeleton-stack-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .skeleton-stack-name {
    width: 100px;
    height: 18px;
    border-radius: 12px;
    overflow: hidden;
  }
  
  .skeleton-stack-desc-lines {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skeleton-stack-desc {
    height: 10px;
    border-radius: 12px;
    background-color: hsl(var(--gray33));
  }
  
  .skeleton-stack-desc-1 {
    width: 160px;
  }
  
  .skeleton-stack-desc-2 {
    width: 100px;
  }
  
  .skeleton-stack-creator {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .skeleton-stack-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
  }
  
  .skeleton-stack-creator-name {
    width: 60px;
    height: 12px;
    border-radius: 12px;
    background-color: hsl(var(--gray33));
  }

  @media (min-width: 768px) {
    .skeleton-stack {
      gap: 20px;
    }
    .skeleton-stack-grid {
      width: 104px;
      height: 104px;
      border-radius: 20px;
    }
    .skeleton-stack-name {
      width: 130px;
      height: 20px;
    }
    .skeleton-stack-desc {
      height: 12px;
    }
    .skeleton-stack-desc-1 {
      width: 200px;
    }
    .skeleton-stack-desc-2 {
      width: 140px;
    }
    .skeleton-stack-avatar {
      width: 24px;
      height: 24px;
    }
    .skeleton-stack-creator-name {
      width: 80px;
      height: 14px;
    }
  }
</style>
