<script>
  /**
   * Modal - Reusable modal component
   *
   * Features:
   * - Body scroll lock when open
   * - Configurable max height (default 80vh)
   * - All modals hug content by default (up to maxHeight)
   * - Always bottom-aligned on mobile screens
   * - Scrollable content within modal
   * - No bottom border radius when bottom-aligned (touches screen edge)
   * - Backdrop click and Escape key to close
   * - fillHeight option to force modal to fill to maxHeight (fixed height)
   * - wide option for page-content-width modals (e.g., comment threads)
   */
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { browser } from "$app/environment";

  /** @type {boolean} */
  export let open = false;

  /** @type {string} */
  export let ariaLabel = "Modal dialog";

  /** @type {string|null} */
  export let ariaLabelledby = null;

  /** @type {'center' | 'bottom' | 'top'} - Force a specific alignment (default auto-detects) */
  export let align = "center";

  /** @type {number} - Z-index for the modal (default: 50) */
  export let zIndex = 50;

  /** @type {string} - Max width of modal (default: max-w-lg). Ignored when `wide` is true. */
  export let maxWidth = "max-w-lg";

  /** @type {boolean} - When true, modal matches page container width at each breakpoint */
  export let wide = false;

  /** @type {string} - Additional CSS classes for the modal container */
  let className = "";
  export { className as class };

  // Compute effective max width class
  $: effectiveMaxWidth = wide ? "modal-wide" : maxWidth;

  /** @type {number} - Max height as percentage of viewport (default: 80). Used for bottom/top aligned and as threshold for switching to bottom-align */
  export let maxHeight = 80;

  /** @type {boolean} - When true, modal fills to maxHeight immediately instead of sizing to content */
  export let fillHeight = false;

  /** @type {boolean} - Whether the modal should close when clicking backdrop */
  export let closeOnBackdropClick = true;

  /** @type {boolean} - Whether the modal should close when pressing Escape */
  export let closeOnEscape = true;

  // Internal state
  let modalElement;
  let isBottomAligned = false;
  let isMobile = false;

  // Check if we're on mobile (< 640px / sm breakpoint)
  function checkMobile() {
    if (browser) {
      isMobile = window.innerWidth < 640;
    }
  }

  // Check if content exceeds max height
  function checkContentHeight() {
    if (browser && modalElement) {
      const threshold = window.innerHeight * (maxHeight / 100);
      const contentHeight = modalElement.scrollHeight;
      isBottomAligned = contentHeight > threshold || isMobile;
    }
  }

  // Lock/unlock body scroll
  function lockBodyScroll() {
    if (browser) {
      // Store current scroll position and lock
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.overflow = "hidden";
      document.body.dataset.scrollY = String(scrollY);
    }
  }

  function unlockBodyScroll() {
    if (browser) {
      const scrollY = document.body.dataset.scrollY || "0";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.overflow = "";
      delete document.body.dataset.scrollY;
      window.scrollTo(0, parseInt(scrollY));
    }
  }

  // Handle open state changes
  $: if (browser) {
    if (open) {
      checkMobile();
      lockBodyScroll();
      // Check content height after mount
      requestAnimationFrame(() => {
        checkContentHeight();
      });
    } else {
      unlockBodyScroll();
      isBottomAligned = false;
    }
  }

  // Determine actual alignment
  $: actualAlignment =
    align === "top"
      ? "top"
      : align === "bottom" || isBottomAligned || isMobile
        ? "bottom"
        : "center";

  function handleBackdropClick(e) {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      open = false;
    }
  }

  function handleKeydown(e) {
    if (closeOnEscape && e.key === "Escape") {
      open = false;
    }
  }

  function handleResize() {
    checkMobile();
    checkContentHeight();
  }
</script>

<svelte:window on:keydown={handleKeydown} on:resize={handleResize} />

