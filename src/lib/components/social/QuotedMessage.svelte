<script lang="js">
/**
 * QuotedMessage - Compact quote block for displaying inside message bubbles.
 * One-line content: ShortTextPreview when there is text, emoji tags, or media (same rule as QuotedZapMessage); else plain contentPreview.
 */
import { onMount } from "svelte";
import { hexToColor, stringToColor, getProfileTextColor, rgbToCssString } from "$lib/utils/color.js";
import ShortTextPreview from "$lib/components/common/ShortTextPreview.svelte";
let {
	authorName = "Anonymous",
	authorPubkey = null,
	/** Legacy: plain string preview when rich props not used */
	contentPreview = "",
	maxPreviewLength = 80,
	/** Rich one-line: same short format as ShortTextContent (emoji at 66%, "Image"/"Video" chips) */
	content = undefined,
	emojiTags = [],
	mediaUrls = [],
	resolveMentionLabel = null,
} = $props();
/** Match QuotedZapMessage: rich path when there is text, custom emoji tags, or media chips */
const useRichPreview = $derived(
	(content ?? "").trim().length > 0 ||
		(emojiTags?.length ?? 0) > 0 ||
		(mediaUrls?.length ?? 0) > 0
);
function getProfileColor(pk, nm) {
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
    if (plain.length <= maxPreviewLength)
        return plain;
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
      {#if useRichPreview}
        <ShortTextPreview
          content={content ?? ""}
          emojiTags={emojiTags ?? []}
          mediaUrls={mediaUrls ?? []}
          {resolveMentionLabel}
          maxLines={1}
          class="quoted-preview"
        />
      {:else}
        {trimmedPreview || " "}
      {/if}
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
