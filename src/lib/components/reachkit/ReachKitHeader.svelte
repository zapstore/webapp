<script>
  import { Menu, X, ArrowLeft } from 'lucide-svelte';
  import { cn } from '$lib/utils';
  import { onMount } from 'svelte';

  let mobileMenuOpen = false;
  let scrolled = false;

  onMount(() => {
    const handleScroll = () => {
      scrolled = window.scrollY > 10;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  });

  const navigation = [
    { name: 'Features', href: '#features' },
    { name: 'Platforms', href: '#platforms' },
  ];
</script>

<header
  class={cn(
    'sticky top-0 z-50 w-full transition-all duration-300',
    scrolled
      ? 'bg-background/80 backdrop-blur-xl border-b border-border/50'
      : 'bg-transparent border-b border-transparent'
  )}
>
  <nav class="container mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex h-20 items-center justify-between">
      <div class="flex items-center">
        <div class="flex flex-col">
          <a
            href="/studio"
            class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft class="h-3 w-3" />
            Back to Studio
          </a>

          <a href="/studio/reachkit" class="flex items-center gap-2.5 group">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" class="transition-transform duration-300 group-hover:scale-105">
              <defs>
                <linearGradient id="header-reachkit-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style="stop-color:#FFB800" />
                  <stop offset="100%" style="stop-color:#FF6B35" />
                </linearGradient>
              </defs>
              <path d="M4 16L12 8L20 16L12 24L4 16Z" fill="url(#header-reachkit-gradient)" />
              <path d="M12 16L20 8L28 16L20 24L12 16Z" fill="url(#header-reachkit-gradient)" opacity="0.6" />
            </svg>
            <div class="flex flex-col">
              <span class="font-semibold text-lg tracking-tight leading-tight">ReachKit</span>
              <span class="text-[10px] text-muted-foreground -mt-0.5">by Zapstore</span>
            </div>
          </a>
        </div>
      </div>

      <div class="hidden md:flex md:items-center md:gap-1">
        {#each navigation as item}
          <a
            href={item.href}
            class="relative px-3 py-2 text-sm font-medium transition-colors text-muted-foreground hover:text-foreground"
          >
            {item.name}
          </a>
        {/each}

        <div class="ml-4 pl-4 border-l border-border/50">
          <a
            href="#waitlist"
            class="group inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black transition-all hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/25"
          >
            Get Early Access
          </a>
        </div>
      </div>

      <div class="flex md:hidden">
        <button
          type="button"
          class="inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
          on:click={() => (mobileMenuOpen = !mobileMenuOpen)}
        >
          <span class="sr-only">Open main menu</span>
          {#if mobileMenuOpen}
            <X class="h-5 w-5" />
          {:else}
            <Menu class="h-5 w-5" />
          {/if}
        </button>
      </div>
    </div>
  </nav>

  {#if mobileMenuOpen}
    <div class="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl">
      <div class="space-y-1 px-4 py-4">
        {#each navigation as item}
          <a
            href={item.href}
            class="block rounded-lg px-4 py-2.5 text-base font-medium transition-colors text-muted-foreground hover:bg-white/5 hover:text-foreground"
            on:click={() => (mobileMenuOpen = false)}
          >
            {item.name}
          </a>
        {/each}
        <a
          href="#waitlist"
          class="block rounded-lg px-4 py-2.5 text-base font-medium bg-amber-500 text-black text-center mt-4"
          on:click={() => (mobileMenuOpen = false)}
        >
          Get Early Access
        </a>
      </div>
    </div>
  {/if}
</header>
