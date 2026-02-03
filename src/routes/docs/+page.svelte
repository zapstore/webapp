<script lang="ts">
	import type { Component } from 'svelte';

	interface PageData {
		content?: Component;
		metadata?: {
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

{#if Content}
	<article class="prose max-w-none">
		{#if data.metadata?.title}
			<h1>{data.metadata.title}</h1>
		{/if}
		<Content />
	</article>
{:else}
	<article class="prose max-w-none">
		<h1>Documentation</h1>
		<p>
			Welcome to the Zapstore documentation. Here you'll find everything you need to get started
			with the open app marketplace.
		</p>
	</article>
{/if}
