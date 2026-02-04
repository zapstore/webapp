<script>
  import { onMount } from "svelte";

  let mounted = false;

  onMount(() => {
    requestAnimationFrame(() => {
      mounted = true;
    });
  });
</script>

<section class="relative overflow-hidden">
  <!-- Header Content -->
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 lg:pt-20">
    <h1
      class="text-display-lg text-3xl sm:text-4xl lg:text-5xl xl:text-6xl leading-tight mb-4 sm:mb-6"
    >
      <span
        style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;"
      >
        A purpose-built
      </span>
      <br />
      <span
        style="background: var(--gradient-blurple-light); -webkit-background-clip: text; background-clip: text; color: transparent;"
      >
        developer suite
      </span>
    </h1>
    <p
      class="text-lg sm:text-xl text-muted-foreground max-w-lg mb-10 sm:mb-12 lg:mb-16"
    >
      Reliable tools for shipping apps and interacting with communities of users.
    </p>
  </div>

  <!-- Screenshots Container -->
  <div
    class="container mx-auto px-4 sm:px-6 lg:px-8 relative screenshots-container"
  >
    <div class="screenshots-wrapper">
      <!-- Main Desktop Screenshot (Zapstore Studio) -->
      <div class="screenshot-desktop {mounted ? 'screenshot-visible' : ''}">
        <!-- Drop your desktop screenshot here -->
        <div class="screenshot-placeholder screenshot-placeholder-desktop">
          <span class="placeholder-label">Desktop Screenshot (16:9)</span>
        </div>
      </div>

      <!-- Mobile Screenshot -->
      <div class="screenshot-mobile {mounted ? 'screenshot-visible' : ''}">
        <!-- Drop your mobile screenshot here -->
        <div class="screenshot-placeholder screenshot-placeholder-mobile">
          <span class="placeholder-label">Mobile</span>
        </div>
      </div>

      <!-- CLI Screenshot -->
      <div class="screenshot-cli {mounted ? 'screenshot-visible' : ''}">
        <!-- Drop your CLI screenshot here -->
        <div class="screenshot-placeholder screenshot-placeholder-cli">
          <span class="placeholder-label">CLI</span>
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  .screenshots-container {
    perspective: 800px;
  }

  .screenshots-wrapper {
    position: relative;
    height: 280px;
    transform-style: preserve-3d;
  }

  /* Base screenshot styles */
  .screenshot-desktop,
  .screenshot-mobile,
  .screenshot-cli {
    position: absolute;
    opacity: 0;
    transition: opacity 0.6s ease-out;
  }

  .screenshot-visible {
    opacity: 1;
  }

  /* Desktop - main, full width with 3D tilt */
  .screenshot-desktop {
    left: 0;
    right: 0;
    top: 0;
    z-index: 3;
    transform: rotateY(15deg) rotateX(5deg) rotateZ(-10deg);
    transform-origin: left center;
    transform-style: preserve-3d;
  }

  /* Mobile - smaller, right side */
  .screenshot-mobile {
    right: 5%;
    top: 10%;
    z-index: 4;
    width: 140px;
    transition-delay: 100ms;
    transform: rotateY(10deg) rotateX(3deg) rotateZ(-10deg);
    transform-origin: right center;
  }

  /* CLI - medium, right side lower */
  .screenshot-cli {
    right: 15%;
    top: 40%;
    z-index: 2;
    width: 260px;
    transition-delay: 200ms;
    transform: rotateY(8deg) rotateX(4deg) rotateZ(-10deg);
    transform-origin: right center;
  }

  /* Placeholder styling - replace with actual images */
  .screenshot-placeholder {
    background: hsl(var(--gray33));
    border: 1px dashed hsl(var(--white22));
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .screenshot-placeholder-desktop {
    width: 100%;
    aspect-ratio: 16 / 9;
  }

  .screenshot-placeholder-mobile {
    width: 100%;
    height: 240px;
    border-radius: 20px;
  }

  .screenshot-placeholder-cli {
    width: 100%;
    height: 160px;
  }

  .placeholder-label {
    font-size: 12px;
    color: hsl(var(--white33));
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  /* Responsive */
  @media (min-width: 640px) {
    .screenshots-wrapper {
      height: 320px;
    }

    .screenshot-mobile {
      width: 160px;
    }

    .screenshot-placeholder-mobile {
      height: 280px;
    }

    .screenshot-cli {
      width: 300px;
    }

    .screenshot-placeholder-cli {
      height: 180px;
    }
  }

  @media (min-width: 1024px) {
    .screenshots-wrapper {
      height: 380px;
    }

    .screenshot-mobile {
      width: 180px;
      right: 3%;
    }

    .screenshot-placeholder-mobile {
      height: 320px;
    }

    .screenshot-cli {
      width: 340px;
      right: 12%;
    }

    .screenshot-placeholder-cli {
      height: 200px;
    }
  }

  @media (max-width: 639px) {
    .screenshot-mobile,
    .screenshot-cli {
      display: none;
    }
  }
</style>
