<script lang="js">
/**
 * MarkdownInline — renders an array of marked inline tokens as Svelte elements.
 * Uses <svelte:self> for recursive nesting (em inside strong, links, etc.).
 *
 * @type {{ tokens: import('marked').Token[] }}
 */
import MarkdownInline from './MarkdownInline.svelte';
import MediaBlock from './MediaBlock.svelte';

let {
	tokens = [],
	onMediaClick = null,
	mediaUrls = []
} = $props();

/** @param {{ url: string, type?: string }} detail */
function handleMediaClick(detail) {
	onMediaClick?.({
		url: detail.url,
		urls: mediaUrls.length ? mediaUrls : [detail.url]
	});
}
</script>

{#each tokens as token, i (i)}
	{#if token.type === 'text'}
		{#if token.tokens?.length}
			<MarkdownInline tokens={token.tokens} {onMediaClick} {mediaUrls} />
		{:else}
			{token.text}
		{/if}

	{:else if token.type === 'escape'}
		{token.text}

	{:else if token.type === 'strong'}
		<strong><MarkdownInline tokens={token.tokens ?? []} {onMediaClick} {mediaUrls} /></strong>

	{:else if token.type === 'em'}
		<em><MarkdownInline tokens={token.tokens ?? []} {onMediaClick} {mediaUrls} /></em>

	{:else if token.type === 'del'}
		<del><MarkdownInline tokens={token.tokens ?? []} {onMediaClick} {mediaUrls} /></del>

	{:else if token.type === 'codespan'}
		<code>{token.text}</code>

	{:else if token.type === 'br' || token.type === 'softbreak'}
		<br />

	{:else if token.type === 'link'}
		{#if token.href?.startsWith('/')}
			<a href={token.href} title={token.title ?? undefined}>
				<MarkdownInline tokens={token.tokens ?? []} {onMediaClick} {mediaUrls} />
			</a>
		{:else}
			<a href={token.href} title={token.title ?? undefined} target="_blank" rel="noopener noreferrer">
				<MarkdownInline tokens={token.tokens ?? []} {onMediaClick} {mediaUrls} />
			</a>
		{/if}

	{:else if token.type === 'image'}
		{#if onMediaClick}
			<span class="markdown-media-inline">
				<MediaBlock url={token.href} onClick={handleMediaClick} />
			</span>
		{:else}
			<img src={token.href} alt={token.text} title={token.title ?? undefined} loading="lazy" />
		{/if}

	{:else if token.type === 'html'}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html token.raw}

	{:else}
		{token.raw ?? ''}
	{/if}
{/each}

<style>
	a {
		color: var(--blurpleLightColor);
		text-decoration: none;
		transition: color 0.2s ease;
	}

	a:hover {
		color: color-mix(in srgb, var(--blurpleLightColor) 90%, transparent);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	code {
		background: var(--gray33);
		border: 0.33px solid var(--white16);
		padding: 0.15em 0.45em;
		border-radius: 6px;
		font-size: 0.875em;
		font-family: var(--font-mono);
		font-weight: 500;
		color: var(--white);
	}
	img {
		max-width: 100%;
	}

	.markdown-media-inline {
		display: inline-block;
		vertical-align: top;
		max-width: 100%;
		margin: 0.25rem 0;
	}
</style>
