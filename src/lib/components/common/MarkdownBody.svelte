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
import { onMount } from 'svelte';
import MarkdownInline from './MarkdownInline.svelte';
import MarkdownBody from './MarkdownBody.svelte';
import CodeBlock from './CodeBlock.svelte';
import { highlightCode } from '$lib/utils/highlight.js';

let { tokens = [] } = $props();

// Pre-highlight code blocks
let highlightedCode = $state(new Map());

$effect(() => {
	// Reset when tokens change
	highlightedCode = new Map();
	
	// Highlight all code blocks
	for (const token of tokens) {
		if (token.type === 'code') {
			highlightCode(token.text, token.lang ?? '').then(html => {
				highlightedCode.set(token, html);
				highlightedCode = highlightedCode; // trigger reactivity
			});
		}
	}
});


{#each tokens as token}
	{#if token.type === 'space'}
		<!-- intentional whitespace -->

	{:else if token.type === 'code'}
		<div class="code-block-wrap">
			<CodeBlock
				html={highlightedCode.get(token) ?? ''}
				code={token.text}
				language={token.lang ? token.lang.toUpperCase() : ''}
			/>
		</div>

	{:else if token.type === 'heading'}
		{#if token.depth === 1}
			<h1><MarkdownInline tokens={token.tokens ?? []} /></h1>
		{:else if token.depth === 2}
			<h2><MarkdownInline tokens={token.tokens ?? []} /></h2>
		{:else if token.depth === 3}
			<h3><MarkdownInline tokens={token.tokens ?? []} /></h3>
		{:else if token.depth === 4}
			<h4><MarkdownInline tokens={token.tokens ?? []} /></h4>
		{:else if token.depth === 5}
			<h5><MarkdownInline tokens={token.tokens ?? []} /></h5>
		{:else}
			<h6><MarkdownInline tokens={token.tokens ?? []} /></h6>
		{/if}

	{:else if token.type === 'hr'}
		<hr />

	{:else if token.type === 'blockquote'}
		<blockquote>
			<MarkdownBody tokens={token.tokens ?? []} />
		</blockquote>

	{:else if token.type === 'list'}
		{#if token.ordered}
			<ol start={token.start || 1}>
				{#each token.items as item}
					<li>
						{#if item.task}
							<input type="checkbox" checked={item.checked} disabled />
						{/if}
						{#if !item.loose && item.tokens?.[0]?.type === 'text'}
							<MarkdownInline tokens={item.tokens[0].tokens ?? []} />
							{#if item.tokens.length > 1}
								<MarkdownBody tokens={item.tokens.slice(1)} />
							{/if}
						{:else}
							<MarkdownBody tokens={item.tokens ?? []} />
						{/if}
					</li>
				{/each}
			</ol>
		{:else}
			<ul>
				{#each token.items as item}
					<li>
						{#if item.task}
							<input type="checkbox" checked={item.checked} disabled />
						{/if}
						{#if !item.loose && item.tokens?.[0]?.type === 'text'}
							<MarkdownInline tokens={item.tokens[0].tokens ?? []} />
							{#if item.tokens.length > 1}
								<MarkdownBody tokens={item.tokens.slice(1)} />
							{/if}
						{:else}
							<MarkdownBody tokens={item.tokens ?? []} />
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

	{:else if token.type === 'paragraph'}
		<p><MarkdownInline tokens={token.tokens ?? []} /></p>

	{:else if token.type === 'table'}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						{#each token.header as cell, i}
							<th style:text-align={token.align?.[i] ?? null}>
								<MarkdownInline tokens={cell.tokens ?? []} />
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each token.rows as row}
						<tr>
							{#each row as cell, i}
								<td style:text-align={token.align?.[i] ?? null}>
									<MarkdownInline tokens={cell.tokens ?? []} />
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

	{:else if token.type === 'html'}
		{@html token.text}

	{:else if token.type === 'text'}
		{#if token.tokens?.length}
			<p><MarkdownInline tokens={token.tokens} /></p>
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
	h1 { font-size: 1.375rem; font-weight: 700; }
	h2 { font-size: 1.125rem; }
	h3 { font-size: 1rem; }
	h4 { font-size: 0.9375rem; }

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
		color: var(--white);
	}
	li::marker {
		color: var(--white66);
	}

	.table-wrap {
		border-radius: 12px;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		border: 1px solid var(--white16);
		margin: 1em 0;
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
	tr:last-child td {
		border-bottom: none;
	}

	.code-block-wrap {
		margin: 1em 0;
	}
</style>
