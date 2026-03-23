<script lang="js">
import { markdownToPlainTextLine } from '$lib/utils/markdown';
let { app } = $props();
const descriptionPlain = $derived(app.description ? markdownToPlainTextLine(app.description) : '');
</script>

<a href="/apps/{app.dTag}" class="app-card" data-sveltekit-preload-data="hover">
  {#if app.icon}
    <img src={app.icon} alt={app.name} class="app-icon" decoding="async" />
  {:else}
    <div class="app-icon placeholder">
      <span>{app.name.charAt(0).toUpperCase()}</span>
    </div>
  {/if}
  
  <div class="app-info">
    <h3 class="app-name">{app.name}</h3>
    {#if descriptionPlain}
      <p class="app-description">{descriptionPlain}</p>
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
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
