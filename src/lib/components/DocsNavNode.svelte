<script lang="js">
	import { page } from '$app/stores';
	import { ChevronDown } from '$lib/components/icons';
	import DocsNavNode from './DocsNavNode.svelte';

	let { node, expanded = {}, toggle = () => {}, onNavigate = undefined } = $props();

	let currentPath = $derived($page.url.pathname);

	function isActive(href) {
		if (!href) return false;
		return currentPath === href;
	}

	function isAncestorActive(href) {
		if (!href) return false;
		if (href === '/') return false;
		return currentPath.startsWith(href + '/');
	}

	let isFolder = $derived(Array.isArray(node.children) && node.children.length > 0);
</script>

<li class="docs-nav-item">
	{#if isFolder}
		<div class="docs-nav-row">
			{#if node.href}
				<a
					href={node.href}
					class="docs-nav-link"
					class:active={isActive(node.href)}
					class:ancestor={!isActive(node.href) && isAncestorActive(node.href)}
					onclick={onNavigate}
				>
					{node.title}
				</a>
			{:else}
				<span
					class="docs-nav-link docs-nav-label"
					class:ancestor={isAncestorActive(node.id)}
				>
					{node.title}
				</span>
			{/if}
			<button
				type="button"
				class="docs-nav-toggle"
				onclick={() => toggle(node.id)}
				aria-expanded={!!expanded[node.id]}
				aria-controls={`section-${node.id}`}
				aria-label={expanded[node.id] ? 'Collapse section' : 'Expand section'}
			>
				<span class="docs-nav-chevron" class:open={!!expanded[node.id]}>
					<ChevronDown variant="outline" color="var(--white33)" size={14} strokeWidth={1.4} />
				</span>
			</button>
		</div>
		{#if expanded[node.id]}
			<ul id={`section-${node.id}`} class="docs-nav-children">
				{#each node.children as child (child.id)}
					<DocsNavNode node={child} {expanded} {toggle} {onNavigate} />
				{/each}
			</ul>
		{/if}
	{:else if node.href}
		<a
			href={node.href}
			class="docs-nav-link"
			class:active={isActive(node.href)}
			onclick={onNavigate}
		>
			{node.title}
		</a>
	{/if}
</li>

<style>
	.docs-nav-item {
		list-style: none;
	}

	.docs-nav-row {
		display: flex;
		align-items: center;
		gap: 2px;
		min-width: 0;
	}

	.docs-nav-link {
		display: block;
		flex: 1;
		min-width: 0;
		padding: 8px 12px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: var(--white66);
		font-size: 14px;
		font-weight: 500;
		line-height: 1.3;
		text-decoration: none;
		text-align: left;
		transition: color 0.15s, background 0.15s;
		cursor: pointer;
	}

	.docs-nav-link:hover:not(.active) {
		background: var(--white4);
		color: var(--white);
	}

	.docs-nav-link.active {
		color: var(--white);
		background: var(--white8);
	}

	.docs-nav-link.ancestor {
		color: var(--white);
	}

	.docs-nav-label {
		cursor: default;
	}

	.docs-nav-toggle {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--white33);
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}

	.docs-nav-toggle:hover {
		background: var(--white4);
		color: var(--white);
	}

	.docs-nav-chevron {
		display: flex;
		align-items: center;
		transition: transform 0.2s;
	}

	.docs-nav-chevron.open {
		transform: rotate(180deg);
	}

	.docs-nav-children {
		list-style: none;
		margin: 2px 0 0;
		padding: 0 0 0 10px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		border-left: 1px solid var(--shell-border);
		margin-left: 12px;
	}
</style>
