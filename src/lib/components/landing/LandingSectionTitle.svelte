<script>
  import { ChevronRight } from "$lib/components/icons";

  export let title = "";
  export let description = "";

  // Glass button (secondary)
  export let showSeeMore = false;
  export let seeMoreText = "See More";
  export let seeMoreAction = () => {};

  // Primary CTA button (blurple)
  export let showPrimaryCta = false;
  export let primaryCtaText = "";
  export let primaryCtaAction = () => {};

  // Show buttons on mobile (default: hide on mobile)
  export let showButtonsOnMobile = false;

  let seeMoreButton;
  let primaryCtaButton;

  function handleSeeMoreMouseMove(event) {
    if (!seeMoreButton) return;
    const rect = seeMoreButton.getBoundingClientRect();
    seeMoreButton.style.setProperty(
      "--mouse-x",
      `${event.clientX - rect.left}px`,
    );
    seeMoreButton.style.setProperty(
      "--mouse-y",
      `${event.clientY - rect.top}px`,
    );
  }

  function handlePrimaryCtaMouseMove(event) {
    if (!primaryCtaButton) return;
    const rect = primaryCtaButton.getBoundingClientRect();
    primaryCtaButton.style.setProperty(
      "--mouse-x",
      `${event.clientX - rect.left}px`,
    );
    primaryCtaButton.style.setProperty(
      "--mouse-y",
      `${event.clientY - rect.top}px`,
    );
  }
</script>

<div
  class="container mx-auto px-6 sm:px-6 lg:px-8 {description ? 'mb-8' : 'mb-4'}"
>
  <!-- Title row with button -->
  <div class="flex items-center justify-between gap-4 mb-3">
    <h2
      class="section-title text-display-lg text-3xl sm:text-4xl lg:text-4xl xl:text-5xl leading-tight section-title-gradient flex-1 min-w-0"
    >
      {title}
    </h2>

    <!-- Buttons - conditionally shown on mobile -->
    <div class="{showButtonsOnMobile ? 'flex' : 'hidden md:flex'} items-center gap-3 flex-shrink-0">
      {#if showSeeMore}
        <button
          type="button"
          bind:this={seeMoreButton}
          on:click={seeMoreAction}
          on:mousemove={handleSeeMoreMouseMove}
          class="btn-glass-large btn-glass-with-chevron flex items-center group"
        >
          {seeMoreText}
          <ChevronRight
            variant="outline"
            color="hsl(var(--white33))"
            size={18}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </button>
      {/if}
      {#if showPrimaryCta}
        <button
          type="button"
          bind:this={primaryCtaButton}
          on:click={primaryCtaAction}
          on:mousemove={handlePrimaryCtaMouseMove}
          class="btn-primary-large"
        >
          {primaryCtaText}
        </button>
      {/if}
    </div>
  </div>

  <!-- Description row - full width -->
  {#if description}
    <p class="section-description">
      {description}
    </p>
  {/if}
</div>
