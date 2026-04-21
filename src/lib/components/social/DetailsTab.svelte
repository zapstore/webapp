<script lang="js">
/**
 * DetailsTab - Shows identifiers and raw JSON data
 */
import { Copy, Check, ChevronDown } from "$lib/components/icons";
import NpubDisplay from "$lib/components/common/NpubDisplay.svelte";
import CodeBlock from "$lib/components/common/CodeBlock.svelte";
import Modal from "$lib/components/common/Modal.svelte";
import { highlightJson } from "$lib/utils/highlight.js";
let {
	shareableId = "",
	publicationLabel = "Publication",
	npub = "",
	pubkey = "",
	rawData = null,
	className = "",
	shareLink = "",
	repository = "",
	panelBackground = "gray66",
	/** @type {Array<{id: string, naddr?: string, version: string, rawEvent?: object}>} */
	releases = [],
} = $props();
let publicationCopied = $state(false);
let profileCopied = $state(false);
let shareLinkCopied = $state(false);
let repositoryCopied = $state(false);
let releasesModalOpen = $state(false);
/** Tracks which modal row copy was last triggered: { idx, type: 'id' | 'json' } */
let modalCopied = $state(null);
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
    const { _tags: _tagsField, ...nostrEvent } = rawData;
    return nostrEvent;
});
const formattedJson = $derived(cleanedRawData ? JSON.stringify(cleanedRawData, null, 2) : "");
const panelBgClass = $derived(panelBackground === "black33" ? "panel-black33" : "panel-gray66");
const codeBlockBackground = $derived(panelBackground === "black33" ? "black33" : "gray33");

let highlightedJson = $state('');
$effect(() => {
	if (formattedJson) {
		highlightJson(formattedJson).then(html => {
			highlightedJson = html;
		});
	} else {
		highlightedJson = '';
	}
});

async function copyPublicationId() {
    if (!shareableId) return;
    try {
        await navigator.clipboard.writeText(shareableId);
        publicationCopied = true;
        setTimeout(() => (publicationCopied = false), 1500);
    } catch (e) { console.error("Failed to copy:", e); }
}
async function copyProfileId() {
    if (!npub) return;
    try {
        await navigator.clipboard.writeText(npub);
        profileCopied = true;
        setTimeout(() => (profileCopied = false), 1500);
    } catch (e) { console.error("Failed to copy:", e); }
}
async function copyShareLink() {
    if (!shareLink) return;
    try {
        await navigator.clipboard.writeText(shareLink);
        shareLinkCopied = true;
        setTimeout(() => (shareLinkCopied = false), 1500);
    } catch (e) { console.error("Failed to copy:", e); }
}
async function copyRepository() {
    if (!repository) return;
    try {
        await navigator.clipboard.writeText(repository);
        repositoryCopied = true;
        setTimeout(() => (repositoryCopied = false), 1500);
    } catch (e) { console.error("Failed to copy:", e); }
}
function releaseNaddr(release) {
    return release?.naddr || release?.id || '';
}
async function copyModalReleaseId(idx) {
    const val = releaseNaddr(releases[idx]);
    if (!val) return;
    try {
        await navigator.clipboard.writeText(val);
        modalCopied = { idx, type: 'id' };
        setTimeout(() => (modalCopied = null), 1500);
    } catch (e) { console.error("Failed to copy:", e); }
}
async function copyModalReleaseJson(idx) {
    const raw = releases[idx]?.rawEvent;
    if (!raw) return;
    try {
        const { _tags: _, ...nostrEvent } = raw;
        await navigator.clipboard.writeText(JSON.stringify(nostrEvent, null, 2));
        modalCopied = { idx, type: 'json' };
        setTimeout(() => (modalCopied = null), 1500);
    } catch (e) { console.error("Failed to copy:", e); }
}
</script>

