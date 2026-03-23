<script lang="js">
/**
 * ShortTextContent - Renders short text + media + Nostr refs (forum posts and comments).
 * Content may contain URL lines → MediaBlock; nostr:naddr/nevent lines → NostrRefCard; else → ShortTextRenderer.
 */
import ShortTextRenderer from "$lib/components/common/ShortTextRenderer.svelte";
import MediaBlock from "$lib/components/common/MediaBlock.svelte";
import NostrRefCard from "$lib/components/common/NostrRefCard.svelte";
import { isLikelyDirectMediaUrl } from "$lib/utils/short-text-parser.js";

function isNostrRefLine(line) {
	const t = (line ?? "").trim();
	return /^nostr:n(addr|event)[a-z0-9]+$/i.test(t);
}

let {
	content = "",
	emojiTags = [],
	mediaUrls: _mediaUrls = [],
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
		if (isLikelyDirectMediaUrl(line)) {
			if (textBuf.length) {
				out.push({ type: "text", value: textBuf.join("\n") });
				textBuf = [];
			}
			out.push({ type: "media", url: line.trim() });
		} else if (isNostrRefLine(line)) {
			if (textBuf.length) {
				out.push({ type: "text", value: textBuf.join("\n") });
				textBuf = [];
			}
			out.push({ type: "nostr_ref", value: line.trim() });
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
	{#each segments as segment, segIdx (segIdx)}
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
		{:else if segment.type === "nostr_ref"}
			<div class="short-text-content-nostr-ref">
				<NostrRefCard naddrRaw={segment.value} />
			</div>
		{/if}
	{/each}
</div>

<style>
	.short-text-content {
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.short-text-content-text {
		font-size: inherit;
		line-height: inherit;
	}
	.short-text-content-media {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-items: flex-start;
		margin-top: 4px;
	}
	.short-text-content-media-slot {
		flex-shrink: 0;
	}
	.short-text-content-nostr-ref {
		margin: 0;
		margin-top: 4px;
	}
</style>
