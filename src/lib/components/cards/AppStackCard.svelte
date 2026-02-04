<script>
  import { goto } from "$app/navigation";
  import AppPic from "../common/AppPic.svelte";
  import ProfilePic from "../common/ProfilePic.svelte";

  /**
   * AppStackCard - A card displaying a stack/collection of apps
   *
   * Shows a 2x2 grid of app icons on the left, with title, description,
   * and creator info on the right.
   *
   * Responsive sizing (two breakpoints):
   * - Mobile (<768px): 32px icons, smaller text
   * - Desktop (>=768px): 38px icons, larger text
   *
   * @example
   * <AppStackCard
   *   stack={{ name: "Dev Tools", description: "...", apps: [...], creator: {...} }}
   *   href="/stacks/{naddr}"
   * />
   */

  /** @type {{ name: string, description?: string, apps: Array<{ icon?: string, name: string, dTag?: string }>, creator?: { name?: string, picture?: string, pubkey?: string, npub?: string } }} */
  export let stack;

  /** @type {string} - Link destination */
  export let href = "";

  /** @type {string} - Additional CSS classes */
  export let className = "";

  // Get the first 4 apps for the 2x2 grid
  $: displayApps = (stack.apps || []).slice(0, 4);

  // Pad with empty slots if less than 4 apps
  $: gridApps = [...displayApps, ...Array(4 - displayApps.length).fill(null)];

  // Helper to capitalize a string (first letter uppercase)
  function capitalize(text) {
    if (!text) return "";
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Helper to get first N words from a string
  function getFirstWords(text, count = 5) {
    if (!text) return "";
    const words = text.trim().split(/\s+/);
    const result = words.slice(0, count).join(" ");
    return words.length > count ? result + "…" : result;
  }

  // Check if description is essentially the same as the name (case-insensitive)
  function isDescriptionSameAsName(name, description) {
    if (!name || !description) return false;
    return name.toLowerCase().trim() === description.toLowerCase().trim();
  }

  // Display title: use name (capitalized), or first 5 words of description (capitalized) as fallback
  $: displayTitle =
    capitalize(stack.name) ||
    capitalize(getFirstWords(stack.description, 5)) ||
    "Untitled Stack";

  // Display description: show default if no name, no description, or description equals name
  $: displayDescription =
    !stack.name ||
    !stack.description ||
    isDescriptionSameAsName(stack.name, stack.description)
      ? `A stack of curated ${displayTitle} applications`
      : stack.description;

  function handleCardClick() {
    if (href) {
      goto(href);
    }
  }

  function handleCreatorClick(e) {
    e.stopPropagation();
    const creatorHref = `/p/${stack.creator?.npub || stack.creator?.pubkey}`;
    goto(creatorHref);
  }
</script>

<div
  class="app-stack-card {className}"
  on:click={handleCardClick}
  on:keydown={(e) => e.key === "Enter" && handleCardClick()}
  role="button"
  tabindex="0"
>
  <!-- 2x2 App Icons Grid -->
  <div class="icons-grid">
    <!-- Mobile grid -->
    <div class="icons-grid-mobile">
      {#each gridApps as app, i}
        <div class="icon-slot">
          {#if app}
            <AppPic
              iconUrl={app.icon}
              name={app.name}
              identifier={app.dTag}
              size="xs"
            />
          {:else}
            <div class="empty-slot"></div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Desktop grid -->
    <div class="icons-grid-desktop">
      {#each gridApps as app, i}
        <div class="icon-slot">
          {#if app}
            <AppPic
              iconUrl={app.icon}
              name={app.name}
              identifier={app.dTag}
              size="sm"
            />
          {:else}
            <div class="empty-slot"></div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- Stack Info -->
  <div class="stack-info">
    <div class="stack-text">
      <span class="stack-name">{displayTitle}</span>
      {#if displayDescription}
        <span class="stack-description">{displayDescription}</span>
      {/if}
    </div>

    <!-- Creator Row -->
    {#if stack.creator}
      <div
        class="creator-row"
        on:click={handleCreatorClick}
        on:keydown={(e) => e.key === "Enter" && handleCreatorClick(e)}
        role="button"
        tabindex="0"
      >
        <ProfilePic
          pictureUrl={stack.creator.picture}
          name={stack.creator.name}
          pubkey={stack.creator.pubkey}
          size="xs"
        />
        <span class="creator-name">{stack.creator.name || "Anonymous"}</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .app-stack-card {
    display: flex;
    align-items: stretch;
    gap: 16px;
    text-decoration: none;
    color: inherit;
    cursor: pointer;
  }

  @media (min-width: 768px) {
    .app-stack-card {
      gap: 20px;
    }
  }

  /* Icons grid container */
  .icons-grid {
    flex-shrink: 0;
    background-color: hsl(var(--gray33));
    border: 1.4px solid hsl(var(--white16));
    border-radius: 16px;
    padding: 8px;
  }

  @media (min-width: 768px) {
    .icons-grid {
      border-radius: 20px;
      padding: 10px;
    }
  }

  /* Mobile grid (32px icons) */
  .icons-grid-mobile {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }

  .icons-grid-desktop {
    display: none;
  }

  @media (min-width: 768px) {
    .icons-grid-mobile {
      display: none;
    }

    .icons-grid-desktop {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
  }

  .icon-slot {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-slot {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background-color: hsl(var(--white8));
  }

  @media (min-width: 768px) {
    .empty-slot {
      width: 38px;
      height: 38px;
    }
  }

  /* Stack info */
  .stack-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 4px 0;
  }
  
  .stack-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stack-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .stack-description {
    font-size: 0.75rem;
    color: hsl(var(--white66));
    line-height: 1.4;
    height: 2.8em; /* Fixed height for 2 lines */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  @media (min-width: 768px) {
    .stack-name {
      font-size: 1rem;
    }

    .stack-description {
      font-size: 0.875rem;
      height: 2.8em; /* Fixed height for 2 lines */
    }
  }

  /* Creator row */
  .creator-row {
    display: flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .creator-row:hover {
    opacity: 0.8;
  }

  .creator-name {
    font-size: 0.75rem;
    color: hsl(var(--white33));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (min-width: 768px) {
    .creator-name {
      font-size: 0.8125rem;
    }
  }
</style>
