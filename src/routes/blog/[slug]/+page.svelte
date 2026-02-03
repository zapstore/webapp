<script lang="ts">
	import { formatDisplayDate } from '$lib/date';
	import type { Component } from 'svelte';

	interface PageData {
		content: Component;
		metadata: {
			title?: string;
			description?: string;
			author?: string;
			date?: string;
			draft?: boolean;
		};
	}

	let { data }: { data: PageData } = $props();

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

<article>
	<!-- Article header -->
	<header class="mb-12">
		<div class="flex items-center gap-3 text-sm text-[var(--color-text-tertiary)] mb-4">
			{#if date}
				<time datetime={date}>{formatDisplayDate(date)}</time>
			{/if}
			{#if draft}
				<span
					class="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full text-xs font-medium"
				>
					Draft
				</span>
			{/if}
		</div>
		<h1 class="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">{title}</h1>
		{#if description}
			<p class="text-lg text-[var(--color-text-secondary)]">{description}</p>
		{/if}
	</header>

	<!-- Article content -->
	<div class="prose prose-lg max-w-none">
		{#if Content}
			<Content />
		{/if}
	</div>
</article>
