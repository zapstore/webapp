<script></script>

<section class="gateway-section border-b border-border/50">
  <div class="gateway-container">
    <!-- Left: ReachKit (gold theme) -->
    <div class="gateway-panel gateway-panel-gold">
      <div class="gateway-header-row">
        <h2 class="gateway-panel-title">ReachKit</h2>
        <div class="gateway-pill gateway-pill-gold">
          <span class="gateway-pill-dot gateway-pill-dot-gold"></span>
          Coming Soon
        </div>
      </div>
      <h3
        class="gateway-question"
        style="background: var(--gradient-gold); -webkit-background-clip: text; background-clip: text; color: transparent;"
      >
        Need to distribute everywhere?
      </h3>
      <p class="gateway-desc gateway-desc-large">
        ReachKit uses AI to predict app store rejections before you submit. Validate once, ship to every major mobile store — App Store, Google Play, F-Droid, Zapstore, and more.
      </p>
      <a href="/studio/reachkit" class="btn-secondary gateway-cta">Learn More</a>
    </div>

    <!-- Right: SkillPub (green theme) -->
    <div class="gateway-panel gateway-panel-green">
      <div class="gateway-header-row">
        <h2 class="gateway-panel-title">SkillPub</h2>
        <div class="gateway-pill gateway-pill-green">
          <span class="gateway-pill-dot gateway-pill-dot-green"></span>
          Coming Soon
        </div>
      </div>
      <h3
        class="gateway-question"
        style="background: var(--gradient-green); -webkit-background-clip: text; background-clip: text; color: transparent;"
      >
        Need an open marketplace for agents?
      </h3>
      <p class="gateway-desc gateway-desc-large">
        An open marketplace for AI agent skills. Discover, purchase, install, or publish skills — built on open protocols. No accounts, no gatekeepers. Powered by Zapstore.
      </p>
      <a
        href="https://skillpub.net/"
        target="_blank"
        rel="noopener noreferrer"
        class="btn-secondary gateway-cta"
      >
        Learn More
      </a>
    </div>
  </div>
</section>

<style>
  .gateway-section {
    padding: 3rem 1rem;
  }

  @media (min-width: 768px) {
    .gateway-section {
      padding: 4rem 1.5rem;
    }
  }

  .gateway-container {
    max-width: 1000px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }

  @media (min-width: 768px) {
    .gateway-container {
      grid-template-columns: 1fr 1fr;
      gap: 2.75rem;
    }
  }

  .gateway-panel {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    padding: 2rem 1.5rem;
    background-color: hsl(var(--gray33));
    border-radius: var(--radius-32);
  }

  @media (min-width: 768px) {
    .gateway-panel {
      padding: 2.25rem 2rem;
    }
  }

  .gateway-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
    width: 100%;
  }

  .gateway-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
    flex-shrink: 0;
  }

  .gateway-pill-gold {
    background: hsl(var(--goldColor) / 0.12);
    color: hsl(var(--goldColor) / 0.9);
  }

  .gateway-pill-green {
    background: rgb(25 221 117 / 0.12);
    color: rgb(25 221 117 / 0.95);
  }

  .gateway-pill-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .gateway-pill-dot-gold {
    background: hsl(var(--goldColor));
    animation: gateway-pulse 1.5s ease-in-out infinite;
  }

  .gateway-pill-dot-green {
    background: rgb(25 221 117);
    animation: gateway-pulse 1.5s ease-in-out infinite;
  }

  @keyframes gateway-pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .gateway-panel-title {
    font-size: 1.375rem;
    font-weight: 600;
    line-height: 1.2;
    margin: 0;
    color: hsl(var(--foreground));
  }

  .gateway-question {
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1.25;
    margin: 0 0 0.75rem 0;
    width: 100%;
  }

  @media (min-width: 640px) {
    .gateway-question {
      font-size: 1.75rem;
    }
  }

  @media (min-width: 768px) {
    .gateway-question {
      font-size: 2rem;
      margin-bottom: 1rem;
    }
  }

  .gateway-desc {
    color: hsl(var(--white66));
    line-height: 1.5;
    margin: 0 0 1.5rem 0;
  }

  .gateway-desc-large {
    font-size: 1rem;
  }

  @media (min-width: 640px) {
    .gateway-desc-large {
      font-size: 1.0625rem;
      line-height: 1.55;
    }
  }

  .gateway-cta {
    margin-top: auto;
    text-decoration: none;
  }
</style>
