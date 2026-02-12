<script>
  import { ChevronRight } from "$lib/components/icons";

  /** @type {HTMLButtonElement | null} */
  let openFeedButton = null;

  /** @param {MouseEvent} event */
  function handleMouseMove(event) {
    if (!openFeedButton) return;
    const rect = openFeedButton.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    openFeedButton.style.setProperty("--mouse-x", `${mouseX}px`);
    openFeedButton.style.setProperty("--mouse-y", `${mouseY}px`);
  }

  function handleOpenFeed() {
    // TODO: Navigate to feed
  }
</script>

<section class="relative border-t border-border/50 overflow-hidden">
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 pt-16 lg:pt-20 pb-0">
    <!-- Center text -->
    <div class="relative z-20 text-center mb-8">
      <h2 class="section-title text-display-lg leading-tight">
        <span class="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl"
          ><span
            class="hash-gradient"
            >#</span
          ><span
            class="section-title-gradient"
            >ZapTheApp</span
          ></span
        >
      </h2>
      <p class="section-description max-w-2xl mx-auto mt-7">
        Users, valuing devs. No middlemen. No nonsense.
      </p>
    </div>

    <!-- Feed container -->
    <div
      class="feed-content rounded-t-[32px] relative overflow-hidden feed-container-border feed-bg"
    >
      <!-- Content placeholder -->
      <div class="h-64"></div>
      <!-- Open Feed Button - 32px from bottom edge -->
      <button
        type="button"
        bind:this={openFeedButton}
        on:click={handleOpenFeed}
        on:mousemove={handleMouseMove}
        class="absolute bottom-8 left-1/2 transform -translate-x-1/2 btn-glass-large btn-glass-with-chevron flex items-center group z-40"
      >
        Open Feed
        <ChevronRight
          variant="outline"
          color="hsl(var(--white33))"
          size={18}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </button>
    </div>
  </div>
</section>

<style>
  .hash-gradient {
    background: var(--gradient-white-blurple);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    opacity: 0.66;
  }

  .feed-bg {
    background: linear-gradient(
      to bottom,
      hsl(var(--gray33)) 0%,
      hsl(var(--gray) / 0.08) 100%
    );
  }

  .feed-container-border {
    border: var(--border-base) solid hsl(var(--white8));
  }
</style>