{#if open}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_interactive_supports_focus -->
  <div
    class="modal-backdrop fixed inset-0 bg-overlay"
    class:items-start={actualAlignment === "top"}
    class:items-center={actualAlignment === "center"}
    class:items-end={actualAlignment === "bottom"}
    style="z-index: {zIndex};"
    transition:fade={{ duration: 200 }}
    on:click={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    aria-label={ariaLabelledby ? undefined : ariaLabel}
    aria-labelledby={ariaLabelledby}
    tabindex="-1"
  >
    <!-- Modal container -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      bind:this={modalElement}
      class="modal-container relative w-full {effectiveMaxWidth} {className} border-subtle shadow-2xl overflow-hidden backdrop-blur-lg"
      class:modal-top={actualAlignment === "top"}
      class:modal-center={actualAlignment === "center"}
      class:modal-bottom={actualAlignment === "bottom"}
      class:modal-fill-height={fillHeight}
      style="--modal-max-height: {maxHeight}vh;"
      transition:fly={{
        y:
          actualAlignment === "bottom"
            ? 50
            : actualAlignment === "top"
              ? -50
              : 0,
        duration: 200,
        easing: cubicOut,
      }}
      on:click|stopPropagation
      on:keydown|stopPropagation
      role="document"
      tabindex="-1"
    >
      <!-- Scrollable content wrapper -->
      <div class="modal-content">
        <slot />
      </div>
      <!-- Optional footer slot (non-scrolling) -->
      <slot name="footer" />
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    display: flex;
    justify-content: center;
    padding: 0;
    margin: 0;
  }

  .modal-backdrop.items-start {
    align-items: flex-start;
  }

  .modal-backdrop.items-center {
    align-items: center;
  }

  .modal-backdrop.items-end {
    align-items: flex-end;
  }

  /* Top-aligned modal (e.g., search dropdown) */
  .modal-top {
    margin: 0;
    margin-bottom: auto;
    border-radius: 0 0 var(--radius-32) var(--radius-32);
    max-height: var(--modal-max-height);
    background: hsl(var(--gray66));
    border: 0.33px solid hsl(var(--white8));
    border-top: none;
  }

  /* Center-aligned modal */
  .modal-center {
    margin: 1rem;
    border-radius: var(--radius-32);
    max-height: calc(100vh - 2rem);
    background: hsl(var(--gray66));
    border: 0.33px solid hsl(var(--white8));
  }

  /* Bottom-aligned modal - hugs content up to maxHeight */
  .modal-bottom {
    margin: 0;
    padding: 0;
    border-radius: var(--radius-32) var(--radius-32) 0 0;
    max-height: var(--modal-max-height);
    background: hsl(var(--gray66));
    border: 0.33px solid hsl(var(--white8));
    border-bottom: none;
  }

  /* Desktop: floating bottom modal with all rounded corners and shadow */
  @media (min-width: 768px) {
    .modal-bottom {
      margin-bottom: 16px;
      border-radius: 24px;
      border-bottom: 0.33px solid hsl(var(--white8));
      box-shadow: 0 8px 64px hsl(var(--black));
    }
  }

  /* Fill height modifier - forces modal to fill to maxHeight */
  .modal-fill-height {
    height: var(--modal-max-height);
    display: flex;
    flex-direction: column;
  }

  .modal-fill-height .modal-content {
    flex: 1;
    min-height: 0;
    max-height: unset;
  }

  /* Wide modal - full width on mobile, narrower on desktop */
  .modal-wide {
    max-width: 100%; /* Mobile: full width */
  }

  @media (min-width: 768px) {
    .modal-wide {
      max-width: 560px;
    }
  }

  /* Scrollable content area */
  .modal-content {
    overflow-y: auto;
    max-height: inherit;
    /* Custom scrollbar styling */
    scrollbar-width: thin;
    scrollbar-color: hsl(var(--white16)) transparent;
  }

  .modal-content::-webkit-scrollbar {
    width: 6px;
  }

  .modal-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .modal-content::-webkit-scrollbar-thumb {
    background-color: hsl(var(--white16));
    border-radius: 3px;
  }

  .modal-content::-webkit-scrollbar-thumb:hover {
    background-color: hsl(var(--white33));
  }

  /* Ensure modal stays above everything */
  :global(body[data-scroll-y]) {
    overflow: hidden !important;
  }
</style>
