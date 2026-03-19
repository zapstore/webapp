<script lang="js">
/**
 * ShortTextContent - Renders short text + media (forum posts and comments).
 * Content string may contain URLs on their own lines (inline where user placed them).
 * We split by newlines: URL lines → MediaBlock; other lines → ShortTextRenderer.
 */
import ShortTextRenderer from "$lib/components/common/ShortTextRenderer.svelte";
import MediaBlock from "$lib/components/common/MediaBlock.svelte";

function isMediaUrl(line) {
	const t = (line ?? "").trim();
	return t.startsWith("http://") || t.startsWith("https://");
}

let {
	content = "",
	emojiTags = [],
	mediaUrls = [],
	resolveMentionLabel = null,
	onMediaClick = null,
	class: className = "",
} = $props();

/** Split content into segments: text blocks and inline URL lines (media). */
const segments = $derived.by(() => {
	const raw = (content ?? "").trim();
	if (!raw) return [];
	const lines = raw.split("\n");
	const out = [];
	let textBuf = [];
	for (const line of lines) {
		if (isMediaUrl(line)) {
			if (textBuf.length) {
				out.push({ type: "text", value: textBuf.join("\n") });
				textBuf = [];
			}
			out.push({ type: "media", url: line.trim() });
		} else {
			textBuf.push(line);
		}
	}
	if (textBuf.length)
		out.push({ type: "text", value: textBuf.join("\n") });
	return out;
});
const orderedMediaUrls = $derived(segments.filter((s) => s.type === "media").map((s) => s.url));
</script>

<div class="short-text-content {className}" data-short-text-content>
	{#each segments as segment, i}
		{#if segment.type === "text"}
			{#if segment.value !== ""}
				<div class="short-text-content-text">
					<ShortTextRenderer
						content={segment.value}
						{emojiTags}
						{resolveMentionLabel}
					/>
				</div>
			{/if}
		{:else if segment.type === "media"}
			<div class="short-text-content-media">
				<div class="short-text-content-media-slot">
					<MediaBlock
						url={segment.url}
						removable={false}
						onClick={onMediaClick ? ({ url: u, type: t }) => onMediaClick({ url: u, type: t, urls: orderedMediaUrls }) : undefined}
					/>
				</div>
			</div>
		{/if}
	{/each}
</div>

<style>
	.short-text-content {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.short-text-content-text {
		font-size: inherit;
		line-height: inherit;
	}
	.short-text-content-media {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: flex-start;
	}
	.short-text-content-media-slot {
		flex-shrink: 0;
	}
</style>
