<script lang="ts">
  let email = '';
  let submitted = false;
  let loading = false;
  let error = '';

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!email) return;

    loading = true;
    error = '';

    try {
      const response = await fetch('https://formspree.io/f/mkglwdwa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) throw new Error('Failed to join waitlist');

      submitted = true;
    } catch (err) {
      error = 'Something went wrong. Please try again.';
      console.error('Waitlist error:', err);
    } finally {
      loading = false;
    }
  }
</script>

<section class="py-24 lg:py-32 border-t border-border/50 relative overflow-hidden" id="waitlist">
  <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/10 rounded-full blur-[80px]"></div>
    <svg class="absolute inset-0 w-full h-full" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="cta-grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,184,0,0.05)" stroke-width="1" />
        </pattern>
        <linearGradient id="cta-fade" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="white" stop-opacity="0" />
          <stop offset="50%" stop-color="white" stop-opacity="1" />
          <stop offset="100%" stop-color="white" stop-opacity="0" />
        </linearGradient>
        <mask id="cta-mask">
          <rect width="100%" height="100%" fill="url(#cta-fade)" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#cta-grid-pattern)" mask="url(#cta-mask)" />
    </svg>
  </div>

  <div class="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
    <div class="max-w-xl mx-auto text-center">
      <h2 class="text-display text-3xl sm:text-4xl lg:text-5xl mb-6">
        Stop guessing.<br />
        <span class="reachkit-gradient">Start shipping.</span>
      </h2>

      <p class="text-lg text-muted-foreground mb-10">
        Join the waitlist and be among the <strong class="text-foreground">first to experience</strong> streamlined app submissions with fewer rejections.
      </p>

      {#if submitted}
        <div class="flex flex-col items-center gap-4 p-8 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
          <div class="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <p class="text-emerald-400 font-medium">You're on the list. We'll be in touch soon.</p>
        </div>
      {:else if error}
        <div class="flex flex-col items-center gap-4 p-8 rounded-2xl bg-rose-500/10 border border-rose-500/30 mb-6">
          <p class="text-rose-400 font-medium">{error}</p>
          <button
            class="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-card transition-colors"
            on:click={() => (error = '')}
          >
            Try again
          </button>
        </div>
      {:else}
        <form class="mb-8" on:submit={handleSubmit}>
          <div class="flex flex-col sm:flex-row gap-2 p-2 rounded-2xl bg-card border border-border/50 focus-within:border-primary transition-colors">
            <input
              type="email"
              bind:value={email}
              placeholder="Enter your email"
              required
              disabled={loading}
              class="flex-1 px-4 py-3 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              class="px-6 py-3 rounded-xl bg-amber-500 text-black font-medium transition-all hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/25 disabled:opacity-50"
              disabled={loading}
            >
              {#if loading}
                <span class="inline-block w-5 h-5 border-2 border-transparent border-t-current rounded-full animate-spin"></span>
              {:else}
                Get early access
              {/if}
            </button>
          </div>
          <p class="text-sm text-muted-foreground mt-3">No spam. Unsubscribe anytime.</p>
        </form>
      {/if}
    </div>
  </div>
</section>
