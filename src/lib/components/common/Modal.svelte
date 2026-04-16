<script lang="js">
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
import { onDestroy } from "svelte";
let { open = $bindable(false), ariaLabel = "Modal dialog", ariaLabelledby = null, align = "center", zIndex = 100, maxWidth = "max-w-lg", wide = false, class: className = "", maxHeight = 80, fillHeight = false, closeOnBackdropClick = true, closeOnEscape = true, noBackdrop = false, title = "", description = "", closeButtonMobile = false,
/** When false, body scroll is not locked (e.g. thread modal inside a transformed header panel). */
lockBodyScroll = true,
/**
 * When true, cap height for sheets inside a transformed panel (e.g. header inbox):
 * uses ancestor `--inbox-modal-top-reserve` + min vh cap; flush bottom on desktop; same surface as other modals.
 */
scopedInPanel = false,
/** Extra cap for scoped sheets: min(available space, this many vh). */
scopedPanelMaxVh = 90,
children, footer, } = $props();
let modalElement = $state(null);
let _isBottomAligned = $state(false);
let isMobile = $state(false);
const effectiveMaxWidth = $derived(wide ? "modal-wide" : maxWidth);
const actualAlignment = $derived(align === "top"
    ? "top"
    : align === "bottom" || isMobile
        ? "bottom"
        : "center");
function checkMobile() {
    if (browser) {
        isMobile = window.innerWidth < 640;
    }
}
function checkContentHeight() {
    if (browser && modalElement && isMobile) {
        const threshold = window.innerHeight * (maxHeight / 100);
        const contentHeight = modalElement.scrollHeight;
        _isBottomAligned = contentHeight > threshold;
    }
}
/** Tracks whether this instance currently holds the body scroll lock, so onDestroy can release it
 *  if the component is destroyed while open (e.g. parent removes it in the same tick it closes). */
let _scrollLockHeld = false;
function applyBodyScrollLock() {
    if (browser) {
        const scrollY = window.scrollY;
        document.body.style.position = "fixed";
        document.body.style.top = `-${scrollY}px`;
        document.body.style.left = "0";
        document.body.style.right = "0";
        document.body.style.overflow = "hidden";
        document.body.dataset.scrollY = String(scrollY);
        _scrollLockHeld = true;
    }
}
function releaseBodyScrollLock() {
    if (browser) {
        const scrollY = document.body.dataset.scrollY || "0";
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        document.body.style.overflow = "";
        delete document.body.dataset.scrollY;
        window.scrollTo(0, parseInt(scrollY));
        _scrollLockHeld = false;
    }
}
$effect(() => {
    if (browser) {
        if (open) {
            checkMobile();
            if (lockBodyScroll)
                applyBodyScrollLock();
            requestAnimationFrame(() => {
                checkContentHeight();
            });
        }
        else {
            if (lockBodyScroll)
                releaseBodyScrollLock();
            _isBottomAligned = false;
        }
    }
});
/** Safety net: if the component is destroyed while the scroll lock is still held
 *  (e.g. parent unmounts us in the same reactive batch as closing us), release it. */
onDestroy(() => {
    if (_scrollLockHeld) releaseBodyScrollLock();
});
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

