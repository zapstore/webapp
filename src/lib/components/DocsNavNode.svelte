<script lang="js">
import { page } from '$app/stores';
import { ChevronRight } from 'lucide-svelte';
import DocsNavNode from './DocsNavNode.svelte';
let { node, expanded = {}, toggle = () => { } } = $props();
let currentPath = $derived($page.url.pathname);
function isActive(href) {
    if (!href)
        return false;
    return currentPath === href;
}
function isAncestorActive(href) {
    if (!href)
        return false;
    if (href === '/')
        return false;
    return currentPath.startsWith(href + '/');
}
let isFolder = $derived(Array.isArray(node.children) && node.children.length > 0);
</script>

<li>
	{#if isFolder}
		<div class="flex items-center justify-between w-full text-left regular14 mb-1">
			{#if node.href}
				<a
					href={node.href}
					data-sveltekit-reload
				class="flex-1 px-3 py-1.5 rounded-lg transition-colors {isActive(node.href)
					? 'bg-[var(--color-accent)]/10 text-[var(--color-text-primary)] medium14'
					: isAncestorActive(node.href)
						? 'text-[var(--color-text-primary)] medium14'
						: 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]'}"
				>
					{node.title}
				</a>
			{:else}
				<span
				class="flex-1 px-3 py-1.5 {isAncestorActive(node.id)
					? 'text-[var(--color-text-primary)] medium14'
					: 'text-[var(--color-text-secondary)]'}"
				>
					{node.title}
				</span>
			{/if}
			<button
				type="button"
				class="p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
				onclick={() => toggle(node.id)}
				aria-expanded={!!expanded[node.id]}
				aria-controls={`section-${node.id}`}
				aria-label={expanded[node.id] ? 'Collapse section' : 'Expand section'}
			>
				<ChevronRight
					class="h-4 w-4 transition-transform duration-200 {expanded[node.id] ? 'rotate-90' : ''}"
				/>
			</button>
		</div>
		{#if expanded[node.id]}
			<ul
				id={`section-${node.id}`}
				class="ml-3 pl-3 border-l border-[var(--color-border)]/50 space-y-1 mt-1"
			>
				{#each node.children as child (child.id)}
					<DocsNavNode node={child} {expanded} {toggle} />
				{/each}
			</ul>
		{/if}
	{:else if node.href}
		<a
			href={node.href}
			data-sveltekit-reload
			class="block regular14 px-3 py-1.5 rounded-lg transition-colors {isActive(node.href)
			? 'bg-[var(--color-accent)]/10 text-[var(--color-text-primary)] medium14'
			: 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]'}"
		>
			{node.title}
		</a>
	{/if}
</li>
