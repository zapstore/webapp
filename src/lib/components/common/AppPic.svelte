<script>
  import { hexToColor, stringToColor } from "$lib/utils/color.js";
  import SkeletonLoader from "./SkeletonLoader.svelte";

  /**
   * AppPic - An app icon component with fallback states
   *
   * Displays an app icon with:
   * - Rounded square shape with size-dependent border radius
   * - Thin outline (0.33px)
   * - Loading skeleton while image loads
   * - Blurred background fill for icons with transparency (Android icons)
   * - Colored initial letter fallback when no image
   * - Generic icon fallback when no name available
   *
   * Border radius rules (matching Flutter):
   * - size >= 72px: 24px radius
   * - size >= 48px: 16px radius
   * - smaller: 8px radius
   *
   * @example
   * <AppPic iconUrl="https://..." name="Zapstore" size="md" />
   * <AppPic name="MyApp" identifier="com.example.app" size="lg" />
   */

  /** @type {string|null|undefined} - App icon URL */
  export let iconUrl = null;

  /** @type {string|null|undefined} - App name for initial fallback */
  export let name = null;

  /** @type {string|null|undefined} - App identifier/dTag for color generation */
  export let identifier = null;

  /** @type {'xs'|'sm'|'md'|'lg'|'xl'|'2xl'|'3xl'} - Size preset */
  export let size = "md";

  /** @type {() => void} - Click handler */
  export let onClick = () => {};

  /** @type {string} - Additional CSS classes */
  export let className = "";

  /** @type {boolean} - Whether to show blurred background for transparent icons */
  export let fillBackground = true;

  // Size mappings (in pixels) - matching Flutter sizes
  const sizeMap = {
    xs: 32,
    sm: 38,
    md: 48,
    lg: 56,
    xl: 72,
    "2xl": 96,
    "3xl": 120,
  };

  // Border radius based on size (matching Flutter logic)
  function getBorderRadius(sizeInPx) {
    if (sizeInPx >= 120) return 32;
    if (sizeInPx >= 72) return 24;
    if (sizeInPx >= 48) return 16;
    return 8;
  }

  // Font size ratio relative to container (matching Flutter's 0.56)
  const fontSizeRatio = 0.56;

  // Image loading state
  let imageLoaded = false;
  let imageError = false;

  // Reactive computations
  $: resolvedSize = sizeMap[size] || sizeMap.md;
  $: borderRadius = getBorderRadius(resolvedSize);
  $: fontSize = Math.round(resolvedSize * fontSizeRatio);
  $: hasValidUrl = iconUrl && iconUrl.trim().length > 0;
  $: showImage = hasValidUrl && !imageError;
  
  // Action to check if image is already cached (loaded synchronously)
  function checkIfCached(img) {
    // Check immediately - cached images are already complete
    if (img.complete && img.naturalHeight !== 0) {
      imageLoaded = true;
    }
    return {}; // Svelte action return
  }

  // Generate color from identifier or name
  $: appColor = getAppColor(identifier, name);

  /**
   * Get app color based on identifier or name
   * @param {string|null|undefined} identifier
   * @param {string|null|undefined} name
   * @returns {{r: number, g: number, b: number}}
   */
  function getAppColor(identifier, name) {
    if (identifier && identifier.trim()) {
      // Use stringToColor for identifiers
      return stringToColor(identifier);
    }
    if (name && name.trim()) {
      // Use stringToColor for names
      return stringToColor(name);
    }
    // Default gray
    return { r: 128, g: 128, b: 128 };
  }

  // Get initial letter from name
  $: initial = name && name.trim() ? name.trim()[0].toUpperCase() : "";
  $: hasInitial = initial.length > 0;

  // Color styles
  $: bgColorStyle = `rgba(${appColor.r}, ${appColor.g}, ${appColor.b}, 0.24)`;
  $: textColorStyle = `rgb(${appColor.r}, ${appColor.g}, ${appColor.b})`;

  // Handle image load
  function handleImageLoad() {
    imageLoaded = true;
  }

  // Handle image error
  function handleImageError() {
    imageError = true;
  }

  // Reset states when URL changes
  $: if (iconUrl) {
    imageLoaded = false;
    imageError = false;
  }
