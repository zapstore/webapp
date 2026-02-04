<script>
  import { Download } from "$lib/components/icons";
  import { assets } from "$app/paths";

  export let showDownloadModal = () => {};
</script>

<!-- Get The App Section -->
<section
  class="relative h-[640px] lg:h-[600px] border-t border-border/50 overflow-hidden"
>
  <!-- Section background decoration -->
  <div
    class="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.08),transparent)]"
  ></div>
  <div
    class="container mx-auto px-4 sm:px-6 md:px-8 lg:px-8 h-full relative z-10"
  >
    <div
      class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start h-full pt-12 sm:pt-16 lg:pt-20"
    >
      <!-- Left: Content -->
      <div
        class="space-y-4 sm:space-y-6 p-6 sm:p-8 rounded-2xl lg:order-2"
        style="background-color: hsl(var(--gray33)); border-radius: var(--radius-32);"
      >
        <h2
          class="section-title text-display-lg text-3xl sm:text-4xl lg:text-4xl xl:text-5xl leading-tight section-title-gradient"
        >
          Get The App
        </h2>
        <p class="section-description max-w-xl">
          Discover apps through communities where builders and users connect, with secure downloads and reliable updates built in.
        </p>
        <div class="flex flex-row gap-3">
          <a
            href="/apps/naddr1qvzqqqr7pvpzq7xwd748yfjrsu5yuerm56fcn9tntmyv04w95etn0e23xrczvvraqqgxgetk9eaxzurnw3hhyefwv9c8qakg5jt"
            class="btn-secondary-large btn-secondary-light"
            style="color: hsl(var(--white66));"
          >
            More Info
          </a>
          <button
            type="button"
            on:click={showDownloadModal}
            class="btn-primary-large flex-1 flex items-center justify-center gap-3"
          >
            <Download variant="fill" color="hsl(var(--white66))" size={18} />
            Download
          </button>
        </div>
      </div>

      <!-- Right: App Image -->
      <div class="flex justify-center lg:justify-end h-full lg:order-1">
        <div class="relative w-full max-w-md lg:max-w-lg h-full px-6 lg:px-8">
          <img
            src={`${assets}/images/android-app-screenshot.png`}
            alt="Zapstore Android app screenshot"
            class="w-full h-full object-cover object-top"
            style="filter: drop-shadow(0 0 60px hsl(var(--blurpleColor) / 0.05)) drop-shadow(0 0 120px hsl(var(--blurpleColor) / 0.025));"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  </div>
</section>
