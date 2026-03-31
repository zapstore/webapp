<script lang="js">
import SeoHead from '$lib/components/layout/SeoHead.svelte';
let { data } = $props();
let title = $derived(data.metadata?.title || 'Documentation');
let description = $derived(data.metadata?.description || 'Zapstore documentation');
let Content = $derived(data.content);
</script>

<SeoHead title="{title} — Zapstore Documentation" {description} />

<article class="prose max-w-none">
	{#if data.metadata?.title}
		<h1>{data.metadata.title}</h1>
	{/if}
	<Content />
</article>
