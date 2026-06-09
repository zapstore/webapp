<script lang="js">
/**
 * MarkdownBody — renders an array of marked *block* tokens as Svelte elements.
 *
 * Usage:
 *   import { tokenizeNostrMarkdown } from '$lib/utils/markdown';
 *   import MarkdownBody from '$lib/components/common/MarkdownBody.svelte';
 *
 *   const tokens = $derived(tokenizeNostrMarkdown(text, { wikiLinkFn, emojiMap }));
 *   <MarkdownBody {tokens} />
 */
import MarkdownInline from './MarkdownInline.svelte';
import MarkdownBody from './MarkdownBody.svelte';
import CodeBlock from './CodeBlock.svelte';
import MediaBlock from './MediaBlock.svelte';
import { highlightCode } from '$lib/utils/highlight.js';
import { headingAnchorId } from '$lib/utils/markdown.js';

	let {
		tokens = [],
		codeBlockBackground = 'gray33',
		codeBlockShowLanguage = true,
		codeBlockShowCopy = true,
		/** @type {string[]} langs without a copy button (e.g. yaml, yml) */
		codeBlockNoCopyLangs = [],
		onMediaClick = null,
		mediaUrls = []
	} = $props();

	/** @param {string | undefined} lang */
	function codeBlockShowCopyForLang(lang) {
		if (!codeBlockShowCopy) return false;
		const normalized = (lang ?? '').toLowerCase().trim();
		return !codeBlockNoCopyLangs.some((l) => l.toLowerCase() === normalized);
	}

	/** @param {{ url: string, type?: string }} detail */
	function handleMediaClick(detail) {
		onMediaClick?.({
			url: detail.url,
			urls: mediaUrls.length ? mediaUrls : [detail.url]
		});
	}

	/** @type {Record<number, string>} */
	let highlights = $state({});

	$effect(() => {
		highlights = {};
		for (let ti = 0; ti < tokens.length; ti++) {
			const token = tokens[ti];
			if (token.type !== 'code') continue;
			highlightCode(token.text, token.lang ?? '').then((html) => {
				if (tokens[ti] === token) {
					highlights = { ...highlights, [ti]: html };
				}
			});
		}
	});
</script>

