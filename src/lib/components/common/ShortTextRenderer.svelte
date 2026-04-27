<script lang="js">
	/**
	 * ShortTextRenderer - Renders short text with mentions, custom emoji, and nostr refs.
	 * Use in comments, zap messages, profile descriptions, etc.
	 * Matches ShortTextInput display: profile-colored @mentions, inline emoji, block cards for nevent/naddr.
	 *
	 * Truncation props:
	 *   disableTruncation — never truncate; full content always shown (e.g. thread modal root comment).
	 *   forceExpanded     — start in expanded state; user can still collapse (e.g. activity-feed-targeted comment).
	 *   readMorePassthrough — "Read more" hint is non-interactive; parent click handler takes over (e.g. feed bubbles).
	 */
	import { onMount } from 'svelte';
	import {
		parseShortText,
		splitTextAutolinkUrls,
		isShortTextOnlyOneOrTwoEmojis
	} from '$lib/utils/short-text-parser.js';
	import { stripUrlForDisplay } from '$lib/utils/url.js';
	import { hexToColor, getProfileTextColor, rgbToCssString } from '$lib/utils/color.js';
	import NostrRefCard from '$lib/components/common/NostrRefCard.svelte';
	let {
		content = '',
		emojiTags = [],
		resolveMentionLabel,
		class: className = '',
		disableTruncation = false,
		forceExpanded = false,
		readMorePassthrough = false
	} = $props();
	let isDarkMode = $state(true);
	let expanded = $state(false);
	let failedEmojiIdx = $state(/** @type {Set<number>} */ (new Set()));
	$effect(() => {
		if (forceExpanded) expanded = true;
	});
	onMount(() => {
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		isDarkMode = mq.matches;
		const handle = (e) => (isDarkMode = e.matches);
		mq.addEventListener('change', handle);
		return () => mq.removeEventListener('change', handle);
	});
	const input = $derived({ text: content, emojiTags });
	const segments = $derived(parseShortText(input));
	const magnifyFewEmojis = $derived(isShortTextOnlyOneOrTwoEmojis(segments));

	const LINES_LIMIT = 16;
	const NOSTR_REF_LINES = 10;
	// Rough estimate of characters that fit on one display line. Conservative (narrow)
	// so dense prose truncates correctly across different container widths.
	const CHARS_PER_LINE = 60;

	/** Returns truncated segments and whether truncation occurred. Pure line counting — no DOM.
	 *  Each paragraph (text between \n) contributes ceil(chars/CHARS_PER_LINE) visual lines,
	 *  which catches wrapping prose that contains few or no explicit newlines.
	 */
	function buildDisplaySegments(segs, isExpanded) {
		if (isExpanded) return { segs, isTruncated: false };
		let lines = 0;
		for (let i = 0; i < segs.length; i++) {
			const seg = segs[i];
			if (seg.type === 'text') {
				const paragraphs = seg.value.split('\n');
				let paraStart = 0;
				for (let p = 0; p < paragraphs.length; p++) {
					const para = paragraphs[p];
					// Empty paragraph (blank line from consecutive \n) still occupies 1 visual line.
					const paraLines = Math.max(1, Math.ceil(para.length / CHARS_PER_LINE));
					if (lines + paraLines > LINES_LIMIT) {
						const remainingLines = LINES_LIMIT - lines;
						const truncatedPara = para.slice(0, remainingLines * CHARS_PER_LINE);
						const truncatedText = seg.value.slice(0, paraStart) + truncatedPara;
						return {
							segs: [
								...segs.slice(0, i),
								...(truncatedText ? [{ ...seg, value: truncatedText }] : [])
							],
							isTruncated: true
						};
					}
					lines += paraLines;
					paraStart += para.length + 1; // +1 for the '\n' separator
				}
			} else if (seg.type === 'nostr_ref') {
				if (lines + NOSTR_REF_LINES > LINES_LIMIT) {
					return { segs: segs.slice(0, i), isTruncated: true };
				}
				lines += NOSTR_REF_LINES;
			}
		}
		return { segs, isTruncated: false };
	}

	/** Segments actually rendered (respects disableTruncation and expanded state). */
	const display = $derived(
		disableTruncation
			? { segs: segments, isTruncated: false }
			: buildDisplaySegments(segments, expanded)
	);

	/** Whether content is long enough to need a toggle at all. Stable — not affected by expanded state. */
	const wasTruncated = $derived(
		!disableTruncation && buildDisplaySegments(segments, false).isTruncated
	);

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
	class="short-text-renderer {className}"
	class:short-text-renderer--few-emoji={magnifyFewEmojis}
	data-short-text
