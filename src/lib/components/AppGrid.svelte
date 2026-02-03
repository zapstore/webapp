<script lang="ts">
  import type { App } from '$lib/nostr';
  import AppCard from './AppCard.svelte';
  
  interface Props {
    apps: App[];
    loading?: boolean;
  }
  
  let { apps, loading = false }: Props = $props();
</script>

<div class="app-grid">
  {#if loading}
    {#each Array(6) as _}
      <div class="skeleton-card">
        <div class="skeleton-icon"></div>
        <div class="skeleton-info">
          <div class="skeleton-title"></div>
          <div class="skeleton-desc"></div>
        </div>
      </div>
    {/each}
  {:else if apps.length === 0}
    <p class="empty-state">No apps found</p>
  {:else}
    {#each apps as app (app.id)}
      <AppCard {app} />
    {/each}
  {/if}
</div>

<style>
  .app-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1rem;
  }
  
  .empty-state {
    grid-column: 1 / -1;
    text-align: center;
    color: var(--text-secondary, #6b7280);
    padding: 3rem;
  }
  
  .skeleton-card {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    border-radius: 0.75rem;
    background: var(--card-bg, #fff);
    border: 1px solid var(--border-color, #e5e7eb);
  }
  
  .skeleton-icon {
    width: 4rem;
    height: 4rem;
    border-radius: 0.75rem;
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }
  
  .skeleton-info {
    flex: 1;
  }
  
  .skeleton-title {
    height: 1rem;
    width: 60%;
    border-radius: 0.25rem;
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    margin-bottom: 0.5rem;
  }
  
  .skeleton-desc {
    height: 0.75rem;
    width: 90%;
    border-radius: 0.25rem;
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }
  
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
