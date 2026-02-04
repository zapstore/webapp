<script lang="ts">
  /**
   * Modal - Reusable modal component
   *
   * Features:
   * - Body scroll lock when open
   * - Configurable max height (default 80vh)
   * - All modals hug content by default (up to maxHeight)
   * - Always bottom-aligned on mobile screens
   * - Scrollable content within modal
   * - Backdrop click and Escape key to close
   */
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { browser } from "$app/environment";

  interface Props {
    open?: boolean;
    ariaLabel?: string;
    ariaLabelledby?: string | null;
    align?: "center" | "bottom" | "top";
    zIndex?: number;
    maxWidth?: string;
    wide?: boolean;
    class?: string;
    maxHeight?: number;
    fillHeight?: boolean;
    closeOnBackdropClick?: boolean;
    closeOnEscape?: boolean;
    children?: import("svelte").Snippet;
    footer?: import("svelte").Snippet;
  }

  let {
    open = $bindable(false),
    ariaLabel = "Modal dialog",
    ariaLabelledby = null,
    align = "center",
    zIndex = 50,
    maxWidth = "max-w-lg",
    wide = false,
    class: className = "",
    maxHeight = 80,
    fillHeight = false,
    closeOnBackdropClick = true,
    closeOnEscape = true,
    children,
    footer,
  }: Props = $props();

  let modalElement = $state<HTMLElement | null>(null);
  let isBottomAligned = $state(false);
  let isMobile = $state(false);

  const effectiveMaxWidth = $derived(wide ? "modal-wide" : maxWidth);
  const actualAlignment = $derived(
    align === "top"
      ? "top"
      : align === "bottom" || isBottomAligned || isMobile
        ? "bottom"
        : "center"
  );

  function checkMobile() {
    if (browser) {
      isMobile = window.innerWidth < 640;
    }
  }

  function checkContentHeight() {
    if (browser && modalElement) {
      const threshold = window.innerHeight * (maxHeight / 100);
      const contentHeight = modalElement.scrollHeight;
      isBottomAligned = contentHeight > threshold || isMobile;
    }
  }

  function lockBodyScroll() {
    if (browser) {
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

  $effect(() => {
    if (browser) {
      if (open) {
        checkMobile();
        lockBodyScroll();
        requestAnimationFrame(() => {
          checkContentHeight();
        });
      } else {
        unlockBodyScroll();
        isBottomAligned = false;
      }
    }
  });

  function handleBackdropClick(e: MouseEvent) {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      open = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (closeOnEscape && e.key === "Escape") {
      open = false;
    }
  }

  function handleResize() {
    checkMobile();
    checkContentHeight();
  }
</script>

<svelte:window onkeydown={handleKeydown} onresize={handleResize} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
  <div
    class="modal-backdrop fixed inset-0 bg-overlay"
    class:items-start={actualAlignment === "top"}
    class:items-center={actualAlignment === "center"}
    class:items-end={actualAlignment === "bottom"}
    style="z-index: {zIndex};"
    transition:fade={{ duration: 200 }}
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    aria-label={ariaLabelledby ? undefined : ariaLabel}
    aria-labelledby={ariaLabelledby}
    tabindex="-1"
  >
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
        y: actualAlignment === "bottom" ? 50 : actualAlignment === "top" ? -50 : 0,
        duration: 200,
        easing: cubicOut,
      }}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="document"
      tabindex="-1"
    >
      <div class="modal-content">
        {@render children?.()}
      </div>
      {@render footer?.()}
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

  .modal-top {
    margin: 0;
    margin-bottom: auto;
    border-radius: 0 0 var(--radius-32) var(--radius-32);
    max-height: var(--modal-max-height);
    background: hsl(var(--gray66));
    border: 0.33px solid hsl(var(--white8));
    border-top: none;
  }

  .modal-center {
    margin: 1rem;
    border-radius: var(--radius-32);
    max-height: calc(100vh - 2rem);
    background: hsl(var(--gray66));
    border: 0.33px solid hsl(var(--white8));
  }

  .modal-bottom {
    margin: 0;
    padding: 0;
    border-radius: var(--radius-32) var(--radius-32) 0 0;
    max-height: var(--modal-max-height);
    background: hsl(var(--gray66));
    border: 0.33px solid hsl(var(--white8));
    border-bottom: none;
  }

  @media (min-width: 768px) {
    .modal-bottom {
      margin-bottom: 16px;
      border-radius: 24px;
      border-bottom: 0.33px solid hsl(var(--white8));
      box-shadow: 0 8px 64px hsl(var(--black));
    }
  }

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

  .modal-wide {
    max-width: 100%;
  }

  @media (min-width: 768px) {
    .modal-wide {
      max-width: 560px;
    }
  }

  .modal-content {
    overflow-y: auto;
    max-height: inherit;
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

  :global(body[data-scroll-y]) {
    overflow: hidden !important;
  }
</style>
