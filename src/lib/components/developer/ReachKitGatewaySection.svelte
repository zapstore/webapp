<script>
  import { ChevronRight } from '$lib/components/icons';
  import { assets } from '$app/paths';
</script>

<section class="reachkit-gateway border-t border-border/50">
  <div class="reachkit-gateway-container">
    <div class="reachkit-gateway-inner">
      <div class="reachkit-gateway-badge">
        <span class="reachkit-gateway-badge-dot"></span>
        Coming Soon
      </div>
      <img
        src={`${assets}/images/reachkit-logo.svg`}
        alt=""
        class="reachkit-gateway-logo"
        width="40"
        height="40"
      />
      <div class="reachkit-gateway-text">
        <h2 class="reachkit-gateway-title">Need to distribute everywhere?</h2>
        <p class="reachkit-gateway-desc">
          ReachKit uses AI to predict app store rejections before you submit. Validate once, ship to every major mobile store — App Store, Google Play, F-Droid, Zapstore, and more.
        </p>
      </div>
      <a
        href="/studio/reachkit"
        class="reachkit-gateway-cta btn-glass-large btn-glass-with-chevron group"
      >
        Learn about ReachKit
        <ChevronRight
          variant="outline"
          color="hsl(var(--white33))"
          size={18}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </a>
    </div>
  </div>
</section>

<style>
  .reachkit-gateway {
    padding: 3rem 1rem;
  }

  @media (min-width: 768px) {
    .reachkit-gateway {
      padding: 4rem 1.5rem;
    }
  }

  .reachkit-gateway-container {
    max-width: 900px;
    margin: 0 auto;
  }

  .reachkit-gateway-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    text-align: center;
    padding: 2rem 1.5rem;
    background-color: hsl(var(--gray33));
    border-radius: var(--radius-32);
    border: 0.33px solid hsl(var(--white16));
  }

  @media (min-width: 768px) {
    .reachkit-gateway-inner {
      flex-direction: row;
      flex-wrap: wrap;
      text-align: left;
      gap: 1.5rem 2rem;
      padding: 2rem 2.5rem;
    }
  }

  .reachkit-gateway-badge {
    order: -1;
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.35rem 0.75rem;
    border-radius: 9999px;
    border: 1px solid hsl(var(--goldColor) / 0.35);
    background: hsl(var(--goldColor) / 0.12);
    font-size: 0.75rem;
    font-weight: 500;
    color: hsl(var(--goldColor) / 0.6);
  }

  @media (min-width: 768px) {
    .reachkit-gateway-badge {
      width: auto;
      order: 0;
    }
  }

  .reachkit-gateway-badge-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: hsl(var(--goldColor));
    animation: reachkit-pulse 1.5s ease-in-out infinite;
  }

  @keyframes reachkit-pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .reachkit-gateway-logo {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
  }

  .reachkit-gateway-text {
    min-width: 0;
    flex: 1;
  }

  @media (min-width: 768px) {
    .reachkit-gateway-text {
      flex: 1 1 100%;
      max-width: none;
    }
  }

  .reachkit-gateway-title {
    font-size: 1.35rem;
    font-weight: 600;
    line-height: 1.3;
    color: hsl(var(--white));
    margin: 0 0 0.4rem 0;
  }

  @media (min-width: 640px) {
    .reachkit-gateway-title {
      font-size: 1.5rem;
    }
  }

  .reachkit-gateway-desc {
    font-size: 0.9375rem;
    color: hsl(var(--white66));
    line-height: 1.45;
    margin: 0;
  }

  .reachkit-gateway-cta {
    flex-shrink: 0;
    text-decoration: none;
  }
</style>
