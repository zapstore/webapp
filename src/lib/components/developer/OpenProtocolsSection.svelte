<script>
  import { assets } from '$app/paths';

  const protocols = [
    {
      id: 'nostr',
      title: 'Nostr',
      subtitle: 'Identity without accounts',
      image: `${assets}/images/nostr.svg`,
    },
    {
      id: 'blossom',
      title: 'Blossom',
      subtitle: 'Verification without reviewers',
      image: `${assets}/images/blossom.svg`,
    },
    {
      id: 'bitcoin',
      title: 'Bitcoin',
      subtitle: 'Payment without banks',
      image: `${assets}/images/bitcoin.svg`,
    },
  ];
</script>

<section class="open-protocols-section">
  <div class="open-protocols-container">
    <!-- Left: header + description, no panel -->
    <div class="open-protocols-col-left">
      <h2 class="open-protocols-title section-title text-display-lg section-title-gradient">
        Open protocols
      </h2>
      <p class="section-description open-protocols-desc">
        Zapstore is built on open protocols. Identity, distribution, and payments stay in your control and work the same for everyone.
      </p>
    </div>

    <!-- Right: panel with three rows, full-width dividers -->
    <div class="open-protocols-panel">
      {#each protocols as protocol, i}
        <div class="open-protocols-row">
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
        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  .open-protocols-section {
    padding: 3rem 1rem 3rem;
    border-top: 1.4px solid hsl(var(--white11));
    border-bottom: 1.4px solid hsl(var(--white11));
  }

  @media (min-width: 768px) {
    .open-protocols-section {
      padding: 4rem 1.5rem 4rem;
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

  .open-protocols-desc {
    margin: 0;
    max-width: 28em;
  }

  .open-protocols-panel {
    background-color: hsl(var(--gray33));
    border-radius: var(--radius-32);
    overflow: hidden;
  }

  .open-protocols-row {
    display: flex;
    gap: 1.5rem;
    align-items: center;
    padding: 1.5rem 1.5rem;
    border-bottom: 1.4px solid hsl(var(--white11));
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
