<script lang="ts">
	import type { Component } from 'svelte';

	interface PageData {
		content: Component;
		metadata: {
			title?: string;
			description?: string;
		};
	}

	let { data }: { data: PageData } = $props();

	let title = $derived(data.metadata?.title || 'Documentation');
	let description = $derived(data.metadata?.description || 'Zapstore documentation');
	let Content = $derived(data.content);
</script>

<svelte:head>
	<title>{title} - Zapstore Documentation</title>
	<meta name="description" content={description} />
</svelte:head>

<article class="prose max-w-none">
	{#if data.metadata?.title}
		<h1>{data.metadata.title}</h1>
	{/if}
	<Content />
</article>
