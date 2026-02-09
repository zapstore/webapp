<script>
  import { onMount } from 'svelte';

  let mounted = false;

  onMount(() => {
    mounted = true;
  });
</script>

<section class="hero relative overflow-hidden pt-8 pb-32 lg:pt-12 lg:pb-40" class:mounted>
  <!-- Background -->
  <div class="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
    <div class="absolute top-[20%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-primary/10 blur-[80px] opacity-50"></div>

    <svg class="absolute inset-0 w-full h-full opacity-0 transition-opacity duration-1000" class:opacity-100={mounted} viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="hero-grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
        </pattern>
        <linearGradient id="hero-grid-fade" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="white" stop-opacity="1" />
          <stop offset="70%" stop-color="white" stop-opacity="0.5" />
          <stop offset="100%" stop-color="white" stop-opacity="0" />
        </linearGradient>
        <mask id="hero-grid-mask">
          <rect width="100%" height="100%" fill="url(#hero-grid-fade)" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#hero-grid)" mask="url(#hero-grid-mask)" />
    </svg>

    <svg class="absolute top-1/2 left-1/2 w-[120%] h-[120%] -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-1000 delay-300" class:opacity-100={mounted} viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
      {#each Array(24) as _, i}
        <line
          x1="500"
          y1="500"
          x2={500 + 600 * Math.cos((i * 15 * Math.PI) / 180)}
          y2={500 + 600 * Math.sin((i * 15 * Math.PI) / 180)}
          stroke="rgba(255,184,0,0.08)"
          stroke-width="1"
        />
      {/each}
      <circle cx="500" cy="500" r="400" fill="none" stroke="rgba(255,184,0,0.05)" stroke-width="1" />
      <circle cx="500" cy="500" r="280" fill="none" stroke="rgba(255,184,0,0.08)" stroke-width="1" />
      <circle cx="500" cy="500" r="160" fill="none" stroke="rgba(255,184,0,0.1)" stroke-width="1" />
    </svg>
  </div>

  <div class="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
    <div class="max-w-4xl mx-auto text-center">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-sm text-primary mb-8 animate-fade-in-up">
        <span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
        <span>Coming Soon</span>
      </div>

      <h1 class="text-display-lg text-4xl sm:text-6xl lg:text-7xl mb-6 animate-fade-in-up delay-100">
        Fewer rejections, faster approvals.
        <span class="reachkit-gradient">On all stores.</span>
      </h1>

      <p class="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-up delay-200">
        Simulate app store review before you submit. Our AI predicts what reviewers will flag and suggests <strong class="text-foreground">concrete fixes</strong>.
      </p>

      <div class="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up delay-300">
        <a
          href="#waitlist"
          class="group inline-flex items-center justify-center rounded-lg bg-amber-500 px-6 py-3.5 text-sm font-medium text-black transition-all hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/25"
        >
          Get early access
          <svg class="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </a>
        <a
          href="#features"
          class="group inline-flex items-center justify-center rounded-lg border border-border px-6 py-3.5 text-sm font-medium text-foreground transition-all hover:bg-card hover:border-border/80"
        >
          See how it works
        </a>
      </div>
    </div>
  </div>

  <div class="max-w-[700px] mx-auto mt-16 px-4 sm:px-6 animate-fade-in-up delay-400">
    <div class="rounded-xl border border-border/30 bg-[#1a1a1a] overflow-hidden shadow-2xl shadow-black/50">
      <div class="flex items-center px-4 py-3 bg-[#2a2a2a] border-b border-white/5">
        <div class="flex gap-2">
          <span class="w-3 h-3 rounded-full bg-[#ff5f57] shadow-inner"></span>
          <span class="w-3 h-3 rounded-full bg-[#febc2e] shadow-inner"></span>
          <span class="w-3 h-3 rounded-full bg-[#28c840] shadow-inner"></span>
        </div>
        <div class="flex-1 flex justify-center">
          <span class="px-3 py-0.5 rounded bg-white/5 text-[11px] text-white/50 font-medium">zsh — reachkit</span>
        </div>
        <div class="w-[52px]"></div>
      </div>
      <div class="p-5 font-mono text-[13px] leading-[1.9]">
        <div class="flex items-center gap-2">
          <span class="text-emerald-400">❯</span>
          <span class="text-white">reach validate --all</span>
        </div>
        <div class="mt-3 text-white/60">
          <span class="text-emerald-400">✓</span> Analyzing metadata for 4 platforms...
        </div>
        <div class="text-white/60">
          <span class="text-emerald-400">✓</span> iOS App Store: <span class="text-emerald-400">Ready to submit</span>
        </div>
        <div class="text-white/60">
          <span class="text-amber-400">⚠</span> Google Play: <span class="text-amber-400">1 issue detected</span>
        </div>
        <div class="pl-5 text-white/40">└─ Screenshot 3 missing tablet format</div>
        <div class="text-white/60">
          <span class="text-emerald-400">✓</span> Zapstore: <span class="text-emerald-400">Ready to submit</span>
        </div>
        <div class="text-white/60">
          <span class="text-rose-400">✗</span> F-Droid: <span class="text-rose-400">2 blockers found</span>
        </div>
        <div class="pl-5 text-white/40">├─ Proprietary dependency: com.google.firebase</div>
        <div class="pl-5 text-white/40">└─ <span class="text-amber-300">Fix:</span> reach suggest-alternative firebase</div>
        <div class="mt-3 flex items-center gap-2">
          <span class="text-emerald-400">❯</span>
          <span class="text-white/80 animate-pulse">▋</span>
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  .hero {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
</style>
