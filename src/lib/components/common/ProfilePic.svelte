<script>
  import { onMount } from "svelte";
  import {
    hexToColor,
    stringToColor,
    getProfileTextColor,
    rgbToCssString,
  } from "$lib/utils/color.js";
  import SkeletonLoader from "./SkeletonLoader.svelte";

  /**
   * ProfilePic - A profile picture component with fallback states
   *
   * Displays a profile image with:
   * - Circular shape with thin outline
   * - Loading skeleton while image loads
   * - Colored initial letter fallback when no image
   * - Icon fallback when no name/pubkey available
   *
   * @example
   * <ProfilePic pictureUrl="https://..." name="Alice" size="md" />
   * <ProfilePic pubkey="abc123..." size="lg" />
   * <ProfilePic name="Bob" size="sm" />
   */

  /** @type {string|null|undefined} - Profile picture URL */
  export let pictureUrl = null;

  /** @type {string|null|undefined} - Display name for initial fallback */
  export let name = null;

  /** @type {string|null|undefined} - Hex pubkey for color generation */
  export let pubkey = null;

  /** @type {'xs'|'sm'|'bubble'|'md'|'lg'|'xl'|'2xl'} - Size preset */
  export let size = "md";

  /** @type {() => void} - Click handler */
  export let onClick = () => {};

  /** @type {string} - Additional CSS classes */
  export let className = "";

  /** @type {boolean} - External loading state (e.g., profile data still being fetched) */
  export let loading = false;

  // Dark mode detection
  let isDarkMode = true;

  onMount(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    isDarkMode = mediaQuery.matches;

    const handleChange = (e) => (isDarkMode = e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  });

  // Size mappings (in pixels)
  const sizeMap = {
    xs: 20,
    sm: 28,
    bubble: 32,
    md: 38,
    lg: 48,
    xl: 64,
    "2xl": 96,
  };

  // Font size ratio relative to container (matching Flutter's 0.56)
  const fontSizeRatio = 0.56;

  // Image loading state
  let imageLoaded = false;
  let imageError = false;

  // Reactive computations
  $: resolvedSize = sizeMap[size] || sizeMap.md;
  $: fontSize = Math.round(resolvedSize * fontSizeRatio);
  $: hasValidUrl = pictureUrl && pictureUrl.trim().length > 0;
  $: showImage = hasValidUrl && !imageError;

  // Generate profile color from pubkey or name
  $: profileColor = getProfileColor(pubkey, name);

  /**
   * Get profile color based on pubkey or name
   * @param {string|null|undefined} pubkey
   * @param {string|null|undefined} name
   * @returns {{r: number, g: number, b: number}}
   */
  function getProfileColor(pubkey, name) {
    if (pubkey && pubkey.trim()) {
      // Use hexToColor for pubkeys (hex strings)
      return hexToColor(pubkey);
    }
    if (name && name.trim()) {
      // Use stringToColor for names
      return stringToColor(name);
    }
    // Default gray
    return { r: 128, g: 128, b: 128 };
  }

  // Check if the name is actually an npub (not a real display name)
  $: isNpub = name && name.trim().toLowerCase().startsWith("npub");

  // Get initial letter from name (but not if it's an npub)
  $: initial =
    name && name.trim() && !isNpub ? name.trim()[0].toUpperCase() : "";
  $: hasInitial = initial.length > 0;

  // Color styles - use getProfileTextColor for text/icon readability
  $: bgColorStyle = `rgba(${profileColor.r}, ${profileColor.g}, ${profileColor.b}, 0.24)`;
  $: textColor = getProfileTextColor(profileColor, isDarkMode);
  $: textColorStyle = rgbToCssString(textColor);

  // Handle image load
  function handleImageLoad() {
    imageLoaded = true;
  }

  // Handle image error
  function handleImageError() {
    imageError = true;
  }

  // Reset states when URL changes
  $: if (pictureUrl) {
    imageLoaded = false;
    imageError = false;
  }
</script>

<button
  type="button"
  class="profile-pic {className}"
  style="--size: {resolvedSize}px; --font-size: {fontSize}px; --bg-color: {bgColorStyle}; --text-color: {textColorStyle};"
  on:click={onClick}
  aria-label={name ? `${name}'s profile picture` : "Profile picture"}
