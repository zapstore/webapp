<script lang="js">
	import { tokenizeNostrMarkdown } from '$lib/utils/markdown.js';
	import { collectMarkdownImageUrls } from '$lib/utils/markdown-images.js';
	import MarkdownBody from '$lib/components/common/MarkdownBody.svelte';
	import MediaLightboxModal from '$lib/components/modals/MediaLightboxModal.svelte';

	let { body = '' } = $props();

	const tokens = $derived(tokenizeNostrMarkdown(body));
	const mediaUrls = $derived(collectMarkdownImageUrls(tokens));

	let lightboxOpen = $state(false);
	let lightboxUrls = $state(/** @type {string[]} */ ([]));
	let lightboxIndex = $state(0);

	/** @param {{ url: string, urls?: string[] }} detail */
	function handleMediaClick({ url, urls }) {
		const list = urls?.length ? urls : mediaUrls;
		lightboxUrls = list;
		lightboxIndex = Math.max(0, list.indexOf(url));
		lightboxOpen = true;
	}
</script>

<article class="community-markdown prose prose-docs max-w-none docs-content">
	<MarkdownBody {tokens} {mediaUrls} onMediaClick={handleMediaClick} />
</article>

<MediaLightboxModal bind:isOpen={lightboxOpen} urls={lightboxUrls} initialIndex={lightboxIndex} />

<style>
	.community-markdown {
		padding: 0 var(--page-content-pad-x, 12px);
	}

	.community-markdown.prose > :global(:first-child) {
		margin-top: 0;
	}

	/* Blog in-body media: larger, width hugs image (no square gutter). */
	.community-markdown :global(.markdown-media-block),
	.community-markdown :global(.markdown-media-inline) {
		display: flex;
		width: fit-content;
		max-width: 100%;
		margin: 0.85rem 0 1rem;
	}

	.community-markdown :global(.markdown-media-block .media-block-wrap),
	.community-markdown :global(.markdown-media-inline .media-block-wrap) {
		max-width: min(100%, 480px);
		width: fit-content !important;
	}

	.community-markdown :global(.markdown-media-block .media-block),
	.community-markdown :global(.markdown-media-inline .media-block) {
		width: fit-content;
		max-width: min(100%, 480px);
		max-height: 360px;
	}

	.community-markdown :global(.markdown-media-block .media-element),
	.community-markdown :global(.markdown-media-inline .media-element) {
		display: block;
		width: auto;
		max-width: min(100%, 480px);
		max-height: 360px;
		height: auto;
	}
</style>
