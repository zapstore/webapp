<script>
  const painPoints = [
    { icon: 'clock', title: 'Weeks lost to review cycles', description: 'Every rejection means days of back-and-forth. A single screenshot issue can delay your launch by a week.' },
    { icon: 'target', title: 'Guessing what reviewers want', description: 'Guidelines are hundreds of pages. Requirements change constantly. You never know what will trigger a rejection.' },
    { icon: 'branches', title: 'Managing multiple stores', description: 'Each store has unique requirements. F-Droid bans proprietary code. AltStore needs EU compliance. Google wants Play Services.' },
  ];
</script>

<section class="py-24 lg:py-32 border-t border-border/50" id="problem">
  <div class="container mx-auto px-4 sm:px-6 lg:px-8">
    <div class="max-w-2xl mx-auto text-center mb-16">
      <span class="inline-block text-xs font-semibold tracking-widest uppercase reachkit-gradient mb-4">The problem</span>
      <h2 class="text-display text-3xl sm:text-4xl lg:text-5xl mb-6">You're shipping blind.</h2>
      <p class="text-lg text-muted-foreground">
        Every app store submission is a coin flip. You spend hours preparing, then wait days hoping for approval — only to get a <strong class="text-foreground">cryptic rejection</strong> that sends you back to square one.
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-16">
      {#each painPoints as point, i}
        <div
          class="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-8 card-glow transition-all hover:-translate-y-1"
          style="animation: fadeInUp 0.6s ease-out {i * 0.1}s both"
        >
          <div class="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4 text-rose-400">
            {#if point.icon === 'clock'}
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            {:else if point.icon === 'target'}
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-3-3v6m-7.5 3a9 9 0 1118 0 9 9 0 01-18 0z" />
              </svg>
            {:else if point.icon === 'branches'}
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
            {/if}
          </div>
          <h3 class="text-xl font-semibold text-foreground mb-3">{point.title}</h3>
          <p class="text-muted-foreground text-sm leading-relaxed">{point.description}</p>
        </div>
      {/each}
    </div>

    <div class="max-w-3xl mx-auto rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-8 lg:p-12 text-center">
      <svg viewBox="0 0 400 100" fill="none" class="w-full max-w-[400px] mx-auto mb-6">
        <defs>
          <linearGradient id="loop-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#ef4444" />
            <stop offset="100%" stop-color="#f59e0b" />
          </linearGradient>
        </defs>
        <path d="M50 50 C 100 10, 180 10, 200 50 C 220 90, 300 90, 350 50" stroke="url(#loop-gradient)" stroke-width="2" fill="none" stroke-dasharray="4 4" opacity="0.5" />
        <circle cx="50" cy="50" r="8" fill="#ef4444" />
        <circle cx="200" cy="50" r="8" fill="#f59e0b" />
        <circle cx="350" cy="50" r="8" fill="#ef4444" />
      </svg>

      <div class="flex flex-wrap justify-center gap-8 mb-6">
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <span class="w-2 h-2 rounded-full bg-rose-500"></span>
          Submit
        </div>
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <span class="w-2 h-2 rounded-full bg-amber-500"></span>
          Wait 3-7 days
        </div>
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <span class="w-2 h-2 rounded-full bg-rose-500"></span>
          Rejected
        </div>
      </div>

      <p class="text-sm text-muted-foreground italic">
        The average app goes through this cycle <strong class="text-foreground not-italic">2-3 times</strong> before approval.
      </p>
    </div>
  </div>
</section>

<style>
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
