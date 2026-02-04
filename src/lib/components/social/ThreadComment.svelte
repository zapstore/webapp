<script lang="ts">
  /**
   * ThreadComment - Thread-style comment display for modals
   */
  import { onMount } from "svelte";
  import ProfilePic from "$lib/components/common/ProfilePic.svelte";
  import Timestamp from "$lib/components/common/Timestamp.svelte";
  import {
    hexToColor,
    stringToColor,
    getProfileTextColor,
    rgbToCssString,
  } from "$lib/utils/color.js";

  interface Props {
    version?: string;
    pictureUrl?: string | null;
    name?: string;
    pubkey?: string | null;
    timestamp?: number | string | Date | null;
    profileUrl?: string;
    loading?: boolean;
    pending?: boolean;
    className?: string;
    appIconUrl?: string | null;
    appName?: string;
    appIdentifier?: string | null;
    children?: import("svelte").Snippet;
  }

  let {
    version = "",
    pictureUrl = null,
    name = "",
    pubkey = null,
    timestamp = null,
    profileUrl = "",
    loading = false,
    pending = false,
    className = "",
    appIconUrl = null,
    appName = "",
    appIdentifier = null,
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

<div class="thread-comment {className}">
  <div class="author-row">
    <div class="profile-column">
      {#if profileUrl}
        <a href={profileUrl} class="profile-link">
          <ProfilePic {pictureUrl} {name} {pubkey} {loading} size="md" />
        </a>
      {:else}
        <ProfilePic {pictureUrl} {name} {pubkey} {loading} size="md" />
      {/if}
    </div>
    <div class="author-info">
      <div class="author-left">
        {#if profileUrl}
          <a href={profileUrl} class="author-name" style="color: {nameColorStyle};">
            {name || "Anonymous"}
          </a>
        {:else}
          <span class="author-name" style="color: {nameColorStyle};">
            {name || "Anonymous"}
          </span>
        {/if}
        <Timestamp {timestamp} size="xs" />
      </div>
      {#if version}
        <span class="version-pill">{version}</span>
      {/if}
    </div>
  </div>

  <div class="content">
    {@render children?.()}
  </div>
</div>

<style>
  .thread-comment {
    display: flex;
    flex-direction: column;
  }

  .author-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
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

  .author-info {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex: 1;
    min-width: 0;
    padding-top: 4px;
  }

  .author-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .author-name {
    font-weight: 600;
    font-size: 0.875rem;
    line-height: 1.2;
    text-decoration: none;
    transition: opacity 0.15s ease;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  a.author-name:hover {
    opacity: 0.8;
  }

  .version-pill {
    font-size: 0.75rem;
    font-weight: 500;
    color: hsl(var(--white66));
    background-color: hsl(var(--white16));
    padding: 2px 8px;
    border-radius: 100px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .content {
    margin-top: 12px;
    font-size: 0.9375rem;
    line-height: 1.5;
    color: hsl(var(--foreground) / 0.85);
  }

  .content :global(p) {
    margin: 0;
  }

  .content :global(p + p) {
    margin-top: 0.5rem;
  }

  .content :global(a) {
    color: hsl(var(--primary));
    text-decoration: none;
  }

  .content :global(a:hover) {
    text-decoration: underline;
  }
</style>
