<script lang="js">
import { formatDisplayDate } from '$lib/date';
let { data } = $props();
let title = $derived(data.metadata?.title || 'Blog Post');
let description = $derived(data.metadata?.description || '');
let author = $derived(data.metadata?.author || 'Zapstore');
let date = $derived(data.metadata?.date || '');
let draft = $derived(data.metadata?.draft || false);
let Content = $derived(data.content);
</script>

<svelte:head>
	<title>{title} - Zapstore Blog</title>
	<meta name="description" content={description} />
	<meta name="author" content={author} />
	{#if date}
		<meta name="article:published_time" content={date} />
	{/if}
</svelte:head>

<section class="article-page">
	<div class="container mx-auto py-6 px-3 sm:px-6 lg:px-8">
		<article class="article-body">
			<header class="article-header">
				<div class="article-meta">
					{#if date}
						<time datetime={date} class="article-date">{formatDisplayDate(date)}</time>
					{/if}
					{#if draft}
						<span class="badge-draft">Draft</span>
					{/if}
				</div>
				<h1 class="article-title">{title}</h1>
				{#if description}
					<p class="article-desc">{description}</p>
				{/if}
			</header>

			<div class="prose">
				{#if Content}
					<Content />
				{/if}
			</div>
		</article>
	</div>
</section>

<style>
	.article-page {
		min-height: 100vh;
	}

	.article-body {
		max-width: 680px;
	}

	.article-header {
		margin-bottom: 2.5rem;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.article-meta {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.8125rem;
		color: hsl(var(--white33));
	}

	.article-date {
		color: hsl(var(--white33));
	}

	.badge-draft {
		padding: 2px 8px;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
		background: rgba(245, 158, 11, 0.1);
		color: rgb(251, 191, 36);
		border: 1px solid rgba(245, 158, 11, 0.2);
	}

	.article-title {
		font-size: 1.75rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		margin: 0;
		line-height: 1.25;
		letter-spacing: -0.02em;
	}

	@media (min-width: 640px) {
		.article-title {
			font-size: 2.25rem;
		}
	}

	@media (min-width: 1024px) {
		.article-title {
			font-size: 2.75rem;
		}
	}

	.article-desc {
		font-size: 1.0625rem;
		color: hsl(var(--white66));
		line-height: 1.6;
		margin: 0;
	}

	/* Prose styles for rendered markdown */
	.prose {
		color: hsl(var(--white66));
		line-height: 1.75;
		font-size: 1rem;
	}

	.prose :global(h1),
	.prose :global(h2),
	.prose :global(h3),
	.prose :global(h4) {
		color: hsl(var(--foreground));
		font-weight: 650;
		line-height: 1.3;
		margin-top: 2em;
		margin-bottom: 0.75em;
	}

	.prose :global(h1) { font-size: 1.75rem; }
	.prose :global(h2) { font-size: 1.375rem; }
	.prose :global(h3) { font-size: 1.125rem; }

	.prose :global(p) {
		margin: 0 0 1.25em;
	}

	.prose :global(a) {
		color: hsl(var(--blurple-bright-0));
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.prose :global(a:hover) {
		opacity: 0.85;
	}

	.prose :global(code) {
		font-size: 0.875em;
		background: hsl(var(--white8));
		padding: 2px 6px;
		border-radius: 5px;
		color: hsl(var(--foreground));
	}

	.prose :global(pre) {
		background: hsl(var(--white8));
		border: 1px solid hsl(var(--white16));
		border-radius: 10px;
		padding: 1rem 1.25rem;
		overflow-x: auto;
		margin: 0 0 1.5em;
	}

	.prose :global(pre code) {
		background: none;
		padding: 0;
		font-size: 0.875rem;
	}

	.prose :global(ul),
	.prose :global(ol) {
		padding-left: 1.5rem;
		margin: 0 0 1.25em;
	}

	.prose :global(li) {
		margin-bottom: 0.4em;
	}

	.prose :global(blockquote) {
		border-left: 3px solid hsl(var(--white16));
		padding-left: 1rem;
		margin: 0 0 1.25em;
		color: hsl(var(--white33));
		font-style: italic;
	}

	.prose :global(hr) {
		border: none;
		border-top: 1px solid hsl(var(--white8));
		margin: 2em 0;
	}

	.prose :global(img) {
		max-width: 100%;
		border-radius: 10px;
	}
</style>
