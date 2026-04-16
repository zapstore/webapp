<script lang="js">
/**
 * ShortTextContent - Renders short text + media + Nostr refs (forum posts and comments).
 * Content may contain URL lines → MediaBlock; nostr:naddr/nevent lines → NostrRefCard; else → ShortTextRenderer.
 * Truncation is applied across ALL segment types so media blocks and embedded cards
 * count toward the visual line limit — not just the text portions.
 */
import ShortTextRenderer from "$lib/components/common/ShortTextRenderer.svelte";
import MediaBlock from "$lib/components/common/MediaBlock.svelte";
import NostrRefCard from "$lib/components/common/NostrRefCard.svelte";
import { isLikelyDirectMediaUrl } from "$lib/utils/short-text-parser.js";

const LINES_LIMIT = 16;
const MEDIA_LINES = 10;
const NOSTR_REF_LINES = 10;
const CHARS_PER_LINE = 60;

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
	disableTruncation = false,
	forceExpanded = false,
	readMorePassthrough = false,
} = $props();

let expanded = $state(false);
$effect(() => {
	if (forceExpanded) expanded = true;
});

/** Split content into segments: text blocks, media lines, and nostr_ref lines. */
const allSegments = $derived.by(() => {
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

/** Estimate how many visual lines a text block occupies. */
function countTextLines(text) {
	let total = 0;
	for (const para of text.split('\n')) {
		total += Math.max(1, Math.ceil(para.length / CHARS_PER_LINE));
	}
	return total;
}

/** Return `text` truncated to at most `limit` visual lines. */
function truncateText(text, limit) {
	const paragraphs = text.split('\n');
	let remaining = limit;
	let paraStart = 0;
	for (let p = 0; p < paragraphs.length; p++) {
		const para = paragraphs[p];
		const paraLines = Math.max(1, Math.ceil(para.length / CHARS_PER_LINE));
		if (paraLines > remaining) {
			const truncatedPara = para.slice(0, remaining * CHARS_PER_LINE);
			return text.slice(0, paraStart) + truncatedPara;
		}
		remaining -= paraLines;
		paraStart += para.length + 1; // +1 for '\n'
	}
	return text;
}

/** Returns segments to actually render plus whether truncation occurred. */
function buildDisplay(segs, isExpanded) {
	if (isExpanded) return { segs, isTruncated: false };
	let lines = 0;
	const out = [];
	for (const seg of segs) {
		if (seg.type === 'text') {
			const textLines = countTextLines(seg.value);
			if (lines + textLines > LINES_LIMIT) {
				const remaining = LINES_LIMIT - lines;
				if (remaining > 0) {
					const truncatedValue = truncateText(seg.value, remaining);
					if (truncatedValue) out.push({ ...seg, value: truncatedValue });
				}
				return { segs: out, isTruncated: true };
			}
			lines += textLines;
			out.push(seg);
		} else if (seg.type === 'media') {
			if (lines + MEDIA_LINES > LINES_LIMIT) {
				return { segs: out, isTruncated: true };
			}
			lines += MEDIA_LINES;
			out.push(seg);
		} else if (seg.type === 'nostr_ref') {
			if (lines + NOSTR_REF_LINES > LINES_LIMIT) {
				return { segs: out, isTruncated: true };
			}
			lines += NOSTR_REF_LINES;
			out.push(seg);
		}
	}
	return { segs: out, isTruncated: false };
}

const display = $derived(
	disableTruncation
		? { segs: allSegments, isTruncated: false }
		: buildDisplay(allSegments, expanded)
);

/** Stable — not affected by expanded state — so the toggle never disappears. */
const wasTruncated = $derived(
	!disableTruncation && buildDisplay(allSegments, false).isTruncated
);

const orderedMediaUrls = $derived(allSegments.filter((s) => s.type === "media").map((s) => s.url));
</script>

<div class="short-text-content {className}" data-short-text-content>
	{#each display.segs as segment, segIdx (segIdx)}
		{#if segment.type === "text"}
			{#if segment.value !== ""}
				<div class="short-text-content-text">
				<ShortTextRenderer
					content={segment.value}
					{emojiTags}
					{resolveMentionLabel}
					disableTruncation={true}
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
	{#if wasTruncated}
		{#if readMorePassthrough}
			<span class="read-more-hint" aria-hidden="true">Read more</span>
		{:else}
			<button
				class="read-more-btn"
				onclick={(e) => {
					e.stopPropagation();
					expanded = !expanded;
				}}>{expanded ? 'Read less' : 'Read more'}</button>
		{/if}
	{/if}
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

	.read-more-btn,
	.read-more-hint {
		display: block;
		background: none;
		border: none;
		padding: 0;
		font-size: inherit;
		color: var(--white33);
		line-height: 1.5;
		text-align: left;
		align-self: flex-start;
	}

	.read-more-btn {
		cursor: pointer;
	}

	.read-more-btn:hover {
		color: color-mix(in srgb, var(--white) 55%, transparent);
	}

	.read-more-hint {
		pointer-events: none;
		user-select: none;
	}
</style>
