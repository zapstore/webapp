<script lang="js">
	import DocsPageHeader from '$lib/components/docs/DocsPageHeader.svelte';
	import MarkdownBody from '$lib/components/common/MarkdownBody.svelte';
	import { tokenizeNostrMarkdown } from '$lib/utils/markdown.js';

	let { title = '', body = '' } = $props();

	const tokens = $derived(tokenizeNostrMarkdown(body));
</script>

{#if title}
	<DocsPageHeader {title}>
		<article class="docs-markdown-article prose prose-docs max-w-none">
			<MarkdownBody
				{tokens}
				codeBlockBackground="gray33"
				codeBlockShowLanguage={false}
				codeBlockNoCopyLangs={['yaml', 'yml']}
			/>
		</article>
	</DocsPageHeader>
{:else}
	<article class="docs-markdown-article prose prose-docs max-w-none docs-content">
		<MarkdownBody
			{tokens}
			codeBlockBackground="gray33"
			codeBlockShowLanguage={false}
			codeBlockNoCopyLangs={['yaml', 'yml']}
		/>
	</article>
{/if}

<style>
	.docs-markdown-article.prose > :global(:first-child) {
		margin-top: 0;
	}

	/* Docs only: full-width gray CodeBlock; cancel nested .prose pre styling */
	.docs-markdown-article :global(.code-block-wrap) {
		margin: 1.25rem 0;
		width: 100%;
	}

	.docs-markdown-article :global(.code-block-wrap .code-block) {
		align-self: stretch;
		width: 100%;
	}

	.docs-markdown-article.prose :global(.code-block-wrap pre) {
		background: transparent;
		border: none;
		border-radius: 0;
		padding: 0;
		margin: 0;
	}

	.docs-markdown-article.prose :global(.code-block-wrap pre code) {
		background: transparent;
		padding: 0;
		border-radius: 0;
		font-size: 0.8125rem;
		line-height: 1.5;
	}

	/* MarkdownBody heading scale inside docs articles (in-body h1, not page title) */
	.docs-markdown-article :global(h1:not(.docs-page-title)) {
		font-size: var(--docs-page-title-size);
		font-weight: 650;
		letter-spacing: -0.02em;
	}
	.docs-markdown-article :global(h2) {
		font-size: var(--docs-h2-size);
	}
	.docs-markdown-article :global(h3) {
		font-size: var(--docs-h3-size);
	}
	.docs-markdown-article :global(h4) {
		font-size: var(--docs-h4-size);
	}
	.docs-markdown-article :global(p),
	.docs-markdown-article :global(li) {
		font-size: var(--docs-body-size);
		line-height: var(--docs-body-leading);
		color: var(--white80);
	}
	.docs-markdown-article :global(strong) {
		color: var(--white);
	}
</style>
