<script lang="ts">
  import { Search, X } from "lucide-svelte";
  import { fade } from "svelte/transition";
  import Label from "./Label.svelte";
  import ProfilePic from "./ProfilePic.svelte";
  import { ChevronRight, Magic } from "$lib/components/icons";
  import { wheelScroll } from "$lib/actions/wheelScroll.js";
  import { goto } from "$app/navigation";

  interface Props {
    open?: boolean;
    searchQuery?: string;
    categories?: string[];
    platforms?: string[];
  }

  let { 
    open = $bindable(false), 
    searchQuery = $bindable(""), 
    categories = [], 
    platforms = [] 
  }: Props = $props();

  let searchInput: HTMLInputElement;

  // Catalog data
  const catalogs = [
    { name: "Zapstore", image: "" },
    { name: "Beta Males", image: "" },
    { name: "Google Play", image: "" },
    { name: "Github", image: "" },
  ];

  // Dummy suggestions
  const dummySuggestions = [
    "Testflight",
    "Internet Speed Test",
    "CPU Stress Test",
    "TestDPC",
    "ABTester",
  ];

  const suggestions = $derived(searchQuery.trim() ? dummySuggestions : []);
  const showSuggestions = $derived(searchQuery.trim().length > 0);

  // Focus search input when modal opens
  $effect(() => {
    if (open && searchInput) {
      setTimeout(() => {
        searchInput?.focus();
      }, 100);
    }
    if (!open) {
      searchQuery = "";
    }
  });

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      open = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      open = false;
    }
    if (e.key === "Enter" && searchQuery.trim()) {
      handleSearch();
    }
  }

  function handleSuggestionClick(suggestion: string) {
    searchQuery = suggestion;
    handleSearch();
  }

  function handleSearch() {
    if (searchQuery.trim()) {
      open = false;
      goto(`/apps?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  }

  function handleDescribeClick() {
    console.log("Describe search:", searchQuery);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_interactive_supports_focus -->
  <div
    class="fixed inset-0 z-[100] bg-overlay flex justify-center items-start"
    style="position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; width: 100vw !important; height: 100vh !important; margin: 0 !important;"
    transition:fade={{ duration: 150 }}
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    aria-label="Search overlay"
    tabindex="-1"
  >
    <div
      class="border-subtle shadow-2xl overflow-hidden backdrop-blur-lg w-full search-modal-width mx-0 sm:mx-4"
      style="
        background: linear-gradient(
          to bottom,
          hsl(var(--gray33)),
          hsl(241 15% 25% / 0.5)
        );
        border-top-left-radius: 0;
        border-top-right-radius: 0;
        border-bottom-left-radius: var(--radius-32);
        border-bottom-right-radius: var(--radius-32);
      "
      transition:fade={{ duration: 150 }}
    >
      <!-- Search Bar -->
      <div class="p-3 pb-1">
        <div
          class="search-bar-btn flex items-center gap-3 pl-3 pr-4 h-10 transition-all duration-200 focus-within:shadow-[0_0_80px_hsl(var(--blurpleColor)/0.2),0_0_160px_hsl(var(--blurpleColor)/0.15),0_0_240px_hsl(var(--blurpleColor)/0.12),0_0_320px_hsl(var(--blurpleColor)/0.08)]"
          style="border-color: hsl(var(--white16)); background-color: hsl(var(--black16));"
        >
          <Search class="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <input
            bind:this={searchInput}
            type="text"
            bind:value={searchQuery}
            placeholder="Search or Describe apps"
            class="search-input flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-base"
          />
          <button
            type="button"
            onclick={() => (open = false)}
            class="close-btn rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            aria-label="Close search"
          >
            <X class="h-5 w-5" style="color: hsl(var(--white33));" />
          </button>
        </div>
      </div>

      <!-- Suggestions -->
      {#if showSuggestions}
        <div class="suggestions-area px-3 pb-2">
          {#each suggestions as suggestion}
            <button
              type="button"
              class="suggestion-item w-full text-left px-4 py-1.5 hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-3"
              onclick={() => handleSuggestionClick(suggestion)}
            >
              <Search
                class="h-5 w-5 flex-shrink-0"
                style="color: hsl(var(--white16));"
              />
              <span style="color: hsl(var(--white66));">{suggestion}</span>
            </button>
          {/each}

          <button
            type="button"
            class="suggestion-item w-full text-left px-4 py-1.5 hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-3"
            onclick={handleDescribeClick}
          >
            <Magic variant="fill" size={20} color="url(#blurple-gradient)" />
            <span
              style="background: var(--gradient-gray66); -webkit-background-clip: text; background-clip: text; color: transparent;"
            >Search with description</span>
          </button>
        </div>

        <svg width="0" height="0" style="position: absolute;">
          <defs>
            <linearGradient id="blurple-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color: hsl(var(--blurpleColor66));" />
              <stop offset="100%" style="stop-color: hsl(var(--blurpleColor));" />
            </linearGradient>
          </defs>
        </svg>
      {/if}

      <!-- Content Area -->
      <div class="content-area flex flex-col gap-4">
        <!-- Catalogs Section -->
        <div>
          <div class="section-header flex items-center justify-between mb-2">
            <h3 class="eyebrow-label">Catalogs</h3>
            <button type="button" class="more-btn flex items-center gap-1.5 cursor-pointer">
              <span class="text-xs" style="color: hsl(var(--white33));">More</span>
              <ChevronRight variant="outline" color="hsl(var(--white33))" size={10} />
            </button>
          </div>
          <div class="scrollable-row scrollbar-hide" use:wheelScroll>
            <div class="flex gap-2">
              {#each catalogs as catalog}
                <button
                  type="button"
                  class="catalog-pill flex items-center gap-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
                >
                  <ProfilePic pictureUrl={catalog.image || null} name={catalog.name} size="sm" />
                  <span class="text-sm whitespace-nowrap" style="color: hsl(var(--white66));">{catalog.name}</span>
                </button>
              {/each}
            </div>
          </div>
        </div>

        <!-- Labels Section -->
        <div>
          <div class="section-header flex items-center justify-between mb-2">
            <h3 class="eyebrow-label">Labels</h3>
            <button type="button" class="more-btn flex items-center gap-1.5 cursor-pointer">
              <span class="text-xs" style="color: hsl(var(--white33));">More</span>
              <ChevronRight variant="outline" color="hsl(var(--white33))" size={10} />
            </button>
          </div>
          <div class="scrollable-row scrollbar-hide" use:wheelScroll>
            <div class="flex gap-2">
              {#each categories as category}
                <div class="flex-shrink-0">
                  <Label text={category} isSelected={false} isEmphasized={false} />
                </div>
              {/each}
            </div>
          </div>
        </div>

        <!-- Platforms Section -->
        <div class="pb-4">
          <div class="section-header mb-2">
            <h3 class="eyebrow-label">Platforms</h3>
          </div>
          <div class="flex flex-wrap gap-2 px-4">
            {#each platforms as platform}
              <button
                type="button"
                class="pill flex items-center gap-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              >
                <span class="text-sm whitespace-nowrap" style="color: hsl(var(--white66));">{platform}</span>
              </button>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .close-btn {
    padding: 0.125rem;
    margin-right: -0.25rem;
  }

  .content-area {
    padding-top: 0.5rem;
  }

  .section-header {
    padding-left: 1rem;
    padding-right: 0.75rem;
  }

  .more-btn {
    background: none;
    border: none;
    padding: 0;
  }

  .more-btn:hover span {
    color: hsl(var(--white66)) !important;
  }

  .scrollable-row {
    overflow-x: auto;
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }

  .catalog-pill {
    padding: 4px;
    padding-right: 0.875rem;
    border-radius: 9999px;
  }

  .pill {
    height: 32px;
    padding: 0 0.875rem;
    border-radius: 9999px;
  }

  .suggestions-area {
    border-bottom: 1px solid hsl(var(--white8));
    margin-bottom: 0.5rem;
  }

  .suggestion-item {
    background: none;
    border: none;
    font-size: 0.875rem;
  }
</style>
