<script lang="js">
/**
 * ZapBubble - A chat-like bubble for displaying zaps
 * Zap comment is rendered via ShortTextRenderer (mentions, emoji, nostr refs).
 */
import { nip19 } from "nostr-tools";
import ProfilePic from "$lib/components/common/ProfilePic.svelte";
import Timestamp from "$lib/components/common/Timestamp.svelte";
import ShortTextRenderer from "$lib/components/common/ShortTextRenderer.svelte";
import { Zap } from "$lib/components/icons";
let { pictureUrl = null, name = "", pubkey = null, amount = 0, timestamp = null, profileUrl = "", className = "", loading = false, message = "", emojiTags = [], resolveMentionLabel, } = $props();
function formatNpubDisplay(npubStr) {
    if (!npubStr || typeof npubStr !== "string") return "";
    const s = npubStr.trim();
    if (s.length < 14) return s;
    const afterPrefix = s.startsWith("npub1") ? s.slice(5, 8) : s.slice(0, 3);
    return s.startsWith("npub1") ? `npub1${afterPrefix}......${s.slice(-6)}` : `${afterPrefix}......${s.slice(-6)}`;
}
const displayName = $derived(
    name?.trim() ? name : (pubkey ? formatNpubDisplay(nip19.npubEncode(pubkey)) : "")
);
function formatAmount(val) {
    if (val >= 1000000)
        return `${(val / 1000000).toFixed(val % 1000000 === 0 ? 0 : 1)}M`;
    if (val >= 1000)
        return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}K`;
    return val.toLocaleString();
}
</script>

<div class="zap-bubble {className}">
  <div class="profile-column">
    {#if profileUrl}
      <a href={profileUrl} class="profile-link">
        <ProfilePic {pictureUrl} {name} {pubkey} {loading} size="smMd" />
      </a>
    {:else}
      <ProfilePic {pictureUrl} {name} {pubkey} {loading} size="smMd" />
    {/if}
  </div>

  <div class="bubble">
    <div class="bubble-header">
      <div class="header-left">
        {#if profileUrl}
          <a href={profileUrl} class="author-name">
            {displayName}
          </a>
        {:else}
          <span class="author-name">
            {displayName}
          </span>
        {/if}
        <Timestamp {timestamp} size="xs" />
      </div>

      <div class="zap-amount-row">
        <Zap variant="fill" size={14} color="url(#zap-bubble-gold-gradient)" />
        <span class="zap-amount">{formatAmount(amount)}</span>
      </div>
    </div>

    {#if message}
      <div class="bubble-content">
        <ShortTextRenderer
          content={message}
          emojiTags={emojiTags}
          resolveMentionLabel={resolveMentionLabel}
        />
      </div>
    {/if}
  </div>
</div>

<!-- SVG gradient definition for zap icon -->
<svg width="0" height="0" style="position: absolute;">
  <defs>
    <linearGradient
      id="zap-bubble-gold-gradient"
      x1="0%"
      y1="0%"
      x2="100%"
      y2="100%"
    >
      <stop offset="0%" stop-color="#FFC736" />
      <stop offset="100%" stop-color="#FFA037" />
    </linearGradient>
  </defs>
</svg>

<style>
  .zap-bubble {
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

  .bubble {
    width: fit-content;
    max-width: 100%;
    min-width: 200px;
    /* Slightly lower opacity than --gradient-gold16 (0.16) for a softer look */
    background: radial-gradient(
      circle at top left,
      rgba(255, 199, 54, 0.1) 0%,
      rgba(255, 160, 55, 0.1) 100%
    );
    border-radius: 16px 16px 16px 4px;
    padding: 8px 12px;
  }

  .bubble-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 2px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .zap-amount-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .zap-amount {
    font-weight: 500;
    font-size: 1rem;
    line-height: 1.2;
    color: hsl(var(--foreground));
  }

  .author-name {
    font-weight: 600;
    font-size: 0.875rem;
    line-height: 1.2;
    text-decoration: none;
    transition: opacity 0.15s ease;
    white-space: nowrap;
    background: var(--gradient-gold);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  a.author-name:hover {
    opacity: 0.8;
  }

  .bubble-content {
    font-size: 0.9375rem;
    line-height: 1.5;
    color: hsl(var(--foreground) / 0.85);
    margin-top: 4px;
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
