<script>
  /**
   * SkeletonLoader - A performant shimmer loading placeholder
   *
   * Simply fills its container with a shimmer effect.
   * The PARENT controls size, shape, and border-radius.
   *
   * DESIGN SYSTEM RULES:
   * - Use for ALL loading images (icons, screenshots, etc.)
   * - Use for TITLES/HEADERS only (App Name, Article Title, Profile Name, etc.)
   * - NEVER use for body text, descriptions, or paragraphs
   * - Title containers must use rounded-xl (12px) and match font height
   *
   * Usage: Place inside a sized container with overflow-hidden
   *
   * <div class="w-16 h-16 rounded-full overflow-hidden">
   *   <SkeletonLoader />
   * </div>
   *
   * <div class="w-32 h-6 rounded-xl overflow-hidden">
   *   <SkeletonLoader />
   * </div>
   */

  /** @type {string} */
  export let className = "";
</script>

<div class="skeleton-loader {className}" role="status" aria-label="Loading...">
  <span class="sr-only">Loading...</span>
</div>

<style>
  .skeleton-loader {
    /* Fill parent container */
    width: 100%;
    height: 100%;

    /* Base appearance - matches Flutter's white8 */
    background-color: hsl(var(--white8));

    /* Overflow hidden to contain the shimmer effect */
    overflow: hidden;

    /* Position for pseudo-element shimmer */
    position: relative;

    /* Isolate paint operations for performance */
    isolation: isolate;
    contain: content;
  }

  /* The shimmer effect via pseudo-element */
  .skeleton-loader::after {
    content: "";
    position: absolute;
    inset: 0;

    /* Extra wide gradient with very soft feathered edges */
    background: linear-gradient(
      100deg,
      transparent 0%,
      hsl(var(--white4)) 10%,
      hsl(var(--white8)) 20%,
      hsl(var(--white16)) 50%,
      hsl(var(--white8)) 80%,
      hsl(var(--white4)) 90%,
      transparent 100%
    );

    /* Start position off-screen left */
    transform: translateX(-100%);

    /* Animation */
    animation: skeleton-shimmer 1.2s ease-in-out infinite;

    /* GPU acceleration hint */
    will-change: transform;
  }

  @keyframes skeleton-shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  /* Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .skeleton-loader::after {
      animation: none;
      background: hsl(var(--white8));
      transform: none;
    }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
</style>
