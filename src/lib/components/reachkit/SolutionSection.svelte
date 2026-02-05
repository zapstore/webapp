<script>
  const features = [
    { title: 'Predict before you submit', description: 'Our AI analyzes your app against the same criteria reviewers use. Catch likely issues before you hit submit.', icon: 'predict' },
    { title: 'Get concrete code fixes', description: 'Not vague guideline references — actual code snippets and specific changes you can apply immediately.', icon: 'fix' },
    { title: 'Ship to all stores at once', description: 'Validate against every major iOS and Android store simultaneously. Handle conflicting requirements automatically.', icon: 'ship' },
  ];
</script>

<section class="py-24 lg:py-32 border-t border-border/50" id="features">
  <div class="container mx-auto px-4 sm:px-6 lg:px-8">
    <div class="max-w-2xl mx-auto text-center mb-16">
      <span class="inline-block text-xs font-semibold tracking-widest uppercase reachkit-gradient mb-4">The solution</span>
      <h2 class="text-display text-3xl sm:text-4xl lg:text-5xl mb-6">Predict. Fix. Ship.</h2>
      <p class="text-lg text-muted-foreground">
        ReachKit uses <strong class="text-foreground">AI trained on feedback from real app submissions</strong> to predict what reviewers will flag — and gives you <strong class="text-foreground">concrete code fixes</strong>. Fewer rejections, faster approvals.
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-20">
      {#each features as feature, i}
        <div class="relative rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-8 card-glow overflow-hidden transition-all hover:-translate-y-1 group">
          <div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>

          <div class="w-12 h-12 text-primary mb-6">
            {#if feature.icon === 'predict'}
              <svg viewBox="0 0 48 48" fill="none" class="w-full h-full">
                <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2" opacity="0.3" />
                <path d="M24 4v8M24 36v8M4 24h8M36 24h8" stroke="currentColor" stroke-width="2" />
                <circle cx="24" cy="24" r="8" fill="currentColor" />
              </svg>
            {:else if feature.icon === 'fix'}
              <svg viewBox="0 0 48 48" fill="none" class="w-full h-full">
                <path d="M8 24l10 10L40 14" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            {:else if feature.icon === 'ship'}
              <svg viewBox="0 0 48 48" fill="none" class="w-full h-full">
                <path d="M24 4L40 20H32V36H16V20H8L24 4Z" fill="currentColor" opacity="0.3" />
                <path d="M24 4L40 20H32V36H16V20H8L24 4Z" stroke="currentColor" stroke-width="2" />
                <path d="M16 44h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            {/if}
          </div>

          <h3 class="text-xl font-semibold text-foreground mb-3">{feature.title}</h3>
          <p class="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>

          <div class="absolute top-6 right-6 text-4xl font-display font-bold text-border/50">
            {String(i + 1).padStart(2, '0')}
          </div>
        </div>
      {/each}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-6 max-w-4xl mx-auto items-start">
      <div class="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-8">
        <div class="mb-6">
          <span class="inline-flex px-3 py-1 rounded-full text-sm font-medium bg-rose-500/15 text-rose-400">Without ReachKit</span>
        </div>
        <div class="space-y-4 mb-6">
          <div class="flex items-start gap-3">
            <span class="w-2.5 h-2.5 rounded-full bg-muted-foreground mt-1.5"></span>
            <div><span class="text-xs text-muted-foreground">Day 1</span><p class="text-sm text-muted-foreground">Submit to App Store</p></div>
          </div>
          <div class="flex items-start gap-3">
            <span class="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1.5"></span>
            <div><span class="text-xs text-muted-foreground">Day 4</span><p class="text-sm text-muted-foreground">Still waiting...</p></div>
          </div>
          <div class="flex items-start gap-3">
            <span class="w-2.5 h-2.5 rounded-full bg-rose-500 mt-1.5"></span>
            <div><span class="text-xs text-muted-foreground">Day 7</span><p class="text-sm text-muted-foreground">Rejected: screenshot issue</p></div>
          </div>
          <div class="flex items-start gap-3">
            <span class="w-2.5 h-2.5 rounded-full bg-muted-foreground mt-1.5"></span>
            <div><span class="text-xs text-muted-foreground">Day 8</span><p class="text-sm text-muted-foreground">Fix and resubmit</p></div>
          </div>
          <div class="flex items-start gap-3">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1.5"></span>
            <div><span class="text-xs text-muted-foreground">Day 14</span><p class="text-sm text-muted-foreground">Finally approved</p></div>
          </div>
        </div>
        <div class="pt-4 border-t border-border/50 flex items-baseline gap-2">
          <span class="text-sm text-muted-foreground">Total time:</span>
          <span class="text-2xl font-display font-semibold text-rose-400">14 days</span>
        </div>
      </div>

      <div class="flex lg:flex-col items-center justify-center py-4 lg:py-0 lg:pt-20">
        <span class="text-xs font-semibold tracking-widest uppercase text-muted-foreground">vs</span>
      </div>

      <div class="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-8">
        <div class="mb-6">
          <span class="inline-flex px-3 py-1 rounded-full text-sm font-medium bg-emerald-500/15 text-emerald-400">With ReachKit</span>
        </div>
        <div class="space-y-4 mb-6">
          <div class="flex items-start gap-3">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1.5"></span>
            <div><span class="text-xs text-muted-foreground">10:00 AM</span><p class="text-sm text-muted-foreground">Run reach validate</p></div>
          </div>
          <div class="flex items-start gap-3">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1.5"></span>
            <div><span class="text-xs text-muted-foreground">10:02 AM</span><p class="text-sm text-muted-foreground">Fix screenshot issue</p></div>
          </div>
          <div class="flex items-start gap-3">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1.5"></span>
            <div><span class="text-xs text-muted-foreground">10:05 AM</span><p class="text-sm text-muted-foreground">Validation passes</p></div>
          </div>
          <div class="flex items-start gap-3">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1.5"></span>
            <div><span class="text-xs text-muted-foreground">10:10 AM</span><p class="text-sm text-muted-foreground">Submit with confidence</p></div>
          </div>
          <div class="flex items-start gap-3">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1.5"></span>
            <div><span class="text-xs text-muted-foreground">Day 3</span><p class="text-sm text-muted-foreground">Approved first try</p></div>
          </div>
        </div>
        <div class="pt-4 border-t border-border/50 flex items-baseline gap-2">
          <span class="text-sm text-muted-foreground">Total time:</span>
          <span class="text-2xl font-display font-semibold text-emerald-400">3 days</span>
        </div>
      </div>
    </div>
  </div>
</section>
