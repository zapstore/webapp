<script>
  import { assets } from "$app/paths";
  import Nostr from "$lib/components/icons/Nostr.svelte";
</script>

<footer class="relative border-t border-border/50">
  <!-- Gradient top border effect -->
  <div
    class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent"
  ></div>

  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
      <!-- Brand + contact icons -->
      <div class="col-span-2 md:col-span-1">
        <a href="/" class="flex items-center gap-2.5 mb-4">
          <img
            src={`${assets}/images/logo-dark.svg`}
            alt="Zapstore"
            class="h-6 w-auto"
          />
          <span class="font-semibold text-lg tracking-tight">Zapstore</span>
        </a>
        <p class="text-sm text-muted-foreground leading-relaxed max-w-xs">
          The open app store powered by your social network.
        </p>
        <div class="flex items-center gap-4 mt-4" aria-label="Contact links">
          <a
            href="https://npub.world/npub10r8xl2njyepcw2zwv3a6dyufj4e4ajx86hz6v4ehu4gnpupxxp7stjt2p8"
            class="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center justify-center h-5 w-5"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Nostr"
          >
            <Nostr variant="fill" size={18} color="hsl(var(--white66))" class="block" />
          </a>
          <a
            href="https://github.com/zapstore/zapstore"
            class="text-muted-foreground hover:text-foreground transition-colors"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
          >
            <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.63-1.41-3.63-1.41-.546-1.39-1.335-1.755-1.335-1.755-1.086-.745.085-.73.085-.73 1.2.085 1.83 1.235 1.83 1.235 1.07 1.83 2.805 1.305 3.495.99.105-.77.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.92 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
          <a
            href="https://x.com/zapstore_"
            class="text-muted-foreground hover:text-foreground transition-colors"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Twitter"
          >
            <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        </div>
        <p class="text-sm text-muted-foreground pt-4">
          © {new Date().getFullYear()} Zapstore
        </p>
      </div>

      <!-- Discover -->
      <div>
        <h3 class="font-semibold text-base text-foreground mb-4">Discover</h3>
        <ul class="space-y-3">
          <li>
            <a
              href="/apps"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Apps
            </a>
          </li>
          <li>
            <a
              href="/stacks"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Stacks
            </a>
          </li>
          <!-- <li>
            <span
              class="text-sm text-muted-foreground inline-flex items-center gap-1.5"
            >
              Catalogs
              <span
                class="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium"
                >Soon</span
              >
            </span>
          </li>
          <li>
            <span
              class="text-sm text-muted-foreground inline-flex items-center gap-1.5"
            >
              Labels
              <span
                class="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium"
                >Soon</span
              >
            </span>
          </li> -->
        </ul>
      </div>

      <!-- Studio -->
      <div>
        <h3 class="font-semibold text-base text-foreground mb-4">Studio</h3>
        <ul class="space-y-3">
          <li>
            <a
              href="/docs/publish"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Publish Apps
            </a>
          </li>
          <li>
            <a
              href="/docs/publish"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Docs
            </a>
          </li>
          <li>
            <a
              href="/docs/faq"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              FAQ
            </a>
          </li>
        </ul>
      </div>

      <!-- Community -->
      <div>
        <h3 class="font-semibold text-base text-foreground mb-4">Community</h3>
        <ul class="space-y-3">
          <li>
            <a
              href="/blog"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Blog
            </a>
          </li>
          <li>
            <a
              href="https://signal.group/#CjQKIK20nMOglqNT8KYw4ZeyChsvA14TTcjtjuC2VF6j6nB5EhDLZ7pQHvOeopr36jq431ow"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              User support on Signal
            </a>
          </li>
          <li>
            <a
              href="https://signal.group/#CjQKIC0VCHf6gGeeHKcIrKcaI-B5Kjvge2NKw2i4P55tMkCwEhBaOk9B80F3_MhMYVbgj7lL"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Dev support on Signal
            </a>
          </li>
        </ul>
      </div>
    </div>
  </div>
</footer>
