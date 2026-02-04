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

      <!-- Product -->
      <div>
        <h3 class="font-semibold text-base text-foreground mb-4">Product</h3>
        <ul class="space-y-3">
          <li>
            <a
              href="/studio"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Studio
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
              href="/discover"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Discover
            </a>
          </li>
          <li>
            <a
              href="/blog"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Blog
            </a>
          </li>
        </ul>
      </div>

      <!-- Resources -->
      <div>
        <h3 class="font-semibold text-base text-foreground mb-4">Resources</h3>
        <ul class="space-y-3">
          <li>
            <a
              href="/docs"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Documentation
            </a>
          </li>
          <li>
            <a
              href="/docs/quickstart"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Getting Started
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
          <li>
            <a
              href="https://nostr.com"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Nostr Protocol
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
              href="https://github.com/zapstore/zapstore"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                height="14"
                fill="currentColor"
                viewBox="3 3 18 18"
                class="shrink-0"
              >
                <path
                  d="M12 3C7.0275 3 3 7.12937 3 12.2276C3 16.3109 5.57625 19.7597 9.15374 20.9824C9.60374 21.0631 9.77249 20.7863 9.77249 20.5441C9.77249 20.3249 9.76125 19.5982 9.76125 18.8254C7.5 19.2522 6.915 18.2602 6.735 17.7412C6.63375 17.4759 6.19499 16.6569 5.8125 16.4378C5.4975 16.2647 5.0475 15.838 5.80124 15.8264C6.51 15.8149 7.01625 16.4954 7.18499 16.7723C7.99499 18.1679 9.28875 17.7758 9.80625 17.5335C9.885 16.9337 10.1212 16.53 10.38 16.2993C8.3775 16.0687 6.285 15.2728 6.285 11.7432C6.285 10.7397 6.63375 9.9092 7.20749 9.26326C7.1175 9.03257 6.8025 8.08674 7.2975 6.81794C7.2975 6.81794 8.05125 6.57571 9.77249 7.76377C10.4925 7.55615 11.2575 7.45234 12.0225 7.45234C12.7875 7.45234 13.5525 7.55615 14.2725 7.76377C15.9937 6.56418 16.7475 6.81794 16.7475 6.81794C17.2424 8.08674 16.9275 9.03257 16.8375 9.26326C17.4113 9.9092 17.76 10.7281 17.76 11.7432C17.76 15.2843 15.6563 16.0687 13.6537 16.2993C13.98 16.5877 14.2613 17.1414 14.2613 18.0065C14.2613 19.2407 14.25 20.2326 14.25 20.5441C14.25 20.7863 14.4188 21.0746 14.8688 20.9824C16.6554 20.364 18.2079 19.1866 19.3078 17.6162C20.4077 16.0457 20.9995 14.1611 21 12.2276C21 7.12937 16.9725 3 12 3Z"
                ></path>
              </svg>
              GitHub
            </a>
          </li>
          <li>
            <a
              href="https://signal.group/#CjQKIK20nMOglqNT8KYw4ZeyChsvA14TTcjtjuC2VF6j6nB5EhDLZ7pQHvOeopr36jq431ow"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                height="14"
                width="14"
                viewBox="0 0 160 160"
                fill="currentColor"
                class="shrink-0"
              >
                <g>
                  <path
                    d="m80 0c4.1505 0 8.2271.31607 12.2072.925452l-1.1444 7.413248c-3.6069-.55226-7.3014-.8387-11.0628-.8387-3.7612 0-7.4555.28641-11.0623.83862l-1.1444-7.413245c3.9799-.609332 8.0564-.925375 12.2067-.925375z"
                  />
                  <path
                    d="m98.9849 2.26619-1.7798 7.28755c7.3099 1.77896 14.1849 4.66606 20.4389 8.47306l3.895-6.411c-6.901-4.20091-14.488-7.38658-22.5541-9.34961z"
                  />
                  <path
                    d="m127.279 15.4591-4.432 6.0507c5.977 4.3861 11.257 9.6664 15.643 15.6437l6.051-4.4324c-4.84-6.5957-10.666-12.4222-17.262-17.262z"
                  />
                  <path
                    d="m148.384 38.4618-6.411 3.8942c3.807 6.2541 6.694 13.1299 8.473 20.4395l7.288-1.7798c-1.963-8.0657-5.149-15.6528-9.35-22.5539z"
                  />
                  <path
                    d="m159.075 67.7934-7.414 1.1444c.553 3.6067.839 7.301.839 11.0622 0 3.7614-.286 7.4559-.839 11.0628l7.414 1.1444c.609-3.9801.925-8.0567.925-12.2072 0-4.1503-.316-8.2267-.925-12.2066z"
                  />
                  <path
                    d="m141.973 117.645c3.807-6.255 6.694-13.13 8.473-20.44l7.288 1.7798c-1.963 8.0662-5.149 15.6532-9.35 22.5542z"
                  />
                  <path
                    d="m138.49 122.847 6.051 4.432c-4.84 6.596-10.666 12.422-17.262 17.262l-4.433-6.051c5.978-4.386 11.258-9.666 15.644-15.643z"
                  />
                  <path
                    d="m117.644 141.973 3.894 6.411c-6.901 4.201-14.488 7.387-22.5537 9.35l-1.7798-7.288c7.3095-1.779 14.1855-4.666 20.4395-8.473z"
                  />
                  <path
                    d="m91.0622 151.661 1.1445 7.414c-3.9799.609-8.0564.925-12.2067.925-4.1505 0-8.2272-.316-12.2073-.925l1.1442-7.413c3.6054.552 7.2997.838 11.0631.838 3.7612 0 7.4555-.286 11.0622-.839z"
                  />
                  <path
                    d="m62.7945 150.448-1.7794 7.286c-6.0589-1.475-11.8477-3.639-17.2785-6.406l-7.5927 1.772-1.7042-7.304 10.2604-2.394 2.4408 1.243c4.9187 2.506 10.1623 4.467 15.6536 5.803z"
                  />
                  <path
                    d="m28.1097 147.273 1.7042 7.304-13.0145 3.036c-8.66079 2.021-16.433718-5.752-14.41286-14.412l3.03673-13.015 7.30383 1.704-3.03675 13.015c-.75782 3.248 2.15705 6.162 5.40485 5.405z"
                  />
                  <path
                    d="m14.2041 125.56-7.30383-1.704 1.77163-7.593c-2.76664-5.431-4.93123-11.22-6.40585-17.2787l7.28586-1.7794c1.33599 5.4911 3.29709 10.7351 5.80279 15.6541l1.2435 2.441z"
                  />
                  <path
                    d="m8.33759 91.0624-7.412228 1.1442c-.609324-3.9799-.925362-8.0563-.925362-12.2066 0-4.1505.316067-8.2271.925446-12.2072l7.413244 1.1444c-.55225 3.607-.83869 7.3014-.83869 11.0628 0 3.7631.28613 7.4572.83759 11.0624z"
                  />
                  <path
                    d="m9.55373 62.795-7.28755-1.7798c1.96302-8.0657 5.1487-15.6528 9.34962-22.5539l6.411 3.8942c-3.807 6.2541-6.6941 13.1299-8.47307 20.4395z"
                  />
                  <path
                    d="m21.5098 37.1531-6.0507-4.4324c4.8398-6.5957 10.6663-12.4221 17.262-17.2619l4.4324 6.0507c-5.9773 4.3861-11.2576 9.6663-15.6437 15.6436z"
                  />
                  <path
                    d="m42.356 18.0266-3.8943-6.4111c6.9011-4.20082 14.4882-7.38645 22.554-9.34944l1.7798 7.28755c-7.3096 1.77899-14.1854 4.66589-20.4395 8.47299z"
                  />
                  <path
                    d="m145 80c0 35.899-29.101 65-65 65-11.3866 0-22.0893-2.928-31.3965-8.072-.8961-.495-1.9417-.658-2.9389-.426l-28.9134 6.747 6.7465-28.914c.2326-.997.0692-2.043-.426-2.939-5.1439-9.307-8.0717-20.0095-8.0717-31.396 0-35.8985 29.1015-65 65-65 35.899 0 65 29.1015 65 65z"
                  />
                </g>
              </svg>
              Tech Support on Signal
            </a>
          </li>
          <li>
            <a
              href="https://npub.world/npub10r8xl2njyepcw2zwv3a6dyufj4e4ajx86hz6v4ehu4gnpupxxp7stjt2p8"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                height="14"
                width="14"
                viewBox="0 0 512 512"
                fill="currentColor"
                class="shrink-0"
              >
                <path
                  d="M278.5 215.6 23 471c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l57-57h68c49.7 0 97.9-14.4 139-41 11.1-7.2 5.5-23-7.8-23-5.1 0-9.2-4.1-9.2-9.2 0-4.1 2.7-7.6 6.5-8.8l81-24.3c2.5-.8 4.8-2.1 6.7-4l22.4-22.4c10.1-10.1 2.9-27.3-11.3-27.3H377c-5.1 0-9.2-4.1-9.2-9.2 0-4.1 2.7-7.6 6.5-8.8l112-33.6c4-1.2 7.4-3.9 9.3-7.7 10.8-21 16.4-44.5 16.4-68.6 0-41-16.3-80.3-45.3-109.3l-5.5-5.5C432.3 16.3 393 0 352 0s-80.3 16.3-109.3 45.3L139 149c-48 48-75 113.1-75 181v55.3l189.6-189.5c6.2-6.2 16.4-6.2 22.6 0 5.4 5.4 6.1 13.6 2.2 19.8z"
                />
              </svg>
              Follow us on Nostr
            </a>
          </li>
          <li>
            <a
              href="https://x.com/zapstore_"
              class="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                height="14"
                width="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                class="shrink-0"
              >
                <path
                  d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.933ZM17.61 20.644h2.039L6.486 3.24H4.298L17.61 20.644Z"
                />
              </svg>
              Follow us on Twitter
            </a>
          </li>
        </ul>
      </div>
    </div>
  </div>
</footer>
