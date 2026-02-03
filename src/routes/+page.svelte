<script lang="ts">
  // Homepage - no apps shown, just landing page with CTA
</script>

<svelte:head>
  <title>Zapstore — Discover Apps on Nostr</title>
  <meta name="description" content="Discover and install apps from the Nostr network. Open source, decentralized app store.">
</svelte:head>

<section class="hero">
  <h1>Discover Apps on Nostr</h1>
  <p>Open source apps, verified by the community</p>
</section>

<section class="features">
  <div class="feature">
    <div class="feature-icon">🔓</div>
    <h3>Open Source</h3>
    <p>All apps are open source with verifiable code</p>
  </div>
  <div class="feature">
    <div class="feature-icon">🌐</div>
    <h3>Decentralized</h3>
    <p>Published via Nostr relays, no central authority</p>
  </div>
  <div class="feature">
    <div class="feature-icon">✅</div>
    <h3>Community Verified</h3>
    <p>Reviews and attestations from the community</p>
  </div>
</section>

<section class="cta">
  <a href="/apps" class="browse-all">Browse All Apps →</a>
</section>

<style>
  .hero {
    text-align: center;
    padding: 4rem 1rem;
    background: linear-gradient(135deg, var(--color-accent, #8b5cf6) 0%, var(--color-accent-hover, #7c3aed) 100%);
    border-radius: 1rem;
    color: white;
    margin-bottom: 3rem;
  }
  
  .hero h1 {
    font-size: 2.5rem;
    font-weight: 700;
    margin: 0 0 0.5rem;
  }
  
  .hero p {
    font-size: 1.125rem;
    opacity: 0.9;
    margin: 0;
  }
  
  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 2rem;
    margin-bottom: 3rem;
  }
  
  .feature {
    text-align: center;
    padding: 1.5rem;
  }
  
  .feature-icon {
    font-size: 2.5rem;
    margin-bottom: 1rem;
  }
  
  .feature h3 {
    font-size: 1.125rem;
    font-weight: 600;
    margin: 0 0 0.5rem;
  }
  
  .feature p {
    color: var(--color-text-secondary, #6b7280);
    margin: 0;
    font-size: 0.875rem;
  }
  
  .cta {
    text-align: center;
    padding: 2rem;
  }
  
  .browse-all {
    display: inline-block;
    padding: 1rem 2rem;
    background: var(--color-accent, #8b5cf6);
    color: white;
    text-decoration: none;
    border-radius: 9999px;
    font-weight: 500;
    font-size: 1.125rem;
    transition: background 0.2s, transform 0.2s;
  }
  
  .browse-all:hover {
    background: var(--color-accent-hover, #7c3aed);
    transform: translateY(-2px);
  }
</style>
