<script>
  import { onMount } from "svelte";
  import { assets } from "$app/paths";

  let sectionElement;
  let scrollProgress = 0;
  let chainLeftOffset = 0;
  let chainRightOffset = 0;
  let textOpacity = 0;
  let textScale = 0.8;

  function handleScroll() {
    if (!sectionElement) return;

    const rect = sectionElement.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const sectionTop = rect.top;
    const sectionHeight = rect.height;

    // Calculate scroll progress (0 to 1) as section enters viewport
    // Start animation when section top reaches 80% of viewport
    // Complete animation when section top reaches 20% of viewport
    const startPoint = windowHeight * 0.8;
    const endPoint = windowHeight * 0.2;
    const scrollRange = startPoint - endPoint;
    const currentScroll = startPoint - sectionTop;

    if (currentScroll < 0) {
      // Before animation starts
      scrollProgress = 0;
    } else if (currentScroll > scrollRange) {
      // After animation completes
      scrollProgress = 1;
    } else {
      // During animation
      scrollProgress = currentScroll / scrollRange;
    }

    // Clamp between 0 and 1
    scrollProgress = Math.max(0, Math.min(1, scrollProgress));

    // Calculate chain offsets (move apart)
    // Maximum offset: move chains less far apart
    const maxOffset = window.innerWidth * 0.08; // 8% of viewport width each side
    // Start with initial overlap, then move apart
    const initialOverlap = -window.innerWidth * 0.05; // Start 5% overlapped
    chainLeftOffset = initialOverlap - scrollProgress * maxOffset;
    chainRightOffset = -initialOverlap + scrollProgress * maxOffset;

    // Calculate text animation (scale and opacity)
    textOpacity = scrollProgress;
    textScale = 0.8 + scrollProgress * 0.2; // Scale from 0.8 to 1.0
  }

  onMount(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  });
</script>

<section
  bind:this={sectionElement}
  class="relative min-h-[60vh] flex items-center justify-center overflow-hidden"
>
  <!-- Blurple gradient background -->
  <div class="absolute inset-0 z-0">
    <div
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] gradient-orb bg-primary/15"
      style="filter: blur(120px);"
    ></div>
    <div
      class="absolute top-1/3 left-1/4 w-[400px] h-[400px] gradient-orb bg-accent/10"
      style="animation-delay: -4s; filter: blur(100px);"
    ></div>
    <div
      class="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] gradient-orb bg-primary/10"
      style="animation-delay: -2s; filter: blur(100px);"
    ></div>
  </div>

  <!-- Left chain -->
  <img
    src={`${assets}/images/chain-left.png`}
    alt=""
    class="absolute h-[70vh] w-auto object-contain z-10"
    style="left: 50%; top: 50%; transform: translate(-100%, -50%) translateX({chainLeftOffset}px); transition: transform 0.1s ease-out;"
    loading="lazy"
  />

  <!-- Right chain -->
  <img
    src={`${assets}/images/chain-right.png`}
    alt=""
    class="absolute h-[70vh] w-auto object-contain z-10"
    style="left: 50%; top: 50%; transform: translate(0%, -50%) translateX({chainRightOffset}px); transition: transform 0.1s ease-out;"
    loading="lazy"
  />

  <!-- Center text -->
  <div
    class="relative z-20 text-center px-4"
    style="opacity: {textOpacity}; transform: scale({textScale}); transition: opacity 0.2s ease-out, transform 0.2s ease-out;"
  >
    <h2 class="section-title text-display-lg leading-tight">
      <span
        class="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl"
        style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;"
      >
        Publish
      </span>
      <br class="mb-6" />
      <span
        class="text-3xl sm:text-4xl lg:text-4xl xl:text-5xl"
        style="background: var(--gradient-blurple-light); -webkit-background-clip: text; background-clip: text; color: transparent;"
      >
        Without Permission
      </span>
    </h2>
    <p class="section-description max-w-2xl mx-auto mt-7">
      Break free from the chains of centralized app stores.<br />Publish your
      app in the open.
    </p>
  </div>
</section>

<style>
  .gradient-orb {
    border-radius: 50%;
    opacity: 0.6;
    animation: float 20s ease-in-out infinite;
  }

  @keyframes float {
    0%,
    100% {
      transform: translate(0, 0) scale(1);
    }
    50% {
      transform: translate(30px, -30px) scale(1.1);
    }
  }
</style>
