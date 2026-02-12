<script>
  import { ChevronRight } from "$lib/components/icons";

  /**
   * SectionHeader - A reusable section header component
   *
   * Responsive sizing (two breakpoints):
   * - Mobile (<768px): 1.25rem title, 16px chevron
   * - Desktop (>=768px): 1.5rem title, 14px chevron
   *
   * @example
   * <SectionHeader title="Apps" linkText="See all" href="/apps" />
   * <SectionHeader title="Stacks" linkText="See all" href="/stacks" />
   */

  /** @type {string} - Section title */
  export let title = "";

  /** @type {string|null} - Link text on the right (e.g., "See all") */
  export let linkText = null;

  /** @type {string|null} - Link destination URL */
  export let href = null;

  /** @type {(() => void)|null} - Click handler (alternative to href) */
  export let onClick = null;

  $: hasLink = linkText && (href || onClick);
</script>

<div class="section-header">
  <h2 class="section-title">{title}</h2>

  {#if hasLink}
    {#if href}
      <a {href} class="section-link">
        <span>{linkText}</span>
        <span class="chevron-mobile">
          <ChevronRight
            variant="outline"
            color="hsl(var(--white33))"
            size={16}
          />
        </span>
        <span class="chevron-desktop">
          <ChevronRight
            variant="outline"
            color="hsl(var(--white33))"
            size={14}
          />
        </span>
      </a>
    {:else if onClick}
      <button type="button" class="section-link" on:click={onClick}>
        <span>{linkText}</span>
        <span class="chevron-mobile">
          <ChevronRight
            variant="outline"
            color="hsl(var(--white33))"
            size={16}
          />
        </span>
        <span class="chevron-desktop">
          <ChevronRight
            variant="outline"
            color="hsl(var(--white33))"
            size={14}
          />
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

  /* Desktop: larger title */
  @media (min-width: 768px) {
    .section-title {
      font-size: 1.5rem;
    }
  }

  .section-link {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    color: hsl(var(--white33));
    text-decoration: none;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    transition: color 0.15s ease;
  }

  .section-link:hover {
    color: hsl(var(--white66));
  }

  /* Chevron responsive display */
  .chevron-mobile {
    display: flex;
  }

  .chevron-desktop {
    display: none;
  }

  @media (min-width: 768px) {
    .chevron-mobile {
      display: none;
    }

    .chevron-desktop {
      display: flex;
    }
  }
</style>