</script>

<button
  type="button"
  class="app-pic {className}"
  style="--size: {resolvedSize}px; --radius: {borderRadius}px; --font-size: {fontSize}px; --bg-color: {bgColorStyle}; --text-color: {textColorStyle};"
  on:click={onClick}
  aria-label={name ? `${name} app icon` : "App icon"}
>
  <div class="app-pic-inner">
    {#if showImage}
      <!-- Image with loading state -->
      {#if !imageLoaded}
        <div class="skeleton-container">
          <SkeletonLoader />
        </div>
      {/if}

      <!-- Blurred background for icons with transparency (Android icons) -->
      {#if fillBackground && imageLoaded}
        <div
          class="blurred-background"
          style="background-image: url({iconUrl});"
        ></div>
      {/if}

      <img
        src={iconUrl}
        alt={name ? `${name} icon` : "App icon"}
        class="app-image"
        class:loaded={imageLoaded}
        loading="lazy"
        on:load={handleImageLoad}
        on:error={handleImageError}
        use:checkIfCached
      />
    {:else if hasInitial}
      <!-- Initial letter fallback -->
      <div class="fallback-container">
        <span class="initial">{initial}</span>
        <!-- Overlay for subtle lighting effect -->
        <span class="initial-overlay">{initial}</span>
      </div>
    {:else}
      <!-- Generic app icon fallback -->
      <div class="fallback-container fallback-generic">
        <svg
          class="app-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
      </div>
    {/if}
  </div>
</button>

<style>
  .app-pic {
    /* Reset button styles */
    padding: 0;
    margin: 0;
    border: none;
    background: transparent;
    cursor: pointer;

    /* Size */
    width: var(--size);
    height: var(--size);
    min-width: var(--size);
    min-height: var(--size);

    /* Shape */
    border-radius: var(--radius);

    /* Interaction */
    transition: transform 0.15s ease;

    /* Performance */
    contain: layout style;
  }

  .app-pic:hover {
    transform: scale(1.02);
  }

  .app-pic:active {
    transform: scale(0.98);
  }

  .app-pic-inner {
    /* Fill parent */
    width: 100%;
    height: 100%;

    /* Shape with thin outline */
    border-radius: var(--radius);
    border: 0.33px solid hsl(var(--white16));

    /* Background */
    background-color: hsl(var(--gray66));

    /* Clip content to rounded square */
    overflow: hidden;

    /* Layout */
    position: relative;
  }

  /* Skeleton loading state */
  .skeleton-container {
    position: absolute;
    inset: 0;
    border-radius: var(--radius);
    overflow: hidden;
  }

  /* Blurred background for transparent icons */
  .blurred-background {
    position: absolute;
    inset: -20%;
    width: 140%;
    height: 140%;
    background-size: cover;
    background-position: center;
    filter: blur(20px) saturate(1.5);
    opacity: 0.8;
    z-index: 0;
  }

  /* App image */
  .app-image {
    position: relative;
    width: 100%;
    height: 100%;
    object-fit: contain;
    z-index: 1;

    /* Hidden until loaded */
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .app-image.loaded {
    opacity: 1;
  }

  /* Fallback container */
  .fallback-container {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--bg-color);
    position: relative;
  }

  .fallback-generic {
    background-color: hsl(var(--white8));
  }

  /* Initial letter */
  .initial {
    font-size: var(--font-size);
    font-weight: 700;
    color: var(--text-color);
    line-height: 1;
    user-select: none;
  }

  /* Subtle overlay effect matching Flutter's white16 overlay */
  .initial-overlay {
    position: absolute;
    font-size: var(--font-size);
    font-weight: 700;
    color: hsl(var(--white16));
    line-height: 1;
    user-select: none;
    pointer-events: none;
  }

  /* App icon fallback */
  .app-icon {
    width: 50%;
    height: 50%;
    color: hsl(var(--white33));
  }
</style>
