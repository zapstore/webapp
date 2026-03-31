<script lang="js">
import SeoHead from '$lib/components/layout/SeoHead.svelte';
let { data } = $props();
let title = $derived(data.metadata?.title || 'Documentation');
let description = $derived(data.metadata?.description || 'Zapstore documentation');
let Content = $derived(data.content);
</script>

<SeoHead title="{title} — Zapstore Documentation" {description} />

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
