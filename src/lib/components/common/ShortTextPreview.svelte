<script lang="js">
	/**
	 * ShortTextPreview - One-line (or max-lines) inline preview of short text + media.
	 * For cards and quoted messages: text + mentions + emoji at 66% opacity + Camera icon + "Image"/"Video" text (white33).
	 * Same parser as ShortTextContent; no block media, no lightbox.
	 */
	import { onMount } from 'svelte';
	import { parseShortText, isLikelyDirectMediaUrl, splitTextAutolinkUrls } from '$lib/utils/short-text-parser.js';
	import { stripUrlForDisplay } from '$lib/utils/url.js';
	import { hexToColor, getProfileTextColor, rgbToCssString } from '$lib/utils/color.js';
	import Camera from '$lib/components/icons/Camera.svelte';
	import NostrRefPreviewChip from '$lib/components/common/NostrRefPreviewChip.svelte';

	/** Infer "image" or "video" from URL for chip label */
	function mediaLabel(url) {
		if (!url || typeof url !== 'string') return 'Media';
		const u = url.toLowerCase();
		if (
			u.includes('video') ||
			u.endsWith('.mp4') ||
			u.endsWith('.webm') ||
			u.endsWith('.mov') ||
			u.includes('.mp4') ||
			u.includes('.webm')
		)
			return 'Video';
		return 'Image';
	}

	let {
		content = '',
		emojiTags = [],
		/** Media URLs (for chips when content has no inline URLs, or legacy) */
		mediaUrls = [],
		resolveMentionLabel = null,
		maxLines = 1,
		class: className = ''
	} = $props();

	let isDarkMode = $state(true);
	onMount(() => {
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		isDarkMode = mq.matches;
		const handle = (e) => (isDarkMode = e.matches);
		mq.addEventListener('change', handle);
		return () => mq.removeEventListener('change', handle);
	});

	/** Segments: content may have URL lines inline; split and build text + media chips in order */
	const previewSegments = $derived.by(() => {
		const raw = (content ?? '').trim();
		const lines = raw ? raw.split('\n') : [];
		const out = [];
		let textBuf = [];
		for (const line of lines) {
			if (isLikelyDirectMediaUrl(line)) {
				if (textBuf.length) {
					out.push({ type: 'text', value: textBuf.join('\n') });
					textBuf = [];
				}
				out.push({ type: 'media', url: line.trim() });
			} else {
				textBuf.push(line);
			}
		}
		if (textBuf.length) out.push({ type: 'text', value: textBuf.join('\n') });
		return out;
	});
	/** If no inline URLs in content, append chips from mediaUrls (legacy) */
	const trailingUrls = $derived.by(() => {
		const hasInlineUrls = (content ?? '').split('\n').some((l) => isLikelyDirectMediaUrl(l));
		return hasInlineUrls ? [] : (mediaUrls ?? []);
	});

	function mentionLabel(segment) {
		return resolveMentionLabel?.(segment.pubkey) ?? segment.pubkey.slice(0, 8);
	}
	function mentionStyle(pubkey) {
		const rgb = hexToColor(pubkey);
		const textRgb = getProfileTextColor(rgb, isDarkMode);
		return `color: ${rgbToCssString(textRgb)}`;
	}
</script>

<div
	class="short-text-preview {className}"
	class:one-line={maxLines === 1}
	data-short-text-preview
	style={maxLines > 1 ? `-webkit-line-clamp: ${maxLines}; line-clamp: ${maxLines};` : ''}
>
	{#each previewSegments as segment, segIdx (segIdx)}
		{#if segment.type === 'text'}
			{#each parseShortText({ text: segment.value, emojiTags }) as part, pIdx (pIdx)}
				{#if part.type === 'text'}
					{#each splitTextAutolinkUrls(part.value) as uchunk, uIdx (`${pIdx}-${uIdx}`)}
						{#if uchunk.type === 'text'}
							<span class="preview-text">{uchunk.value}</span>
						{:else if uchunk.type === 'url'}
							<a
								href={uchunk.href}
								class="preview-url"
								target="_blank"
								rel="noopener noreferrer"
								>{stripUrlForDisplay(uchunk.href)}</a
							>
						{/if}
					{/each}
				{:else if part.type === 'mention'}
					<a href="/profile/{part.npub}" class="preview-mention" style={mentionStyle(part.pubkey)}
						>@{mentionLabel(part)}</a
					>
				{:else if part.type === 'emoji'}
					{#if part.url}
						<img
							src={part.url}
							alt=":{part.shortcode}:"
							class="preview-emoji"
							loading="lazy"
							decoding="async"
						/>
					{:else}
						<span class="preview-emoji-fallback">:{part.shortcode}:</span>
					{/if}
				{:else if part.type === 'nostr_ref'}
					<NostrRefPreviewChip naddrRaw={part.raw} />
				{/if}
			{/each}
		{:else if segment.type === 'media'}
			<span class="preview-media-inline">
				<span class="preview-media-icon-wrap"><Camera color="var(--white33)" size={16} /></span
				>
				<span class="preview-media-label">{mediaLabel(segment.url)}</span>
			</span>
		{/if}
	{/each}
	{#each trailingUrls as url (url)}
		<span class="preview-media-inline">
			<span class="preview-media-icon-wrap"><Camera color="var(--white33)" size={16} /></span>
			<span class="preview-media-label">{mediaLabel(url)}</span>
		</span>
	{/each}
</div>

<style>
	.short-text-preview {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		overflow: hidden;
		word-wrap: break-word;
		font-size: inherit;
		line-height: 1.4;
		color: var(--white66);
	}
	.short-text-preview.one-line {
		-webkit-line-clamp: 1;
		line-clamp: 1;
		white-space: normal;
	}
	.short-text-preview:not(.one-line) {
		white-space: pre-line;
	}
	.preview-url {
		color: var(--blurpleLightColor66);
		text-decoration: none;
		word-break: break-word;
	}
	.preview-url:hover {
		text-decoration: underline;
	}
	.preview-mention {
		font-weight: 500;
		text-decoration: none;
	}
	.preview-mention:hover {
		text-decoration: underline;
	}
	.preview-emoji {
		width: 1.2em;
		height: 1.2em;
		vertical-align: -0.2em;
		margin: 0 2px;
		display: inline;
		opacity: 0.66;
	}
	.preview-emoji-fallback {
		opacity: 0.66;
		font-size: 0.95em;
	}
	.preview-media-inline {
		display: inline;
		margin: 0 0.35em;
		color: var(--white33);
		font-size: inherit;
		font-weight: 500;
		white-space: nowrap;
	}
	.preview-media-icon-wrap {
		display: inline-block;
		width: 16px;
		height: 16px;
		vertical-align: -0.2em;
		margin-right: 0.2em;
	}
	.preview-media-icon-wrap :global(div),
	.preview-media-icon-wrap :global(svg) {
		display: block;
		width: 100% !important;
		height: 100% !important;
		max-width: 100%;
		max-height: 100%;
	}
</style>
