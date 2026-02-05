<script>
  const primaryPlatforms = [
    { name: 'Apple App Store', icon: 'apple' },
    { name: 'Google Play', icon: 'google' },
    { name: 'F-Droid', icon: 'fdroid' },
    { name: 'Zapstore', icon: 'zapstore' },
    { name: 'AltStore', icon: 'altstore' },
    { name: 'Samsung Galaxy', icon: 'samsung' },
  ];
</script>

<section class="py-24 lg:py-32 border-t border-border/50" id="platforms">
  <div class="container mx-auto px-4 sm:px-6 lg:px-8">
    <div class="max-w-2xl mx-auto text-center mb-16">
      <span class="inline-block text-xs font-semibold tracking-widest uppercase reachkit-gradient mb-4">Distribution</span>
      <h2 class="text-display text-3xl sm:text-4xl lg:text-5xl mb-6">One command.<br />Every major store.</h2>
      <p class="text-lg text-muted-foreground">
        Ship to <strong class="text-foreground">iOS and Android</strong> simultaneously. From <strong class="text-foreground">App Store to AltStore</strong>, from <strong class="text-foreground">Google Play to F-Droid</strong>.
      </p>
    </div>

    <div class="flex justify-center mb-16">
      <div class="relative w-[400px] h-[400px] max-w-full">
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-card border border-border/50 flex items-center justify-center z-10 shadow-lg shadow-primary/20">
          <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
            <defs>
              <linearGradient id="center-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#FFB800" />
                <stop offset="100%" style="stop-color:#FF6B35" />
              </linearGradient>
            </defs>
            <path d="M4 16L12 8L20 16L12 24L4 16Z" fill="url(#center-gradient)" />
            <path d="M12 16L20 8L28 16L20 24L12 16Z" fill="url(#center-gradient)" opacity="0.6" />
          </svg>
        </div>

        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] rounded-full border border-border/50"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] rounded-full border border-border/30"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] h-[360px] rounded-full border border-border/20"></div>

        <svg class="absolute inset-0 w-full h-full" viewBox="0 0 400 400">
          {#each primaryPlatforms as _, i}
            <line
              x1="200"
              y1="200"
              x2={200 + 140 * Math.cos((i * 60 - 90) * Math.PI / 180)}
              y2={200 + 140 * Math.sin((i * 60 - 90) * Math.PI / 180)}
              stroke="rgba(255,184,0,0.2)"
              stroke-width="1"
              stroke-dasharray="4 4"
            />
          {/each}
        </svg>

        {#each primaryPlatforms as platform, i}
          {@const angle = i * 60 - 90}
          {@const x = 200 + 140 * Math.cos(angle * Math.PI / 180)}
          {@const y = 200 + 140 * Math.sin(angle * Math.PI / 180)}
          <div class="absolute w-12 h-12 -ml-6 -mt-6 group" style="left: {x}px; top: {y}px;" title={platform.name}>
            <div class="w-full h-full rounded-xl bg-card border border-border/50 flex items-center justify-center text-muted-foreground transition-all group-hover:border-primary group-hover:text-primary group-hover:scale-110">
              {#if platform.icon === 'apple'}
                <svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
              {:else if platform.icon === 'google'}
                <svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.24-.84-.76-.84-1.35m13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27m3.35-4.31c.34.27.59.69.59 1.19 0 .5-.25.92-.59 1.19l-2.43 1.45L15.69 12l2.04-2.04 2.43 1.45M6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z"/></svg>
              {:else if platform.icon === 'zapstore'}
                <svg viewBox="0 0 19 32" fill="currentColor" class="w-5 h-5"><path d="M18.8379 13.9711L8.84956 0.356086C8.30464 -0.386684 7.10438 0.128479 7.30103 1.02073L9.04686 8.94232C9.16268 9.46783 8.74887 9.96266 8.19641 9.9593L0.871032 9.91477C0.194934 9.91066 -0.223975 10.6293 0.126748 11.1916L7.69743 23.3297C7.99957 23.8141 7.73264 24.4447 7.16744 24.5816L5.40958 25.0076C4.70199 25.179 4.51727 26.0734 5.10186 26.4974L12.4572 31.8326C12.9554 32.194 13.6711 31.9411 13.8147 31.3529L15.8505 23.0152C16.0137 22.3465 15.3281 21.7801 14.6762 22.0452L13.0661 22.7001C12.5619 22.9052 11.991 22.6092 11.8849 22.0877L10.7521 16.5224C10.6486 16.014 11.038 15.5365 11.5704 15.5188L18.1639 15.2998C18.8529 15.2769 19.2383 14.517 18.8379 13.9711Z"/></svg>
              {:else if platform.icon === 'altstore'}
                <svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
              {:else if platform.icon === 'fdroid'}
                <svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18l7.66 3.82-7.66 3.82-7.66-3.82L12 4.18zM4 8.82l7 3.5v7.36l-7-3.5V8.82zm16 7.36l-7 3.5v-7.36l7-3.5v7.36z"/></svg>
              {:else if platform.icon === 'samsung'}
                <svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
              {/if}
            </div>
            <span class="hidden md:block absolute top-full left-1/2 -translate-x-1/2 mt-1 text-[10px] text-muted-foreground whitespace-nowrap">
              {platform.name}
            </span>
          </div>
        {/each}
      </div>
    </div>
  </div>
</section>