>
  <div class="profile-pic-inner">
    {#if showImage}
      <!-- Image with loading state -->
      {#if !imageLoaded}
        <!-- Show skeleton behind initial/icon while loading -->
        <div class="skeleton-container">
          <SkeletonLoader />
        </div>
        <div class="loading-initial-container">
          {#if hasInitial}
            <span class="initial">{initial}</span>
          {:else}
            <svg
              class="user-icon-colored"
              viewBox="0 0 16 20"
              fill="currentColor"
            >
              <path
                d="M16 16.2353C16 18.3145 12.4183 20 8 20C3.58172 20 0 18.3145 0 16.2353C0 14.1561 3.58172 12.4706 8 12.4706C12.4183 12.4706 16 14.1561 16 16.2353Z"
              />
              <path
                d="M12.8 4.70588C12.8 7.30487 10.651 9.41177 8 9.41177C5.34903 9.41177 3.2 7.30487 3.2 4.70588C3.2 2.1069 5.34903 0 8 0C10.651 0 12.8 2.1069 12.8 4.70588Z"
              />
            </svg>
          {/if}
        </div>
      {/if}
      <img
        src={pictureUrl}
        alt={name ? `${name}'s avatar` : "Profile avatar"}
        class="profile-image"
        class:loaded={imageLoaded}
        loading="lazy"
        on:load={handleImageLoad}
        on:error={handleImageError}
      />
    {:else if loading}
      <!-- External loading state (profile data being fetched) -->
      <div class="skeleton-container">
        <SkeletonLoader />
      </div>
      <div class="loading-initial-container">
        {#if hasInitial}
          <span class="initial">{initial}</span>
        {:else}
          <svg
            class="user-icon-colored"
            viewBox="0 0 16 20"
            fill="currentColor"
          >
            <path
              d="M16 16.2353C16 18.3145 12.4183 20 8 20C3.58172 20 0 18.3145 0 16.2353C0 14.1561 3.58172 12.4706 8 12.4706C12.4183 12.4706 16 14.1561 16 16.2353Z"
            />
            <path
              d="M12.8 4.70588C12.8 7.30487 10.651 9.41177 8 9.41177C5.34903 9.41177 3.2 7.30487 3.2 4.70588C3.2 2.1069 5.34903 0 8 0C10.651 0 12.8 2.1069 12.8 4.70588Z"
            />
          </svg>
        {/if}
      </div>
    {:else if hasInitial}
      <!-- Initial letter fallback (no image URL, has name) -->
      <div class="fallback-container">
        <span class="initial">{initial}</span>
      </div>
    {:else}
      <!-- User icon fallback (no image URL, no name) -->
      <div class="fallback-container">
        <svg class="user-icon-colored" viewBox="0 0 16 20" fill="currentColor">
          <path
            d="M16 16.2353C16 18.3145 12.4183 20 8 20C3.58172 20 0 18.3145 0 16.2353C0 14.1561 3.58172 12.4706 8 12.4706C12.4183 12.4706 16 14.1561 16 16.2353Z"
          />
          <path
            d="M12.8 4.70588C12.8 7.30487 10.651 9.41177 8 9.41177C5.34903 9.41177 3.2 7.30487 3.2 4.70588C3.2 2.1069 5.34903 0 8 0C10.651 0 12.8 2.1069 12.8 4.70588Z"
          />
        </svg>
      </div>
    {/if}
  </div>
</button>

<style>
  .profile-pic {
    /* Reset button styles */
    padding: 0;
    margin: 0;
    border: none;
    background: transparent;
    cursor: pointer;

    /* Display */
    display: block;

    /* Size */
    width: var(--size);
    height: var(--size);
    min-width: var(--size);
    min-height: var(--size);

    /* Shape */
    border-radius: 50%;

    /* Interaction */
    transition: transform 0.15s ease;

    /* Performance */
    contain: layout style;
  }

  .profile-pic:hover {
    transform: scale(1.02);
  }

  .profile-pic:active {
    transform: scale(0.98);
  }

  .profile-pic-inner {
    /* Fill parent */
    width: 100%;
    height: 100%;

    /* Shape with thin outline */
    border-radius: 50%;
    border: 0.33px solid hsl(var(--white16));

    /* Background with blur */
    background-color: hsl(var(--gray66) / 0.8);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);

    /* Clip content to circle */
    overflow: hidden;

    /* Layout */
    position: relative;
  }

  /* Skeleton loading state */
  .skeleton-container {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    overflow: hidden;
  }

  /* Initial letter shown on top of skeleton while image loads */
  .loading-initial-container {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;
    /* Same colored background as fallback - skeleton shimmer shows around edges */
    background-color: var(--bg-color);
  }

  /* Profile image */
  .profile-image {
    width: 100%;
    height: 100%;
    object-fit: cover;

    /* Hidden until loaded */
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .profile-image.loaded {
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

  /* Initial letter */
  .initial {
    font-size: var(--font-size);
    font-weight: 700;
    color: var(--text-color);
    line-height: 1;
    user-select: none;
    /* Brightness adjustment handled by getProfileTextColor() in color.js */
  }

  /* User icon in profile color */
  .user-icon-colored {
    width: 60%;
    height: 60%;
    color: var(--text-color);
    /* Brightness adjustment handled by getProfileTextColor() in color.js */
  }
</style>
