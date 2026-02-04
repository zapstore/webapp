<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import AppStackCard from '$lib/components/cards/AppStackCard.svelte';
  import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
  import {
    getStacks,
    getHasMore as getStacksHasMore,
    isLoadingMore as isStacksLoadingMore,
    isStacksInitialized,
    scheduleStacksRefresh,
    loadMoreStacks,
    resolveStackApps
  } from '$lib/stores/stacks.svelte';
  import { nip19 } from 'nostr-tools';
  import { fetchEvents } from '$lib/nostr/service';
  import { DEFAULT_CATALOG_RELAYS, EVENT_KINDS } from '$lib/config';
  import { parseProfile, encodeStackNaddr, type App } from '$lib/nostr/models';

  // Reactive state from store
  const stacks = $derived(getStacks());
  const hasMore = $derived(getStacksHasMore());
  const loadingMore = $derived(isStacksLoadingMore());
  const initialized = $derived(isStacksInitialized());

  // Resolved stacks with apps and creators
  let resolvedStacks = $state<Array<{
    name: string;
    description: string;
    apps: App[];
    creator?: { name?: string; picture?: string; pubkey: string; npub: string };
    pubkey: string;
    dTag: string;
  }>>([]);
  let loading = $state(true);

  function getStackUrl(stack: { pubkey: string; dTag: string }): string {
    return `/stacks/${encodeStackNaddr(stack.pubkey, stack.dTag)}`;
  }

  async function loadResolvedStacks() {
    if (!browser || stacks.length === 0) return;

    loading = true;

    try {
      const resolved = await Promise.all(
        stacks.map(async (stack) => {
          const stackApps = await resolveStackApps(stack);

          let creator = undefined;
          if (stack.pubkey) {
            try {
              const profileEvents = await fetchEvents(
                { kinds: [EVENT_KINDS.PROFILE], authors: [stack.pubkey] },
                { relays: [...DEFAULT_CATALOG_RELAYS] }
              );
              if (profileEvents.length > 0) {
                const profile = parseProfile(profileEvents[0]!);
                creator = {
                  name: profile.displayName || profile.name,
                  picture: profile.picture,
                  pubkey: stack.pubkey,
                  npub: nip19.npubEncode(stack.pubkey)
                };
              }
            } catch (e) {
              // Profile fetch failed
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

      resolvedStacks = resolved;
    } catch (err) {
      console.error('Error resolving stacks:', err);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (stacks.length > 0) {
      loadResolvedStacks();
    }
  });

  onMount(() => {
    if (!browser) return;
    scheduleStacksRefresh();
  });
</script>

<svelte:head>
  <title>App Stacks — Zapstore</title>
  <meta name="description" content="Browse curated app collections on Zapstore" />
</svelte:head>

<section class="stacks-page">
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
    <div class="page-header">
      <h1 class="text-2xl md:text-3xl font-bold">App Stacks</h1>
      <p class="text-muted-foreground mt-2">
        Curated collections of apps by the community
      </p>
    </div>

    {#if loading || !initialized}
      <div class="stacks-grid">
        {#each Array(8) as _}
          <div class="skeleton-stack">
            <div class="skeleton-stack-grid">
              <SkeletonLoader />
            </div>
            <div class="skeleton-stack-info">
              <div class="skeleton-stack-name"><SkeletonLoader /></div>
              <div class="skeleton-stack-desc"></div>
              <div class="skeleton-stack-creator">
                <div class="skeleton-stack-avatar"><SkeletonLoader /></div>
                <div class="skeleton-stack-creator-name"></div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else if resolvedStacks.length > 0}
      <div class="stacks-grid">
        {#each resolvedStacks as stack}
          <AppStackCard {stack} href={getStackUrl(stack)} />
        {/each}
      </div>

      {#if hasMore}
        <div class="load-more-container">
          <button
            class="btn-secondary"
            onclick={() => loadMoreStacks()}
            disabled={loadingMore}
          >
            {#if loadingMore}
              <span class="spinner"></span>
              Loading...
            {:else}
              Load more stacks
            {/if}
          </button>
        </div>
      {/if}
    {:else}
      <div class="empty-state">
        <p class="text-muted-foreground">
          No app stacks found yet. Create one in the Zapstore app!
        </p>
      </div>
    {/if}
  </div>
</section>

<style>
  .stacks-page {
    min-height: 100vh;
  }

  .page-header {
    margin-bottom: 24px;
  }

  .stacks-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
  }

  .load-more-container {
    display: flex;
    justify-content: center;
    margin-top: 32px;
  }

  .empty-state {
    padding: 48px 24px;
    background-color: hsl(var(--gray66));
    border-radius: 16px;
    text-align: center;
  }

  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid hsl(var(--white33));
    border-top-color: hsl(var(--foreground));
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-right: 8px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Skeleton styles */
  .skeleton-stack {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 0;
  }

  .skeleton-stack-grid {
    width: 84px;
    height: 84px;
    border-radius: 16px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .skeleton-stack-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .skeleton-stack-name {
    width: 100px;
    height: 16px;
    border-radius: 6px;
    overflow: hidden;
  }

  .skeleton-stack-desc {
    width: 140px;
    height: 10px;
    border-radius: 4px;
    background-color: hsl(var(--gray33));
  }

  .skeleton-stack-creator {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
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
    border-radius: 4px;
    background-color: hsl(var(--gray33));
  }

  @media (min-width: 768px) {
    .skeleton-stack { gap: 20px; }
    .skeleton-stack-grid {
      width: 104px;
      height: 104px;
      border-radius: 20px;
    }
  }
</style>
