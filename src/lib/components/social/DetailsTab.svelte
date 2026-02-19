<script lang="js">
/**
 * DetailsTab - Shows identifiers and raw JSON data
 */
import { Copy, Check } from "$lib/components/icons";
import NpubDisplay from "$lib/components/common/NpubDisplay.svelte";
let { shareableId = "", publicationLabel = "Publication", npub = "", pubkey = "", rawData = null, className = "", } = $props();
let publicationCopied = $state(false);
let profileCopied = $state(false);
let jsonCopied = $state(false);
function formatShareableId(id) {
    if (!id || id.length < 30)
        return id || "";
    return `${id.slice(0, 16)}...${id.slice(-8)}`;
}
const formattedJson = $derived(rawData ? JSON.stringify(rawData, null, 2) : "");
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
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
function renderJson(value, indent) {
    const indentStr = "  ".repeat(indent);
    const nextIndent = "  ".repeat(indent + 1);
    if (value === null) {
        return `<span class="hl-value">null</span>`;
    }
    if (typeof value === "boolean") {
        return `<span class="hl-value">${value}</span>`;
    }
    if (typeof value === "number") {
        return `<span class="hl-value">${value}</span>`;
    }
    if (typeof value === "string") {
        return `<span class="hl-punct">"</span><span class="hl-value">${escapeHtml(value)}</span><span class="hl-punct">"</span>`;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return `<span class="hl-bracket">[</span><span class="hl-bracket">]</span>`;
        }
        const items = value.map((item, i) => {
            const comma = i < value.length - 1 ? `<span class="hl-punct">,</span>` : "";
            return `${nextIndent}${renderJson(item, indent + 1)}${comma}`;
        });
        return `<span class="hl-bracket">[</span>\n${items.join("\n")}\n${indentStr}<span class="hl-bracket">]</span>`;
    }
    if (typeof value === "object") {
        const keys = Object.keys(value);
        if (keys.length === 0) {
            return `<span class="hl-brace">{</span><span class="hl-brace">}</span>`;
        }
        const entries = keys.map((key, i) => {
            const comma = i < keys.length - 1 ? `<span class="hl-punct">,</span>` : "";
            const keyHtml = `<span class="hl-punct">"</span><span class="hl-key">${escapeHtml(key)}</span><span class="hl-punct">"</span>`;
            const colonHtml = `<span class="hl-punct">:</span>`;
            return `${nextIndent}${keyHtml}${colonHtml} ${renderJson(value[key], indent + 1)}${comma}`;
        });
        return `<span class="hl-brace">{</span>\n${entries.join("\n")}\n${indentStr}<span class="hl-brace">}</span>`;
    }
    return escapeHtml(String(value));
}
function highlightJson(json) {
    if (!json)
        return "";
    try {
        const parsed = JSON.parse(json);
        return renderJson(parsed, 0);
    }
    catch {
        return escapeHtml(json);
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
  </div>

  {#if rawData}
    <h3 class="eyebrow-label section-title raw-data-title">RAW DATA</h3>
    <div class="code-block">
      <button type="button" class="code-copy-btn" onclick={copyJson} aria-label="Copy JSON">
        {#if jsonCopied}
          <span class="check-icon">
            <Check variant="outline" size={14} strokeWidth={2.8} color="hsl(var(--blurpleLightColor))" />
          </span>
        {:else}
          <Copy variant="outline" size={16} color="hsl(var(--white66))" />
        {/if}
      </button>
      <span class="eyebrow-label code-language">JSON</span>
      <div class="code-scroll">
        <pre><code>{@html highlightedJson}</code></pre>
      </div>
    </div>
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

  .code-block {
    position: relative;
    background-color: hsl(var(--gray33));
    border-radius: 16px;
    border: 0.33px solid hsl(var(--white16));
    padding: 6px 10px;
  }

  .code-copy-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background-color: hsl(var(--white8));
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: transform 0.15s ease;
  }

  .code-copy-btn:hover {
    transform: scale(1.01);
  }

  .code-copy-btn:active {
    transform: scale(0.97);
  }

  .code-copy-btn .check-icon {
    display: flex;
    animation: popIn 0.3s ease-out;
  }

  .code-language {
    font-family: var(--font-sans);
    color: hsl(var(--white33));
    display: block;
    margin-bottom: 2px;
  }

  .code-scroll {
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: hsl(var(--white16)) transparent;
  }

  .code-scroll pre {
    margin: 0;
  }

  .code-scroll code {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    font-weight: 400;
    line-height: 1.5;
    letter-spacing: 0.15px;
    color: hsl(var(--foreground));
    white-space: pre;
  }

  .code-scroll :global(.hl-key) {
    color: hsl(var(--blurpleLightColor));
  }

  .code-scroll :global(.hl-value) {
    color: hsl(0 0% 100% / 0.9);
  }

  .code-scroll :global(.hl-punct) {
    color: hsl(var(--white66));
  }

  .code-scroll :global(.hl-brace) {
    color: hsl(var(--goldColor));
  }

  .code-scroll :global(.hl-bracket) {
    color: hsl(var(--goldColor66));
  }
</style>
