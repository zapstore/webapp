<script lang="ts">
  /**
   * QuotedMessage - Compact quote block for displaying inside message bubbles.
   * Used when a comment is a reply to another comment in the thread.
   * Left border (2.8px) in quoted author's profile color; two rows: name (in profile color), one-line content with ellipsis.
   */
  import { onMount } from "svelte";
  import {
    hexToColor,
    stringToColor,
    getProfileTextColor,
    rgbToCssString,
  } from "$lib/utils/color.js";

  interface Props {
    /** Quoted author display name */
    authorName?: string;
    /** Quoted author pubkey (for profile color) */
    authorPubkey?: string | null;
    /** Plain text preview (one line, will be trimmed with "..." when needed) */
    contentPreview?: string;
    /** Max length before truncation (default 80) */
    maxPreviewLength?: number;
  }

  let {
    authorName = "Anonymous",
    authorPubkey = null,
    contentPreview = "",
    maxPreviewLength = 80,
  }: Props = $props();

  function getProfileColor(pk: string | null, nm: string) {
    if (pk && pk.trim()) {
      return hexToColor(pk);
    }
    if (nm && nm.trim()) {
      return stringToColor(nm);
    }
    return { r: 128, g: 128, b: 128 };
  }

  let isDarkMode = $state(true);
  const profileRgb = $derived(getProfileColor(authorPubkey, authorName));
  const textRgb = $derived(getProfileTextColor(profileRgb, isDarkMode));
  const borderColorStyle = $derived(rgbToCssString(profileRgb));
  const nameColorStyle = $derived(rgbToCssString(textRgb));

  const trimmedPreview = $derived.by(() => {
    const plain = (contentPreview || "").replace(/\s+/g, " ").trim();
    if (plain.length <= maxPreviewLength) return plain;
    return plain.slice(0, maxPreviewLength).trim() + "...";
  });

  onMount(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    isDarkMode = mq.matches;
    const handle = () => (isDarkMode = mq.matches);
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  });
</script>

<div class="quoted-message">
  <div class="quoted-bar" style="background: {borderColorStyle};" aria-hidden="true"></div>
  <div class="quoted-body">
    <div class="quoted-name" style="color: {nameColorStyle};">
      {authorName}
    </div>
    <div class="quoted-content">
      {trimmedPreview || " "}
    </div>
  </div>
</div>

<style>
  .quoted-message {
    display: flex;
    min-height: 0;
    margin-bottom: 8px;
    border-radius: var(--radius-12);
    overflow: hidden;
    background: hsl(var(--white4));
  }

  .quoted-bar {
    width: 2.8px;
    flex-shrink: 0;
    min-height: 100%;
  }

  .quoted-body {
    flex: 1;
    min-width: 0;
    padding: 6px 10px 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .quoted-name {
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .quoted-content {
    font-size: 0.8125rem;
    line-height: 1.3;
    color: hsl(var(--white66));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
