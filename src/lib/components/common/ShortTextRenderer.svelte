<script lang="ts">
  /**
   * ShortTextRenderer - Renders short text with mentions, custom emoji, and nostr refs.
   * Use in comments, zap messages, profile descriptions, etc.
   * Matches ShortTextInput display: profile-colored @mentions, inline emoji, block cards for nevent/naddr.
   */
  import { onMount } from "svelte";
  import {
    parseShortText,
    type ShortTextSegment,
    type ShortTextInput,
  } from "$lib/utils/short-text-parser.js";
  import {
    hexToColor,
    getProfileTextColor,
    rgbToCssString,
  } from "$lib/utils/color.js";

  interface Props {
    /** Plain text content (may include nostr:..., :shortcode:) */
    content: string;
    /** Custom emoji shortcode -> url (from event tags or submit payload) */
    emojiTags?: { shortcode: string; url: string }[];
    /** Optional: resolve pubkey to display name (e.g. from profile cache) */
    resolveMentionLabel?: (pubkey: string) => string | undefined;
    /** Root class name */
    class?: string;
  }

  let {
    content = "",
    emojiTags = [],
    resolveMentionLabel,
    class: className = "",
  }: Props = $props();

  let isDarkMode = $state(true);

  onMount(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    isDarkMode = mq.matches;
    const handle = (e: MediaQueryListEvent) => (isDarkMode = e.matches);
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  });

  const input: ShortTextInput = $derived({ text: content, emojiTags });
  const segments: ShortTextSegment[] = $derived(parseShortText(input));

  function mentionLabel(segment: Extract<ShortTextSegment, { type: "mention" }>): string {
    return resolveMentionLabel?.(segment.pubkey) ?? segment.pubkey.slice(0, 8);
  }

  function mentionStyle(pubkey: string): string {
    const rgb = hexToColor(pubkey);
    const textRgb = getProfileTextColor(rgb, isDarkMode);
    return `color: ${rgbToCssString(textRgb)}`;
  }
</script>

<div class="short-text-renderer {className}" data-short-text>
  {#each segments as segment}
    {#if segment.type === "text"}
      <span class="short-text-text">{segment.value}</span>
    {:else if segment.type === "mention"}
      <a
        href="/profile/{segment.npub}"
        class="short-text-mention"
        style={mentionStyle(segment.pubkey)}
      >
        @{mentionLabel(segment)}
      </a>
    {:else if segment.type === "emoji"}
      {#if segment.url}
        <img
          src={segment.url}
          alt=":{segment.shortcode}:"
          class="short-text-emoji"
          loading="lazy"
          decoding="async"
        />
      {:else}
        <span class="short-text-emoji-fallback">:{segment.shortcode}:</span>
      {/if}
    {:else if segment.type === "nostr_ref"}
      <div class="short-text-nostr-card">
        <span class="short-text-nostr-card-label">Nostr reference</span>
        <span class="short-text-nostr-card-kind">{segment.kind}</span>
        <!-- Editable placeholder: replace with kind-specific display later -->
      </div>
    {/if}
  {/each}
</div>

<style>
  .short-text-renderer {
    font-size: inherit;
    line-height: 1.5;
    color: hsl(var(--foreground) / 0.85);
    word-wrap: break-word;
  }

  .short-text-text {
    white-space: pre-line;
  }

  .short-text-mention {
    font-weight: 500;
    text-decoration: none;
    transition: opacity 0.15s ease;
  }

  .short-text-mention:hover {
    opacity: 0.8;
    text-decoration: underline;
  }

  .short-text-emoji {
    width: 1.25em;
    height: 1.25em;
    vertical-align: -0.2em;
    margin: 0 2px;
    display: inline;
  }

  .short-text-emoji-fallback {
    font-size: 0.95em;
    color: hsl(var(--foreground) / 0.7);
  }

  .short-text-nostr-card {
    display: block;
    margin: 0.5rem 0;
    padding: 10px 12px;
    background: hsl(var(--gray66));
    border: 1px solid hsl(var(--white16));
    border-radius: 12px;
    font-size: 0.875rem;
  }

  .short-text-nostr-card-label {
    color: hsl(var(--foreground) / 0.7);
  }

  .short-text-nostr-card-kind {
    margin-left: 6px;
    color: hsl(var(--white33));
    font-family: var(--font-mono, monospace);
  }
</style>
