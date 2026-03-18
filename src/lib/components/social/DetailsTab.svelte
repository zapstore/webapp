<script lang="js">
/**
 * DetailsTab - Shows identifiers and raw JSON data
 */
import { Copy, Check } from "$lib/components/icons";
import NpubDisplay from "$lib/components/common/NpubDisplay.svelte";
import CodeBlock from "$lib/components/common/CodeBlock.svelte";
import { highlightJson } from "$lib/utils/highlight.js";
let { shareableId = "", publicationLabel = "Publication", npub = "", pubkey = "", rawData = null, className = "", shareLink = "", repository = "", } = $props();
let publicationCopied = $state(false);
let profileCopied = $state(false);
let jsonCopied = $state(false);
let shareLinkCopied = $state(false);
let repositoryCopied = $state(false);
function formatShareableId(id) {
    if (!id || id.length < 30)
        return id || "";
    return `${id.slice(0, 16)}...${id.slice(-8)}`;
}
/** Display only: strip https:// for any URL (share link, repo, etc.); copy still gets full URL. */
function urlDisplayWithoutProtocol(url) {
    if (!url || typeof url !== "string") return "";
    return url.replace(/^https?:\/\//, "");
}
// Strip internal Dexie fields (_tags) to show the actual Nostr event
const cleanedRawData = $derived.by(() => {
    if (!rawData) return null;
    const { _tags, ...nostrEvent } = rawData;
    return nostrEvent;
});
const formattedJson = $derived(cleanedRawData ? JSON.stringify(cleanedRawData, null, 2) : "");
async function copyPublicationId() {
    if (!shareableId)
        return;
    try {
        await navigator.clipboard.writeText(shareableId);
        publicationCopied = true;
        setTimeout(() => (publicationCopied = false), 1500);
    }
    catch (e) {
        console.error("Failed to copy:", e);
    }
}
async function copyProfileId() {
    if (!npub)
        return;
    try {
        await navigator.clipboard.writeText(npub);
        profileCopied = true;
        setTimeout(() => (profileCopied = false), 1500);
    }
    catch (e) {
        console.error("Failed to copy:", e);
    }
}
async function copyShareLink() {
    if (!shareLink) return;
    try {
        await navigator.clipboard.writeText(shareLink);
        shareLinkCopied = true;
        setTimeout(() => (shareLinkCopied = false), 1500);
    } catch (e) {
        console.error("Failed to copy:", e);
    }
}
async function copyRepository() {
    if (!repository) return;
    try {
        await navigator.clipboard.writeText(repository);
        repositoryCopied = true;
        setTimeout(() => (repositoryCopied = false), 1500);
    } catch (e) {
        console.error("Failed to copy:", e);
    }
}
async function copyJson() {
    if (!formattedJson)
        return;
    try {
        await navigator.clipboard.writeText(formattedJson);
        jsonCopied = true;
        setTimeout(() => (jsonCopied = false), 1500);
    }
    catch (e) {
        console.error("Failed to copy:", e);
    }
}
const highlightedJson = $derived(highlightJson(formattedJson));
</script>

<div class="details-tab {className}">
  <h3 class="eyebrow-label section-title">IDENTIFIERS</h3>
  <div class="panel">
    <div class="identifier-row">
      <span class="identifier-label">{publicationLabel}</span>
      <span class="identifier-value">{formatShareableId(shareableId)}</span>
      <button type="button" class="copy-btn" onclick={copyPublicationId} aria-label="Copy">
        {#if publicationCopied}
          <span class="check-icon">
            <Check variant="outline" size={14} strokeWidth={2.8} color="hsl(var(--blurpleLightColor))" />
          </span>
        {:else}
          <Copy variant="outline" size={16} color="hsl(var(--white66))" />
        {/if}
      </button>
    </div>

    {#if shareLink}
      <div class="row-divider"></div>
      <div class="identifier-row">
        <span class="identifier-label">Share link</span>
        <span class="identifier-value" title={shareLink}>{urlDisplayWithoutProtocol(shareLink)}</span>
        <button type="button" class="copy-btn" onclick={copyShareLink} aria-label="Copy share link">
          {#if shareLinkCopied}
            <span class="check-icon">
              <Check variant="outline" size={14} strokeWidth={2.8} color="hsl(var(--blurpleLightColor))" />
            </span>
          {:else}
            <Copy variant="outline" size={16} color="hsl(var(--white66))" />
          {/if}
        </button>
      </div>
    {/if}

    <div class="row-divider"></div>

    <div class="identifier-row">
      <span class="identifier-label">Profile</span>
      <div class="identifier-value-right">
        <NpubDisplay {npub} {pubkey} size="md" />
      </div>
      <button type="button" class="copy-btn" onclick={copyProfileId} aria-label="Copy">
        {#if profileCopied}
          <span class="check-icon">
            <Check variant="outline" size={14} strokeWidth={2.8} color="hsl(var(--blurpleLightColor))" />
          </span>
        {:else}
          <Copy variant="outline" size={16} color="hsl(var(--white66))" />
        {/if}
      </button>
    </div>

    {#if repository}
      <div class="row-divider"></div>
      <div class="identifier-row">
        <span class="identifier-label">Repository</span>
        <span class="identifier-value" title={repository}>{urlDisplayWithoutProtocol(repository)}</span>
        <button type="button" class="copy-btn" onclick={copyRepository} aria-label="Copy repository">
          {#if repositoryCopied}
            <span class="check-icon">
              <Check variant="outline" size={14} strokeWidth={2.8} color="hsl(var(--blurpleLightColor))" />
            </span>
          {:else}
            <Copy variant="outline" size={16} color="hsl(var(--white66))" />
          {/if}
        </button>
      </div>
    {/if}
  </div>

  {#if rawData}
    <h3 class="eyebrow-label section-title raw-data-title">RAW DATA</h3>
    <CodeBlock html={highlightedJson} code={formattedJson} language="JSON" />
  {/if}
</div>

<style>
  .details-tab {
    display: flex;
    flex-direction: column;
  }

  .section-title {
    padding-left: 12px;
    margin-bottom: 8px;
  }

  .section-title.raw-data-title {
    margin-top: 12px;
  }

  .section-divider {
    width: 100%;
    height: 1.4px;
    background-color: hsl(var(--white11));
    margin: 12px 0;
  }

  .panel {
    background-color: hsl(var(--gray66));
    border-radius: 16px;
    overflow: hidden;
    padding: 0;
    margin: 0;
  }

  .identifier-row {
    display: flex;
    align-items: center;
    padding: 8px 8px 8px 14px;
    margin: 0;
  }

  .identifier-label {
    font-size: 0.875rem;
    color: hsl(var(--foreground));
    white-space: nowrap;
  }

  .identifier-value {
    font-size: 0.875rem;
    color: hsl(var(--white66));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    text-align: right;
    margin-left: 40px;
    margin-right: 14px;
  }

  .identifier-value-right {
    display: flex;
    justify-content: flex-end;
    flex: 1;
    margin-left: 40px;
    margin-right: 16px;
  }

  .row-divider {
    width: 100%;
    margin: 0;
    padding: 0;
    height: 1.4px;
    background-color: hsl(var(--white11));
  }

  .copy-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background-color: hsl(var(--white8));
    border: none;
    border-radius: 8px;
    cursor: pointer;
    flex-shrink: 0;
    transition: transform 0.15s ease;
  }

  .copy-btn:hover {
    transform: scale(1.01);
  }

  .copy-btn:active {
    transform: scale(0.97);
  }

  .copy-btn .check-icon {
    display: flex;
    animation: popIn 0.3s ease-out;
  }

  @keyframes popIn {
    0% { transform: scale(0); }
    50% { transform: scale(1.2); }
    100% { transform: scale(1); }
  }

</style>
