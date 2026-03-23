<script lang="js">
import { renderMarkdown } from '$lib/utils/markdown';
let { release } = $props();
function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}
</script>

<div class="release-card">
  <div class="release-header">
    <span class="version">{release.version || 'Unknown version'}</span>
    <span class="date">{formatDate(release.createdAt)}</span>
  </div>
  
  {#if release.releaseNotes}
    <div class="release-notes prose prose-invert max-w-none">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html renderMarkdown(release.releaseNotes)}
    </div>
  {/if}
</div>

<style>
  .release-card {
    padding: 1rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 0.75rem;
    background: var(--color-bg-primary, #fff);
  }
  
  .release-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .version {
    font-weight: 600;
    font-size: 1rem;
  }
  
  .date {
    font-size: 0.875rem;
    color: var(--color-text-secondary, #6b7280);
  }
  
  .release-notes {
    font-size: 0.875rem;
    color: var(--color-text-secondary, #6b7280);
    margin: 0.75rem 0 0;
  }

  .release-notes :global(p:first-child) {
    margin-top: 0;
  }

  .release-notes :global(p:last-child) {
    margin-bottom: 0;
  }
</style>
