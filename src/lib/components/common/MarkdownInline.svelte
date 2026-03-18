<script lang="js">
/**
 * MarkdownInline — renders an array of marked inline tokens as Svelte elements.
 * Uses <svelte:self> for recursive nesting (em inside strong, links, etc.).
 *
 * @type {{ tokens: import('marked').Token[] }}
 */
import MarkdownInline from './MarkdownInline.svelte';

let { tokens = [] } = $props();
</script>

{#each tokens as token}
	{#if token.type === 'text'}
		{#if token.tokens?.length}
			<MarkdownInline tokens={token.tokens} />
		{:else}
			{token.text}
		{/if}

	{:else if token.type === 'escape'}
		{token.text}

	{:else if token.type === 'strong'}
		<strong><MarkdownInline tokens={token.tokens ?? []} /></strong>

	{:else if token.type === 'em'}
		<em><MarkdownInline tokens={token.tokens ?? []} /></em>

	{:else if token.type === 'del'}
		<del><MarkdownInline tokens={token.tokens ?? []} /></del>

	{:else if token.type === 'codespan'}
		<code>{token.text}</code>

	{:else if token.type === 'br' || token.type === 'softbreak'}
		<br />

	{:else if token.type === 'link'}
		{#if token.href?.startsWith('/')}
			<a href={token.href} title={token.title ?? undefined}>
				<MarkdownInline tokens={token.tokens ?? []} />
			</a>
		{:else}
			<a href={token.href} title={token.title ?? undefined} target="_blank" rel="noopener noreferrer">
				<MarkdownInline tokens={token.tokens ?? []} />
			</a>
		{/if}

	{:else if token.type === 'image'}
		<img src={token.href} alt={token.text} title={token.title ?? undefined} loading="lazy" />

	{:else if token.type === 'html'}
		<!-- Pre-validated HTML: emoji <img> tags from tokenizeNostrMarkdown -->
		{@html token.raw}

	{:else}
		{token.raw ?? ''}
	{/if}
{/each}

<style>
	a {
		color: hsl(var(--blurpleLightColor));
		text-decoration: none;
	}
	a:hover {
		text-decoration: underline;
	}
	code {
		background: hsl(var(--gray33));
		border: 0.33px solid hsl(var(--white16));
		padding: 0.15em 0.45em;
		border-radius: 6px;
		font-size: 0.875em;
		font-family: var(--font-mono);
		font-weight: 500;
		color: hsl(var(--foreground));
	}
	img {
		max-width: 100%;
	}
</style>