>
	{#each display.segs as segment, i (i)}
		{#if segment.type === 'text'}
			{#each splitTextAutolinkUrls(segment.value) as chunk, cIdx (`${i}-${cIdx}`)}
				{#if chunk.type === 'text'}
					<span class="short-text-text">{chunk.value}</span>
				{:else if chunk.type === 'url'}
					<a href={chunk.href} class="short-text-url" target="_blank" rel="noopener noreferrer"
						>{stripUrlForDisplay(chunk.href)}</a
					>
				{/if}
			{/each}
		{:else if segment.type === 'mention'}
			<a
				href="/profile/{segment.npub}"
				class="short-text-mention"
				style={mentionStyle(segment.pubkey)}
			>
				@{mentionLabel(segment)}
			</a>
		{:else if segment.type === 'emoji'}
			{#if segment.url && !failedEmojiIdx.has(i)}
				<img
					src={segment.url}
					alt=":{segment.shortcode}:"
					class="short-text-emoji"
					loading="lazy"
					decoding="async"
					onerror={() => {
						failedEmojiIdx = new Set([...failedEmojiIdx, i]);
					}}
				/>
			{:else}
				<span
					class="short-text-emoji-skeleton"
					title=":{segment.shortcode}:"
					role="img"
					aria-label=":{segment.shortcode}:"
				></span>
			{/if}
		{:else if segment.type === 'nostr_ref'}
			<NostrRefCard naddrRaw={segment.raw} />
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
				}}>{expanded ? 'Read less' : 'Read more'}</button
			>
		{/if}
	{/if}
</div>

<style>
	.short-text-renderer {
		font-size: inherit;
		line-height: 1.5;
		color: color-mix(in srgb, var(--white) 85%, transparent);
		word-wrap: break-word;
	}

	/* 1–2 emoji only: 2.5× inline size (UTF follows font-size; custom imgs use em) */
	.short-text-renderer--few-emoji {
		font-size: 2.5em;
		line-height: 1;
	}

	.short-text-text {
		white-space: pre-line;
	}

	.short-text-url {
		color: var(--blurpleLightColor);
		text-decoration: none;
		word-break: break-word;
	}

	.short-text-url:hover {
		text-decoration: underline;
		opacity: 0.9;
	}

	.short-text-mention {
		font-weight: 500;
		text-decoration: none;
		transition: opacity 0.15s ease;
	}

	.short-text-mention:hover {
		opacity: 0.8;
		text-decoration: underline;
	}

	.short-text-emoji {
		width: 1.25em;
		height: 1.25em;
		vertical-align: -0.2em;
		margin: 0 2px;
		display: inline;
	}

	.short-text-emoji-skeleton {
		display: inline-block;
		width: 1.25em;
		height: 1.25em;
		vertical-align: -0.2em;
		margin: 0 2px;
		position: relative;
		overflow: hidden;
		background-color: var(--white16);
		/* Clip everything (including the shimmer ::after) to the emoji icon silhouette */
		-webkit-mask-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path fill-rule='evenodd' clip-rule='evenodd' d='M0 10C0 4.47715 4.47715 0 10 0C15.5228 0 20 4.47715 20 10C20 15.5228 15.5228 20 10 20C4.47715 20 0 15.5228 0 10ZM7.00002 6.00006C6.24063 6.00006 5.62502 6.61567 5.62502 7.37506C5.62502 8.13445 6.24063 8.75006 7.00002 8.75006C7.75941 8.75006 8.37502 8.13445 8.37502 7.37506C8.37502 6.61567 7.75941 6.00006 7.00002 6.00006ZM13 6.00006C12.2406 6.00006 11.625 6.61567 11.625 7.37506C11.625 8.13445 12.2406 8.75006 13 8.75006C13.7594 8.75006 14.375 8.13445 14.375 7.37506C14.375 6.61567 13.7594 6.00006 13 6.00006ZM6.51915 11.5005C6.18536 11.0976 5.58814 11.0415 5.18523 11.3753C4.78231 11.7091 4.72627 12.3063 5.06006 12.7093C6.3885 14.3128 8.1725 15.1575 10.0001 15.1575C11.8278 15.1575 13.6118 14.3128 14.9402 12.7093C15.274 12.3063 15.2179 11.7091 14.815 11.3753C14.4121 11.0415 13.8149 11.0976 13.4811 11.5005C12.4841 12.7039 11.2203 13.2628 10.0001 13.2628C8.77993 13.2628 7.51612 12.7039 6.51915 11.5005Z' fill='black'/></svg>");
		mask-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><path fill-rule='evenodd' clip-rule='evenodd' d='M0 10C0 4.47715 4.47715 0 10 0C15.5228 0 20 4.47715 20 10C20 15.5228 15.5228 20 10 20C4.47715 20 0 15.5228 0 10ZM7.00002 6.00006C6.24063 6.00006 5.62502 6.61567 5.62502 7.37506C5.62502 8.13445 6.24063 8.75006 7.00002 8.75006C7.75941 8.75006 8.37502 8.13445 8.37502 7.37506C8.37502 6.61567 7.75941 6.00006 7.00002 6.00006ZM13 6.00006C12.2406 6.00006 11.625 6.61567 11.625 7.37506C11.625 8.13445 12.2406 8.75006 13 8.75006C13.7594 8.75006 14.375 8.13445 14.375 7.37506C14.375 6.61567 13.7594 6.00006 13 6.00006ZM6.51915 11.5005C6.18536 11.0976 5.58814 11.0415 5.18523 11.3753C4.78231 11.7091 4.72627 12.3063 5.06006 12.7093C6.3885 14.3128 8.1725 15.1575 10.0001 15.1575C11.8278 15.1575 13.6118 14.3128 14.9402 12.7093C15.274 12.3063 15.2179 11.7091 14.815 11.3753C14.4121 11.0415 13.8149 11.0976 13.4811 11.5005C12.4841 12.7039 11.2203 13.2628 10.0001 13.2628C8.77993 13.2628 7.51612 12.7039 6.51915 11.5005Z' fill='black'/></svg>");
		-webkit-mask-size: 100% 100%;
		mask-size: 100% 100%;
		-webkit-mask-repeat: no-repeat;
		mask-repeat: no-repeat;
	}

	.short-text-emoji-skeleton::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			100deg,
			transparent 0%,
			var(--white4) 10%,
			var(--white8) 20%,
			var(--white16) 50%,
			var(--white8) 80%,
			var(--white4) 90%,
			transparent 100%
		);
		transform: translateX(-100%);
		animation: emoji-skeleton-shimmer 1.2s ease-in-out infinite;
		will-change: transform;
	}

	@keyframes emoji-skeleton-shimmer {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(100%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.short-text-emoji-skeleton::after {
			animation: none;
			background: transparent;
			transform: none;
		}
	}

	.read-more-btn,
	.read-more-hint {
		display: inline-flex;
		align-items: center;
		margin-top: 8px;
		height: 28px;
		padding: 0 12px;
		border-radius: 9999px;
		background-color: var(--white8);
		border: none;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--white66);
		line-height: 1;
	}

	.read-more-btn {
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	.read-more-btn:hover {
		transform: scale(1.02);
	}

	.read-more-btn:active {
		transform: scale(0.98);
	}

	.read-more-hint {
		pointer-events: none;
		user-select: none;
	}
</style>
