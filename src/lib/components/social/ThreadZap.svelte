<script lang="js">
/**
 * ThreadZap - Thread-style zap display for the top of opened comment threads on a zap.
 * Same layout as ThreadComment; only difference is amount (zap icon + sats) in the top right.
 */
import { Loader2 } from "lucide-svelte";
import * as nip19 from "nostr-tools/nip19";
import ProfilePic from "$lib/components/common/ProfilePic.svelte";
import Timestamp from "$lib/components/common/Timestamp.svelte";
import ShortTextRenderer from "$lib/components/common/ShortTextRenderer.svelte";
import { Zap } from "$lib/components/icons";
let { pictureUrl = null, name = "", pubkey = null, amount = 0, timestamp = null, profileUrl = "", version: _version = "", className = "", loading = false, pending = false, content = "", emojiTags = [], resolveMentionLabel, } = $props();
function formatNpubDisplay(npubStr) {
    const s = String(npubStr || "").trim();
    if (!s)
        return "";
    const afterPrefix = s.startsWith("npub1") ? s.slice(5, 8) : s.slice(0, 3);
    return s.startsWith("npub1") ? `npub1${afterPrefix}…${s.slice(-6)}` : `${afterPrefix}…${s.slice(-6)}`;
}
const displayAuthorName = $derived(name?.trim()
    ? name.trim()
    : (pubkey?.trim()
        ? formatNpubDisplay(nip19.npubEncode(pubkey))
        : ""));
function formatAmount(val) {
    if (val >= 1000000)
        return `${(val / 1000000).toFixed(val % 1000000 === 0 ? 0 : 1)}M`;
    if (val >= 1000)
        return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}K`;
    return val.toLocaleString();
}
</script>

<svg width="0" height="0" style="position: absolute;" aria-hidden="true">
  <defs>
    <linearGradient id="thread-zap-gold-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFC736" />
      <stop offset="100%" stop-color="#FFA037" />
    </linearGradient>
  </defs>
</svg>

<div class="thread-zap {className}">
  <div class="row-author">
    <div class="profile-column">
      {#if profileUrl}
        <a href={profileUrl} class="profile-link">
          <ProfilePic {pictureUrl} {name} {pubkey} {loading} size="smMd" />
        </a>
      {:else}
        <ProfilePic {pictureUrl} {name} {pubkey} {loading} size="smMd" />
      {/if}
    </div>
    <div class="author-info">
      <div class="author-top">
        <div class="author-name-and-time">
          {#if profileUrl}
            <a href={profileUrl} class="author-name">{displayAuthorName}</a>
          {:else}
            <span class="author-name">{displayAuthorName}</span>
          {/if}
          {#if !pending}
            <Timestamp {timestamp} size="xs" className="author-timestamp" />
          {:else}
            <span class="publish-spinner" aria-label="Confirming zap">
              <Loader2 class="h-3.5 w-3.5 animate-spin" style="color: var(--blurpleLightColor);" />
            </span>
          {/if}
        </div>
        <div class="top-right-amount">
          <Zap variant="fill" size={20} color="url(#thread-zap-gold-gradient)" />
          <span class="zap-amount">{formatAmount(amount)}</span>
        </div>
      </div>
    </div>
  </div>

  {#if content?.trim()}
    <div class="content">
      <ShortTextRenderer
        content={content}
        {emojiTags}
        {resolveMentionLabel}
      />
    </div>
  {/if}
</div>

<style>
  .thread-zap {
    display: flex;
    flex-direction: column;
  }

  .row-author {
    display: flex;
    align-items: center;
    gap: 10px;
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
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .author-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .author-name-and-time {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
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
    background: var(--gradient-gold);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  a.author-name:hover {
    opacity: 0.8;
  }

  .top-right-amount {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .top-right-amount .zap-amount {
    font-weight: 600;
    font-size: 1.25rem;
    line-height: 1.2;
    color: var(--white);
  }

  .publish-spinner {
    display: inline-flex;
    align-items: center;
  }

  :global(.animate-spin) {
    animation: thread-zap-spin 1s linear infinite;
  }

  @keyframes thread-zap-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .content {
    margin-top: 8px;
    font-size: 0.9375rem;
    line-height: 1.5;
    color: color-mix(in srgb, var(--white) 85%, transparent);
  }

  .content :global(p) {
    margin: 0;
  }

  .content :global(p + p) {
    margin-top: 0.5rem;
  }

  .content :global(a) {
    color: var(--blurpleColor);
    text-decoration: none;
  }

  .content :global(a:hover) {
    text-decoration: underline;
  }
</style>