<svelte:window onkeydown={handleKeydown} onresize={handleResize} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
  <div
    class="modal-backdrop fixed inset-0"
    class:bg-overlay={!noBackdrop}
    class:modal-backdrop-transparent={noBackdrop}
    class:modal-backdrop-scoped-in-panel={scopedInPanel}
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
      class="modal-container relative w-full {effectiveMaxWidth} {className} border-subtle overflow-hidden backdrop-blur-lg"
      class:modal-top={actualAlignment === "top"}
      class:modal-center={actualAlignment === "center"}
      class:modal-bottom={actualAlignment === "bottom"}
      class:modal-fill-height={fillHeight}
      class:modal-scoped-in-panel={scopedInPanel}
      style="--modal-max-height: {maxHeight}vh;{scopedInPanel
        ? ` --modal-scoped-panel-vh: ${scopedPanelMaxVh};`
        : ""}"
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
        {#if title}
          <div class="modal-title-block">
            <h2 class="modal-title modal-heading">{title}</h2>
            {#if description}
              <p class="modal-description">{description}</p>
            {/if}
          </div>
        {/if}
        {@render children?.()}
      </div>
      {#if closeButtonMobile}
        <div class="modal-mobile-close-wrap">
          <button type="button" class="modal-mobile-close-btn" onclick={() => (open = false)}>Close</button>
        </div>
      {/if}
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

  .modal-backdrop-transparent {
    background: transparent;
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
    background: var(--gray66);
    border: 0.33px solid var(--white8);
    border-top: none;
  }

  .modal-center {
    margin: 1rem;
    border-radius: var(--radius-32);
    max-height: calc(100vh - 2rem);
    background: var(--gray66);
    border: 0.33px solid var(--white8);
  }

  .modal-bottom {
    margin: 0;
    padding: 0;
    border-radius: var(--radius-32) var(--radius-32) 0 0;
    max-height: var(--modal-max-height);
    background: var(--gray66);
    border: 0.33px solid var(--white8);
    border-bottom: none;
  }

  @media (max-width: 767px) {
    .modal-bottom .modal-content {
      padding-bottom: max(20px, env(safe-area-inset-bottom));
    }
  }

  @media (min-width: 768px) {
    .modal-bottom {
      margin-bottom: 16px;
      border-radius: 24px;
      border-bottom: 0.33px solid var(--white8);
    }

    .modal-bottom.modal-scoped-in-panel {
      margin-bottom: 0 !important;
      border-radius: 24px;
      border-bottom: 0.33px solid var(--white8);
    }
  }

  .modal-bottom.modal-scoped-in-panel {
    max-height: min(
      calc(100% - var(--inbox-modal-top-reserve, 0px)),
      calc(var(--modal-scoped-panel-vh, 90) * 1vh)
    );
    margin-bottom: 0;
    border-radius: 24px;
    border-bottom: 0.33px solid var(--white8);
  }

  /* Mobile: full-viewport dim + sheet (inbox/header transform is off; same as non-scoped bottom sheet). */
  @media (max-width: 767px) {
    .modal-bottom.modal-scoped-in-panel {
      max-height: var(--modal-max-height);
    }

    .modal-scoped-in-panel.modal-fill-height {
      height: var(--modal-max-height);
      max-height: var(--modal-max-height);
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

  .modal-scoped-in-panel.modal-fill-height {
    /* Definite height so .modal-content scrolls and footer stays visible */
    height: min(
      calc(100% - var(--inbox-modal-top-reserve, 0px)),
      calc(var(--modal-scoped-panel-vh, 90) * 1vh)
    );
    max-height: min(
      calc(100% - var(--inbox-modal-top-reserve, 0px)),
      calc(var(--modal-scoped-panel-vh, 90) * 1vh)
    );
    min-height: 0;
  }

  .modal-scoped-in-panel.modal-bottom .modal-content {
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }

  .modal-wide {
    max-width: 100%;
  }

  @media (min-width: 768px) {
    .modal-wide {
      max-width: 560px;
    }
  }

  .modal-title-block {
    flex-shrink: 0;
    padding: 32px 16px 0;
  }
  .modal-title {
    margin: 0;
  }
  .modal-title-block:has(.modal-description) .modal-title {
    margin-bottom: 10px;
  }
  .modal-description {
    margin: 0 0 8px 0;
    font-size: 0.9375rem;
    text-align: center;
    color: var(--white66);
  }
  @media (min-width: 768px) {
    .modal-title-block {
      padding: 28px 20px 0;
    }
    .modal-title-block:has(.modal-description) .modal-description {
      margin-bottom: 10px;
    }
  }

  .modal-mobile-close-wrap {
    display: none;
    flex-shrink: 0;
    padding: 12px 16px 16px;
  }
  @media (max-width: 767px) {
    .modal-mobile-close-wrap {
      display: block;
    }
  }
  .modal-mobile-close-btn {
    width: 100%;
    padding: 12px 16px;
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--white66);
    background: var(--white8);
    border: 0.33px solid var(--white16);
    border-radius: 12px;
    cursor: pointer;
  }
  .modal-mobile-close-btn:hover {
    background: var(--white16);
    color: var(--white);
  }

  .modal-content {
    overflow-y: auto;
    max-height: inherit;
    scrollbar-width: thin;
    scrollbar-color: var(--white16) transparent;
  }

  .modal-content::-webkit-scrollbar {
    width: 6px;
  }

  .modal-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .modal-content::-webkit-scrollbar-thumb {
    background-color: var(--white16);
    border-radius: 3px;
  }

  .modal-content::-webkit-scrollbar-thumb:hover {
    background-color: var(--white33);
  }

  :global(body[data-scroll-y]) {
    overflow: hidden !important;
  }
</style>
