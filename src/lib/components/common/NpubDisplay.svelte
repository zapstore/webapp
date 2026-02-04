<script lang="ts">
  /**
   * NpubDisplay - Displays an npub with a colored profile circle
   */
  import { hexToColor } from "$lib/utils/color.js";

  interface Props {
    npub?: string;
    pubkey?: string;
    size?: "sm" | "md" | "lg";
    truncate?: boolean;
    className?: string;
  }

  let {
    npub = "",
    pubkey = "",
    size = "md",
    truncate = true,
    className = "",
  }: Props = $props();

  const dotSizes = {
    sm: 6,
    md: 8,
    lg: 10,
  };

  const fontSizes = {
    sm: "0.75rem",
    md: "0.875rem",
    lg: "1rem",
  };

  const profileColor = $derived(pubkey ? hexToColor(pubkey) : { r: 128, g: 128, b: 128 });
  const profileColorStyle = $derived(`rgb(${profileColor.r}, ${profileColor.g}, ${profileColor.b})`);

  function formatNpub(npubStr: string, shouldTruncate: boolean): string {
    if (!npubStr) return "";
    if (!shouldTruncate) return npubStr;
    if (npubStr.length < 20) return npubStr;
    return `${npubStr.slice(0, 12)}...${npubStr.slice(-4)}`;
  }

  const displayNpub = $derived(formatNpub(npub, truncate));
  const dotSize = $derived(dotSizes[size] || dotSizes.md);
  const fontSize = $derived(fontSizes[size] || fontSizes.md);
</script>

<span
  class="npub-display {className}"
  style="--dot-size: {dotSize}px; --font-size: {fontSize};"
>
  <span class="profile-dot" style="background-color: {profileColorStyle};"></span>
  <span class="npub-text">{displayNpub}</span>
</span>

<style>
  .npub-display {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .profile-dot {
    width: var(--dot-size);
    height: var(--dot-size);
    border-radius: 50%;
    border: 0.33px solid hsl(var(--white16));
    flex-shrink: 0;
  }

  .npub-text {
    font-size: var(--font-size);
    color: hsl(var(--white66));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
