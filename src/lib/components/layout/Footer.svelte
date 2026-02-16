<script>
  import { assets } from "$app/paths";
</script>

<footer class="relative border-t border-border/50">
  <!-- Gradient top border effect -->
  <div
    class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent"
  ></div>

  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
      <!-- Brand -->
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
          <li>
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
          </li>
        </ul>
      </div>

      <!-- Studio -->
      <div>
        <h3 class="font-semibold text-base text-foreground mb-4">Studio</h3>
        <ul class="space-y-3">
          <li>
            <a
              href="/studio#quickstart"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Quickstart
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
              href="/studio/reachkit"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
            >
              ReachKit
              <span
                class="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium"
                >Soon</span
              >
            </a>
          </li>
          <li>
            <a
              href="https://skillpub.net/"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
              target="_blank"
              rel="noopener noreferrer"
            >
              SkillPub
              <span
                class="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium"
                >Soon</span
              >
            </a>
          </li>
        </ul>
      </div>

      <!-- Contact -->
      <div>
        <h3 class="font-semibold text-base text-foreground mb-4">Contact</h3>
        <ul class="space-y-3">
          <li>
            <a
              href="https://github.com/zapstore/zapstore"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </li>
          <li>
            <a
              href="https://signal.group/#CjQKIK20nMOglqNT8KYw4ZeyChsvA14TTcjtjuC2VF6j6nB5EhDLZ7pQHvOeopr36jq431ow"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              User Support on Signal
            </a>
          </li>
          <li>
            <a
              href="https://signal.group/#CjQKIC0VCHf6gGeeHKcIrKcaI-B5Kjvge2NKw2i4P55tMkCwEhBaOk9B80F3_MhMYVbgj7lL"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Dev Support on Signal
            </a>
          </li>
          <li>
            <a
              href="https://npub.world/npub10r8xl2njyepcw2zwv3a6dyufj4e4ajx86hz6v4ehu4gnpupxxp7stjt2p8"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Follow us on Nostr
            </a>
          </li>
          <li>
            <a
              href="https://x.com/zapstore_"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Follow us on Twitter
            </a>
          </li>
        </ul>
      </div>
    </div>
  </div>
</footer>
