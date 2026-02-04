<script lang="ts">
  /**
   * MessageBubble - A chat-like message bubble component
   *
   * Displays a message with:
   * - Bottom-aligned profile picture on the left
   * - Chat bubble on the right with asymmetric border radius
   * - Profile name in profile color + timestamp row
   * - Message content below
   */
  import { onMount } from "svelte";
  import ProfilePic from "$lib/components/common/ProfilePic.svelte";
  import Timestamp from "$lib/components/common/Timestamp.svelte";
  import { Loader2 } from "lucide-svelte";
  import {
    hexToColor,
    stringToColor,
    getProfileTextColor,
    rgbToCssString,
  } from "$lib/utils/color.js";

  interface Props {
    pictureUrl?: string | null;
    name?: string;
    pubkey?: string | null;
    timestamp?: number | string | Date | null;
    profileUrl?: string;
    className?: string;
    loading?: boolean;
    /** Show publishing spinner (e.g. until relay confirms) */
    pending?: boolean;
    light?: boolean;
    children?: import("svelte").Snippet;
  }

  let {
    pictureUrl = null,
    name = "",
    pubkey = null,
    timestamp = null,
    profileUrl = "",
    className = "",
    loading = false,
    pending = false,
    light = false,
    children,
  }: Props = $props();

  let isDarkMode = $state(true);

  onMount(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    isDarkMode = mediaQuery.matches;

    const handleChange = (e: MediaQueryListEvent) => (isDarkMode = e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  });

  function getProfileColor(pk: string | null, nm: string) {
    if (pk && pk.trim()) {
      return hexToColor(pk);
    }
    if (nm && nm.trim()) {
      return stringToColor(nm);
    }
    return { r: 128, g: 128, b: 128 };
  }

  const profileColor = $derived(getProfileColor(pubkey, name));
  const textColor = $derived(getProfileTextColor(profileColor, isDarkMode));
  const nameColorStyle = $derived(rgbToCssString(textColor));
</script>

<div class="message-bubble {className}">
  <div class="profile-column">
    {#if profileUrl}
      <a href={profileUrl} class="profile-link">
        <ProfilePic {pictureUrl} {name} {pubkey} {loading} size="bubble" />
      </a>
    {:else}
      <ProfilePic {pictureUrl} {name} {pubkey} {loading} size="bubble" />
    {/if}
  </div>

  <div class="bubble" class:bubble-light={light}>
    <div class="bubble-header">
      {#if profileUrl}
        <a href={profileUrl} class="author-name" style="color: {nameColorStyle};">
          {name || "Anonymous"}
        </a>
      {:else}
        <span class="author-name" style="color: {nameColorStyle};">
          {name || "Anonymous"}
        </span>
      {/if}
      {#if !pending}
        <Timestamp {timestamp} size="xs" />
      {:else}
        <span class="publish-spinner" aria-label="Publishing">
          <Loader2 class="h-3.5 w-3.5 animate-spin" style="color: hsl(var(--blurpleLightColor));" />
        </span>
      {/if}
    </div>

    <div class="bubble-content">
      {@render children?.()}
    </div>
  </div>
</div>

<style>
  .message-bubble {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }

  .profile-column {
    flex-shrink: 0;
  }

  .profile-link {
    display: block;
    transition: opacity 0.15s ease;
  }

  .profile-link:hover {
    opacity: 0.8;
  }

  .bubble-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 4px;
  }

  .publish-spinner {
    display: inline-flex;
    flex-shrink: 0;
  }

  .bubble {
    width: fit-content;
    max-width: 100%;
    min-width: 200px;
    background-color: hsl(var(--gray66));
    border-radius: 16px 16px 16px 4px;
    padding: 8px 12px;
  }

  .bubble-light {
    background-color: hsl(var(--white8));
  }

  .author-name {
    font-weight: 600;
    font-size: 0.875rem;
    line-height: 1.2;
    text-decoration: none;
    transition: opacity 0.15s ease;
    white-space: nowrap;
  }

  a.author-name:hover {
    opacity: 0.8;
  }

  .bubble-content {
    font-size: 0.9375rem;
    line-height: 1.5;
    color: hsl(var(--foreground) / 0.85);
  }

  .bubble-content :global(p) {
    margin: 0;
  }

  .bubble-content :global(p + p) {
    margin-top: 0.5rem;
  }

  .bubble-content :global(a) {
    color: hsl(var(--primary));
    text-decoration: none;
  }

  .bubble-content :global(a:hover) {
    text-decoration: underline;
  }
</style>
