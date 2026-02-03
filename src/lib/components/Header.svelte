<script lang="ts">
  let searchQuery = $state('');
  
  function handleSearch(e: Event) {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`;
    }
  }
</script>

<header class="header">
  <div class="header-content">
    <a href="/" class="logo">
      <span class="logo-icon">⚡</span>
      <span class="logo-text">Zapstore</span>
    </a>
    
    <form class="search-form" onsubmit={handleSearch}>
      <input
        type="search"
        placeholder="Search apps..."
        bind:value={searchQuery}
        class="search-input"
      />
    </form>
    
    <nav class="nav">
      <a href="/apps" class="nav-link">Browse</a>
      <a href="/docs" class="nav-link" data-sveltekit-reload>Docs</a>
      <a href="/blog" class="nav-link" data-sveltekit-reload>Blog</a>
    </nav>
  </div>
</header>

<style>
  .header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--color-border, #e5e7eb);
  }
  
  .header-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0.75rem 1rem;
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }
  
  .logo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    color: inherit;
    font-weight: 700;
    font-size: 1.25rem;
  }
  
  .logo-icon {
    font-size: 1.5rem;
  }
  
  .search-form {
    flex: 1;
    max-width: 400px;
  }
  
  .search-input {
    width: 100%;
    padding: 0.5rem 1rem;
    border-radius: 9999px;
    border: 1px solid var(--color-border, #e5e7eb);
    background: var(--color-bg-secondary, #f9fafb);
    font-size: 0.875rem;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  
  .search-input:focus {
    border-color: var(--color-accent, #8b5cf6);
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
  }
  
  .nav {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  
  .nav-link {
    color: var(--color-text-secondary, #6b7280);
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;
    transition: color 0.2s;
  }
  
  .nav-link:hover {
    color: var(--color-text-primary, #111);
  }
</style>