{#each tokens as token, ti (ti)}
	{#if token.type === 'space'}
		<!-- intentional whitespace -->

	{:else if token.type === 'code'}
		<div class="code-block-wrap">
			<CodeBlock
				html={highlights[ti] ?? ''}
				code={token.text}
				language={codeBlockShowLanguage && token.lang ? token.lang.toUpperCase() : ''}
				background={codeBlockBackground}
				showCopy={codeBlockShowCopyForLang(token.lang)}
				showLanguage={codeBlockShowLanguage}
			/>
		</div>

	{:else if token.type === 'heading'}
		{@const hid = headingAnchorId(token.text ?? '')}
		{#if token.depth === 1}
			<h1 id={hid || undefined}><MarkdownInline tokens={token.tokens ?? []} {onMediaClick} {mediaUrls} /></h1>
		{:else if token.depth === 2}
			<h2 id={hid || undefined}><MarkdownInline tokens={token.tokens ?? []} {onMediaClick} {mediaUrls} /></h2>
		{:else if token.depth === 3}
			<h3 id={hid || undefined}><MarkdownInline tokens={token.tokens ?? []} {onMediaClick} {mediaUrls} /></h3>
		{:else if token.depth === 4}
			<h4 id={hid || undefined}><MarkdownInline tokens={token.tokens ?? []} {onMediaClick} {mediaUrls} /></h4>
		{:else if token.depth === 5}
			<h5 id={hid || undefined}><MarkdownInline tokens={token.tokens ?? []} {onMediaClick} {mediaUrls} /></h5>
		{:else}
			<h6 id={hid || undefined}><MarkdownInline tokens={token.tokens ?? []} {onMediaClick} {mediaUrls} /></h6>
		{/if}

	{:else if token.type === 'hr'}
		<hr />

	{:else if token.type === 'blockquote'}
		<blockquote>
			<MarkdownBody tokens={token.tokens ?? []} {onMediaClick} {mediaUrls} />
		</blockquote>

	{:else if token.type === 'list'}
		{#if token.ordered}
			<ol start={token.start || 1}>
				{#each token.items as item, ii (ii)}
					<li>
						{#if item.task}
							<input type="checkbox" checked={item.checked} disabled />
						{/if}
						{#if !item.loose && item.tokens?.[0]?.type === 'text'}
							<MarkdownInline tokens={item.tokens[0].tokens ?? []} {onMediaClick} {mediaUrls} />
							{#if item.tokens.length > 1}
								<MarkdownBody tokens={item.tokens.slice(1)} {onMediaClick} {mediaUrls} />
							{/if}
						{:else}
							<MarkdownBody tokens={item.tokens ?? []} {onMediaClick} {mediaUrls} />
						{/if}
					</li>
				{/each}
			</ol>
		{:else}
			<ul>
				{#each token.items as item, ii (ii)}
					<li>
						{#if item.task}
							<input type="checkbox" checked={item.checked} disabled />
						{/if}
						{#if !item.loose && item.tokens?.[0]?.type === 'text'}
							<MarkdownInline tokens={item.tokens[0].tokens ?? []} {onMediaClick} {mediaUrls} />
							{#if item.tokens.length > 1}
								<MarkdownBody tokens={item.tokens.slice(1)} {onMediaClick} {mediaUrls} />
							{/if}
						{:else}
							<MarkdownBody tokens={item.tokens ?? []} {onMediaClick} {mediaUrls} />
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

	{:else if token.type === 'paragraph'}
		{#if onMediaClick && token.tokens?.length === 1 && token.tokens[0].type === 'image'}
			<div class="markdown-media-block">
				<MediaBlock url={token.tokens[0].href} onClick={handleMediaClick} />
			</div>
		{:else}
			<p><MarkdownInline tokens={token.tokens ?? []} {onMediaClick} {mediaUrls} /></p>
		{/if}

	{:else if token.type === 'table'}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						{#each token.header as cell, i (i)}
							<th style:text-align={token.align?.[i] ?? null}>
								<MarkdownInline tokens={cell.tokens ?? []} {onMediaClick} {mediaUrls} />
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each token.rows as row, ri (ri)}
						<tr>
							{#each row as cell, ci (`${ri}:${ci}`)}
								<td style:text-align={token.align?.[ci] ?? null}>
									<MarkdownInline tokens={cell.tokens ?? []} {onMediaClick} {mediaUrls} />
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

	{:else if token.type === 'html'}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html token.text}

	{:else if token.type === 'text'}
		{#if token.tokens?.length}
			<p><MarkdownInline tokens={token.tokens} {onMediaClick} {mediaUrls} /></p>
		{:else}
			{token.text ?? ''}
		{/if}

	{:else}
		{token.raw ?? ''}
	{/if}
{/each}

<style>
	h1, h2, h3, h4, h5, h6 {
		color: var(--white);
		line-height: 1.3;
		font-weight: 600;
		margin-top: 1.5em;
		margin-bottom: 0.5em;
	}
	h1 { font-size: var(--docs-page-title-size, 1.375rem); font-weight: 700; }
	h2 { font-size: var(--docs-h2-size, 1.25rem); }
	h3 { font-size: var(--docs-h3-size, 1.125rem); }
	h4 { font-size: var(--docs-h4-size, 1.0625rem); }

	p {
		margin-top: 0.5em;
		margin-bottom: 0.5em;
	}
	p:first-child { margin-top: 0; }
	p:last-child { margin-bottom: 0; }

	hr {
		border: none;
		border-top: 1px solid var(--white11);
		margin: 1.5em 0;
	}

	blockquote {
		border-left: 3px solid var(--white16);
		margin: 1em 0;
		padding-left: 1em;
		color: var(--white66);
	}

	ul {
		list-style-type: disc;
		list-style-position: outside;
		padding-left: 1.5em;
		margin: 0.6em 0;
	}
	ol {
		list-style-type: decimal;
		list-style-position: outside;
		padding-left: 1.5em;
		margin: 0.6em 0;
	}
	li {
		margin: 0.25em 0;
	}
	li::marker {
		color: var(--white66);
	}

	.table-wrap {
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}
	table {
		width: max-content;
		min-width: 100%;
		border-collapse: collapse;
		margin: 0;
		font-size: 0.875rem;
	}
	th, td {
		padding: 8px 12px;
		text-align: left;
		max-width: clamp(140px, 35vw, 380px);
		overflow-wrap: break-word;
		word-break: break-word;
	}
	th {
		border-bottom: 1px solid var(--white16);
		background: var(--white8);
		font-weight: 600;
		color: var(--white);
		white-space: nowrap;
	}
	td {
		border-bottom: 1px solid var(--white11);
		color: var(--white);
	}
	.code-block-wrap {
		margin: 1em 0;
	}

	.markdown-media-block {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin: 0.75rem 0;
	}
</style>
