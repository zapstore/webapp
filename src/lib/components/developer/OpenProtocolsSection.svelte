<script>
  import { assets } from '$app/paths';
  import { ChevronRight } from '$lib/components/icons';

  const protocols = [
    {
      id: 'nostr',
      title: 'Nostr',
      subtitle: 'Identity without accounts',
      image: `${assets}/images/nostr.svg`,
      href: 'https://github.com/nostr-protocol/nostr',
    },
    {
      id: 'blossom',
      title: 'Blossom',
      subtitle: 'Verification without reviewers',
      image: `${assets}/images/blossom.svg`,
      href: 'https://github.com/hzrd149/blossom',
    },
    {
      id: 'bitcoin',
      title: 'Bitcoin',
      subtitle: 'Payment without banks',
      image: `${assets}/images/bitcoin.svg`,
      href: 'https://github.com/bitcoin/bitcoin',
    },
  ];
</script>

<section class="open-protocols-section">
  <div class="open-protocols-container">
    <!-- Left: header + description, no panel -->
    <div class="open-protocols-col-left">
      <h2 class="open-protocols-title section-title text-display-lg">
        <span
          class="open-protocols-line open-protocols-line-1"
          style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;"
          >Open.</span
        >
        <br class="open-protocols-br" />
        <span
          class="open-protocols-line open-protocols-line-2"
          style="background: var(--gradient-blurple-light); -webkit-background-clip: text; background-clip: text; color: transparent;"
          >For Real.</span
        >
      </h2>
      <p class="section-description open-protocols-desc">
        On Zapstore anyone with a cryptographic keypair can discover, install, or publish apps. Built on open protocols that work the same for everyone: no accounts, no gatekeepers, no one in the middle.
      </p>
    </div>

    <!-- Right: panel with three rows, full-width dividers -->
    <div class="open-protocols-panel">
      {#each protocols as protocol, i}
        <a
          href={protocol.href}
          target="_blank"
          rel="noopener noreferrer"
          class="open-protocols-row open-protocols-row-link"
        >
          <img
            src={protocol.image}
            alt=""
            class="open-protocols-icon"
            width="80"
            height="80"
            loading="lazy"
          />
          <div class="open-protocols-text">
            <h3 class="open-protocols-row-title">{protocol.title}</h3>
            <p class="open-protocols-row-subtitle">{protocol.subtitle}</p>
          </div>
          <span class="open-protocols-row-chevron">
            <ChevronRight size={16} color="hsl(var(--white33))" />
          </span>
        </a>
      {/each}
    </div>
  </div>
</section>

<style>
  .open-protocols-section {
    padding: 3rem 1rem 3rem;
    border-bottom: 1.4px solid hsl(var(--white11));
  }

  .open-protocols-col-left {
    padding-left: 1.25rem;
    padding-right: 1.25rem;
  }

  @media (min-width: 768px) {
    .open-protocols-section {
      padding: 5rem 1.5rem 5rem;
    }
    .open-protocols-col-left {
      padding-left: 0;
      padding-right: 0;
    }
  }

  .open-protocols-container {
    max-width: 1000px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr;
    gap: 2rem;
    align-items: start;
  }

  @media (min-width: 768px) {
    .open-protocols-container {
      grid-template-columns: 1fr 1fr;
      gap: 3rem;
      align-items: center;
    }
  }

  .open-protocols-br {
    display: none;
  }

  @media (min-width: 768px) {
    .open-protocols-br {
      display: block;
    }
  }

  .open-protocols-title {
    margin: 0 0 1rem;
    font-size: 2rem;
    line-height: 1.1;
    letter-spacing: -0.025em;
  }

  @media (min-width: 640px) {
    .open-protocols-title {
      font-size: 2.5rem;
    }
  }

  @media (min-width: 768px) {
    .open-protocols-title {
      font-size: 3rem;
    }
  }

  @media (min-width: 1024px) {
    .open-protocols-title {
      font-size: 3.5rem;
    }
  }

  @media (min-width: 1280px) {
    .open-protocols-title {
      font-size: 4rem;
    }
  }

  .open-protocols-desc {
    margin: 0;
    max-width: 28em;
  }

  .open-protocols-panel {
    background-color: hsl(var(--gray33));
    border-radius: var(--radius-32);
    overflow: hidden;
  }

  @media (max-width: 639px) {
    .open-protocols-panel {
      transform: scale(0.92);
      transform-origin: top center;
    }
  }

  .open-protocols-row {
    display: flex;
    gap: 1.5rem;
    align-items: center;
    padding: 1.5rem 1.5rem;
    border-bottom: 1.4px solid hsl(var(--white11));
  }

  .open-protocols-row-link {
    text-decoration: none;
    color: inherit;
    cursor: pointer;
  }

  .open-protocols-row:last-child {
    border-bottom: none;
  }

  .open-protocols-icon {
    width: 80px;
    height: 80px;
    border-radius: 16px;
    flex-shrink: 0;
    object-fit: contain;
  }

  .open-protocols-text {
    min-width: 0;
    flex: 1;
  }

  .open-protocols-row-chevron {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .open-protocols-row-title {
    margin: 0 0 0.25rem;
    font-size: 1.375rem;
    font-weight: 600;
    color: hsl(var(--white));
  }

  .open-protocols-row-subtitle {
    margin: 0;
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.4;
    color: hsl(var(--white66));
  }
</style>