<div class="details-tab {className}">
  <h3 class="eyebrow-label section-title">IDENTIFIERS</h3>
  <div class="panel {panelBgClass}">
    <div class="identifier-row">
      <span class="identifier-label">{publicationLabel}</span>
      <span class="identifier-value">{formatShareableId(shareableId)}</span>
      <button type="button" class="copy-btn" onclick={copyPublicationId} aria-label="Copy">
        {#if publicationCopied}
          <span class="check-icon">
            <Check variant="outline" size={14} strokeWidth={2.8} color="var(--blurpleLightColor)" />
          </span>
        {:else}
          <Copy variant="outline" size={16} color="var(--white66)" />
        {/if}
      </button>
    </div>

    {#if releases.length > 0}
      <div class="row-divider"></div>
      <div class="identifier-row">
        <button
          type="button"
          class="release-label-btn"
          onclick={() => (releasesModalOpen = true)}
          aria-label="View all releases"
        >
          <span class="identifier-label">Release</span>
          {#if releases[0]?.version}
            <span class="release-version-tag">{releases[0].version}</span>
          {/if}
          <span class="release-chevron">
            <ChevronDown variant="outline" strokeWidth={2.2} size={12} color="var(--white33)" />
          </span>
        </button>
        <span class="identifier-value">{formatShareableId(releaseNaddr(releases[0]))}</span>
        <button type="button" class="copy-btn" onclick={() => copyModalReleaseId(0)} aria-label="Copy release ID">
          {#if modalCopied?.idx === 0 && modalCopied?.type === 'id'}
            <span class="check-icon">
              <Check variant="outline" size={14} strokeWidth={2.8} color="var(--blurpleLightColor)" />
            </span>
          {:else}
            <Copy variant="outline" size={16} color="var(--white66)" />
          {/if}
        </button>
      </div>
    {/if}

    {#if shareLink}
      <div class="row-divider"></div>
      <div class="identifier-row">
        <span class="identifier-label">Share link</span>
        <span class="identifier-value" title={shareLink}>{urlDisplayWithoutProtocol(shareLink)}</span>
        <button type="button" class="copy-btn" onclick={copyShareLink} aria-label="Copy share link">
          {#if shareLinkCopied}
            <span class="check-icon">
              <Check variant="outline" size={14} strokeWidth={2.8} color="var(--blurpleLightColor)" />
            </span>
          {:else}
            <Copy variant="outline" size={16} color="var(--white66)" />
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
            <Check variant="outline" size={14} strokeWidth={2.8} color="var(--blurpleLightColor)" />
          </span>
        {:else}
          <Copy variant="outline" size={16} color="var(--white66)" />
        {/if}
      </button>
    </div>

    {#if repository}
      <div class="row-divider"></div>
      <div class="identifier-row">
        <span class="identifier-label">Repository</span>
        <a
          class="identifier-value identifier-link"
          href={repository}
          title={repository}
          target="_blank"
          rel="noopener noreferrer"
        >{urlDisplayWithoutProtocol(repository)}</a>
        <button type="button" class="copy-btn" onclick={copyRepository} aria-label="Copy repository">
          {#if repositoryCopied}
            <span class="check-icon">
              <Check variant="outline" size={14} strokeWidth={2.8} color="var(--blurpleLightColor)" />
            </span>
          {:else}
            <Copy variant="outline" size={16} color="var(--white66)" />
          {/if}
        </button>
      </div>
    {/if}
  </div>

  {#if rawData}
    <h3 class="eyebrow-label section-title raw-data-title">RAW DATA</h3>
    <CodeBlock
      html={highlightedJson}
      code={formattedJson}
      language="JSON"
      background={codeBlockBackground}
    />
  {/if}
</div>

<!-- Releases modal -->
{#if releases.length > 0}
  <Modal
    bind:open={releasesModalOpen}
    title="Releases"
    ariaLabel="Releases"
    maxHeight={72}
    closeButtonMobile={true}
  >
    <div class="releases-modal-list">
      {#each releases as release, idx (release.id ?? idx)}
        <div class="releases-modal-row">
          <div class="releases-modal-left">
            {#if release.version}
              <span class="releases-modal-version">{release.version}</span>
            {/if}
            <span class="releases-modal-id">{formatShareableId(releaseNaddr(release))}</span>
          </div>
          <div class="releases-modal-actions">
            <button
              type="button"
              class="btn-secondary-xs release-action-btn"
              onclick={() => copyModalReleaseId(idx)}
              aria-label="Copy ID"
            >
              {#if modalCopied?.idx === idx && modalCopied?.type === 'id'}
                <Check variant="outline" size={12} strokeWidth={2.8} color="var(--blurpleLightColor)" />
              {:else}
                ID
              {/if}
            </button>
            {#if release.rawEvent}
              <button
                type="button"
                class="btn-secondary-xs release-action-btn"
                onclick={() => copyModalReleaseJson(idx)}
                aria-label="Copy JSON"
              >
                {#if modalCopied?.idx === idx && modalCopied?.type === 'json'}
                  <Check variant="outline" size={12} strokeWidth={2.8} color="var(--blurpleLightColor)" />
                {:else}
                  JSON
                {/if}
              </button>
            {/if}
          </div>
        </div>
        {#if idx < releases.length - 1}
          <div class="releases-modal-divider"></div>
        {/if}
      {/each}
    </div>
  </Modal>
{/if}

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
    background-color: var(--white11);
    margin: 12px 0;
  }

  .panel {
    border-radius: 16px;
    overflow: hidden;
    padding: 0;
    margin: 0;
  }

  .panel-gray66 {
    background-color: var(--gray66);
  }

  .panel-black33 {
    background-color: var(--black33);
  }

  .identifier-row {
    display: flex;
    align-items: center;
    padding: 8px 8px 8px 14px;
    margin: 0;
  }

  .identifier-label {
    font-size: 0.875rem;
    color: var(--white);
    white-space: nowrap;
  }

  .identifier-value {
    font-size: 0.875rem;
    color: var(--white66);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    text-align: right;
    margin-left: 40px;
    margin-right: 14px;
  }

  .identifier-link {
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .identifier-link:hover {
    color: var(--white);
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
    background-color: var(--white11);
  }

  .copy-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background-color: var(--white8);
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

  /* Release label button */
  .release-label-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    flex-shrink: 0;
  }

  .release-version-tag {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--white33);
    background: var(--white8);
    border-radius: 5px;
    padding: 1px 5px;
    line-height: 1.4;
    white-space: nowrap;
  }

  .release-chevron {
    display: flex;
    align-items: center;
  }

  /* Releases modal */
  .releases-modal-list {
    padding: 8px 16px 8px;
    display: flex;
    flex-direction: column;
  }

  @media (min-width: 768px) {
    .releases-modal-list {
      padding: 8px 20px 8px;
    }
  }

  .releases-modal-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
  }

  .releases-modal-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .releases-modal-version {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--white);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .releases-modal-id {
    font-size: 0.8125rem;
    color: var(--white33);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .releases-modal-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .release-action-btn {
    min-width: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .releases-modal-divider {
    height: 1.4px;
    background-color: var(--white11);
    margin: 0;
  }

</style>
