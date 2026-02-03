<script lang="ts">
  import { pushState, replaceState } from '$app/navigation';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import type { App } from '$lib/nostr';
  import { queryStore, fetchEvents, parseRelease } from '$lib/nostr';
  import { EVENT_KINDS, DEFAULT_CATALOG_RELAYS } from '$lib/config';
  
  interface Props {
    app: App;
  }
  
  let { app }: Props = $props();
  
  // Track prefetched apps to avoid duplicate fetches
  const prefetched = new Set<string>();
  
  async function handleMouseEnter() {
    const key = `${app.pubkey}:${app.dTag}`;
    if (prefetched.has(key)) return;
    prefetched.add(key);
    
    // Release is already in store from the listing - query locally
    const aTagValue = `${EVENT_KINDS.APP}:${app.pubkey}:${app.dTag}`;
    const releases = queryStore({ kinds: [EVENT_KINDS.RELEASE], '#a': [aTagValue], limit: 1 });
    
    if (releases.length === 0) return;
    
    const release = parseRelease(releases[0]!);
    if (release.artifacts.length === 0) return;
    
    // Prefetch file metadata (1063) via cache cascade: EventStore → IndexedDB → Relays
    await fetchEvents(
      { kinds: [EVENT_KINDS.FILE_METADATA], ids: release.artifacts },
      { relays: [...DEFAULT_CATALOG_RELAYS] }
    );
  }
  
  function handleClick(e: MouseEvent) {
    // Prevent default navigation
    e.preventDefault();
    
    // Save current scroll position in current history entry BEFORE navigating
    const currentState = get(page).state as Record<string, unknown>;
    replaceState('', { ...currentState, scrollY: window.scrollY });
    
    // Create a plain serializable object (history state must be cloneable)
    const appData = JSON.parse(JSON.stringify(app));
    
    // Push state with app data - instant, no routing
    pushState(`/apps/${app.naddr}`, { selectedApp: appData });
    
    // Scroll to top for detail view
    window.scrollTo(0, 0);
  }
</script>

<a href="/apps/{app.naddr}" class="app-card" onclick={handleClick} onmouseenter={handleMouseEnter}>
  {#if app.icon}
    <img src={app.icon} alt={app.name} class="app-icon" decoding="async" />
  {:else}
    <div class="app-icon placeholder">
      <span>{app.name.charAt(0).toUpperCase()}</span>
    </div>
  {/if}
  
  <div class="app-info">
    <h3 class="app-name">{app.name}</h3>
    {#if app.description}
      <p class="app-description">{app.description}</p>
    {/if}
  </div>
</a>

<style>
  .app-card {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    border-radius: 0.75rem;
    background: var(--card-bg, #fff);
    border: 1px solid var(--border-color, #e5e7eb);
    transition: box-shadow 0.2s, transform 0.2s;
    text-decoration: none;
    color: inherit;
  }
  
  .app-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }
  
  .app-icon {
    width: 4rem;
    height: 4rem;
    border-radius: 0.75rem;
    object-fit: cover;
    flex-shrink: 0;
  }
  
  .app-icon.placeholder {
    width: 4rem;
    height: 4rem;
    border-radius: 0.75rem;
    flex-shrink: 0;
    background: var(--accent-color, #8b5cf6);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 1.5rem;
    font-weight: 600;
  }
  
  .app-info {
    min-width: 0;
    flex: 1;
  }
  
  .app-name {
    font-weight: 600;
    font-size: 1rem;
    margin: 0 0 0.25rem;
    color: var(--text-primary, #111);
  }
  
  .app-description {
    font-size: 0.875rem;
    color: var(--text-secondary, #6b7280);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
