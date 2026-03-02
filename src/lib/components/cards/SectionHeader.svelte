<script>
  import { ChevronRight, ChevronDown } from "$lib/components/icons";

  /**
   * SectionHeader - A reusable section header component
   *
   * Responsive sizing (two breakpoints):
   * - Mobile (<768px): 1.25rem title, 16px chevron
   * - Desktop (>=768px): 1.5rem title, 14px chevron
   *
   * Right-side variants (mutually exclusive, first match wins):
   *   1. filterText + onFilter  → pill button with chevron (no bg, rounded bg on hover)
   *   2. linkText + href        → "See all" link
   *   3. linkText + onClick     → "See all" button
   *
   * @example
   * <SectionHeader title="Apps" filterText="Latest" {filterOpen} onFilter={toggle} />
   * <SectionHeader title="Stacks" linkText="See more" href="/stacks" />
   */

  /** @type {string} */
  export let title = "";

  /** @type {string|null} - Text for the filter pill button (e.g. "Latest") */
  export let filterText = null;

  /** @type {(() => void)|null} - Handler for the filter pill click */
  export let onFilter = null;

  /** @type {'down'|'right'} - Chevron direction for the filter pill */
  export let filterChevron = "down";

  /** @type {boolean} - Whether the filter dropdown is open (for aria-expanded) */
  export let filterOpen = false;

  /** @type {string|null} */
  export let linkText = null;

  /** @type {string|null} */
  export let href = null;

  /** @type {(() => void)|null} */
  export let onClick = null;

  $: hasFilter = filterText && onFilter;
  $: hasLink = !hasFilter && linkText && (href || onClick);
</script>

<div class="section-header">
  <h2 class="section-title">{title}</h2>

  {#if hasFilter}
    <button
      type="button"
      class="filter-btn"
      class:filter-btn-open={filterOpen}
      on:click={onFilter}
      aria-expanded={filterOpen}
    >
      <span class="filter-btn-text">{filterText}</span>
      {#if filterChevron === "down"}
        <span class="filter-btn-chevron-down">
          <ChevronDown size={12} variant="outline" color="hsl(var(--white33))" strokeWidth={1.6} />
        </span>
      {:else}
        <span class="filter-btn-chevron-right">
          <ChevronRight size={12} variant="outline" color="hsl(var(--white33))" strokeWidth={1.6} />
        </span>
      {/if}
    </button>

  {:else if hasLink}
    {#if href}
      <a {href} class="section-link">
        <span>{linkText}</span>
        <span class="filter-btn-chevron-right">
          <ChevronRight variant="outline" color="hsl(var(--white33))" size={14} />
        </span>
      </a>
    {:else if onClick}
      <button type="button" class="section-link" on:click={onClick}>
        <span>{linkText}</span>
        <span class="filter-btn-chevron-right">
          <ChevronRight variant="outline" color="hsl(var(--white33))" size={14} />
        </span>
      </button>
    {/if}
  {/if}
</div>

<style>
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }

  .section-title {
    font-size: 1.25rem;
    font-weight: 650;
    color: hsl(var(--foreground));
    margin: 0;
    line-height: 1.2;
  }

  @media (min-width: 768px) {
    .section-title {
      font-size: 1.5rem;
    }
  }

  /* ── Shared pill style for both filter button and see-more link ── */
  .filter-btn,
  .section-link {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 16px;
    background: transparent;
    border: none;
    border-radius: 9999px;
    font-size: 0.875rem;
    font-weight: 500;
    color: hsl(var(--white33));
    text-decoration: none;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .filter-btn:hover,
  .filter-btn-open,
  .section-link:hover {
    background-color: hsl(var(--white8));
    color: hsl(var(--white66));
  }

  .filter-btn-text {
    line-height: 1;
  }

  /* ChevronDown gets 2px top nudge; ChevronRight sits flush */
  .filter-btn-chevron-down {
    display: flex;
    align-items: center;
    padding-top: 2px;
  }

  .filter-btn-chevron-right {
    display: flex;
    align-items: center;
  }

</style>
