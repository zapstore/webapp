<script lang="ts">
  import { navigating } from '$app/stores';
  
  // Show loading bar during SvelteKit client-side navigation
  // (Native browser navigation with data-sveltekit-reload won't trigger this)
  let isNavigating = $derived($navigating !== null);
</script>

{#if isNavigating}
  <div class="loading-bar" aria-hidden="true">
    <div class="loading-bar-progress"></div>
  </div>
{/if}

<style>
  .loading-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    z-index: 1000;
    background: rgba(139, 92, 246, 0.2);
    overflow: hidden;
  }
  
  .loading-bar-progress {
    height: 100%;
    background: var(--color-accent, #8b5cf6);
    animation: loading 1s ease-in-out infinite;
  }
  
  @keyframes loading {
    0% {
      width: 0%;
      margin-left: 0%;
    }
    50% {
      width: 70%;
      margin-left: 15%;
    }
    100% {
      width: 0%;
      margin-left: 100%;
    }
  }
</style>
