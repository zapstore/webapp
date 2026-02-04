<script lang="ts">
  import AppPic from "../common/AppPic.svelte";
  import { browser } from "$app/environment";

  /**
   * AppSmallCard - A compact app card for horizontal scroll layouts
   *
   * Responsive sizing (two breakpoints):
   * - Mobile (<768px): 56px icon, 14px name, 12px description (1 line)
   * - Desktop (>=768px): 72px icon, 16px name, 14px description (2 lines)
   */

  interface Props {
    app: { name: string; icon?: string; description?: string; descriptionHtml?: string; dTag?: string };
    href?: string;
    className?: string;
    onclick?: (e: MouseEvent) => void;
  }

  let { app, href = "", className = "", onclick }: Props = $props();

  // Get plain text description (strip HTML)
  function getPlainDescription(appData: typeof app) {
    if (appData.description) return appData.description;
    if (appData.descriptionHtml && browser) {
      const temp = document.createElement("div");
      temp.innerHTML = appData.descriptionHtml;
      return temp.textContent || temp.innerText || "";
    }
    return "";
  }

  const description = $derived(getPlainDescription(app));

  function handleClick(e: MouseEvent) {
    if (onclick) {
      onclick(e);
    }
  }
</script>

<a {href} class="app-small-card {className}" onclick={handleClick}>
  <!-- Mobile icon (56px) -->
  <div class="app-icon-mobile">
    <AppPic
      iconUrl={app.icon}
      name={app.name}
      identifier={app.dTag}
      size="lg"
    />
  </div>

  <!-- Desktop icon (72px) -->
  <div class="app-icon-desktop">
    <AppPic
      iconUrl={app.icon}
      name={app.name}
      identifier={app.dTag}
      size="xl"
    />
  </div>

  <div class="app-info">
    <span class="app-name">{app.name || ""}</span>
    {#if description}
      <span class="app-description">{description}</span>
    {/if}
  </div>
</a>

<style>
  .app-small-card {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 0 !important;
    text-decoration: none;
    color: inherit;
    background: transparent !important;
    width: 100%;
  }

  @media (min-width: 768px) {
    .app-small-card {
      gap: 20px;
    }
  }

  /* Responsive icon display */
  .app-icon-mobile {
    display: block;
    flex-shrink: 0;
  }

  .app-icon-desktop {
    display: none;
    flex-shrink: 0;
  }

  @media (min-width: 768px) {
    .app-icon-mobile {
      display: none;
    }

    .app-icon-desktop {
      display: block;
    }
  }

  .app-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 6px;
  }

  /* Mobile: 1 line description */
  .app-name {
    font-size: 1rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .app-description {
    font-size: 0.75rem;
    color: hsl(var(--white66));
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Desktop: larger text, 2 line description */
  @media (min-width: 768px) {
    .app-name {
      font-size: 1rem;
    }

    .app-description {
      font-size: 0.875rem;
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }
  }
</style>
