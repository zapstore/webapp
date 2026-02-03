<script lang="ts">
	import DocsNavNode from './DocsNavNode.svelte';
	import { page } from '$app/stores';
	import { untrack } from 'svelte';
	import type { NavNode } from '$lib/content';

	interface Props {
		navigation?: NavNode[];
		mobileMenuOpen?: boolean;
		toggleMobileMenu?: () => void;
	}

	let { navigation = [], mobileMenuOpen = false, toggleMobileMenu = () => {} }: Props = $props();

	let expanded = $state<Record<string, boolean>>({});

	function toggle(id: string) {
		expanded[id] = !expanded[id];
		expanded = { ...expanded };
	}

	let currentPath = $derived($page.url.pathname);

	// Initialize expansion from frontmatter (sidebar.open) and active path
	$effect(() => {
		if (navigation && navigation.length) {
			const next: Record<string, boolean> = {};
			function traverse(nodes: NavNode[], ancestors: NavNode[] = []) {
				for (const node of nodes) {
					if (node.expandedByDefault === true) {
						next[node.id] = true;
					}
					const isSelfActive = !!(node.href && currentPath === node.href);
					const isDescActive = !!(node.href && currentPath.startsWith(node.href + '/'));
					if (isSelfActive || isDescActive) {
						for (const a of ancestors) next[a.id] = true;
						if (node.children && node.children.length) next[node.id] = true;
					}
					if (node.children && node.children.length) {
						traverse(node.children, [...ancestors, node]);
					}
				}
			}
			traverse(navigation, []);
			// Use untrack to read expanded without adding it as an effect dependency
			const current = untrack(() => expanded);
			expanded = { ...current, ...next };
		}
	});
</script>

<!-- Mobile menu overlay -->
{#if mobileMenuOpen}
	<div
		class="lg:hidden fixed inset-0 z-40 bg-[var(--color-bg-primary)]/80 backdrop-blur-sm"
		onclick={toggleMobileMenu}
		onkeydown={(e) => e.key === 'Enter' && toggleMobileMenu()}
		role="button"
		tabindex="0"
	></div>
{/if}

<!-- Navigation sidebar -->
<aside
	class="
		fixed lg:sticky top-0 lg:top-24 left-0 z-40 
		h-screen lg:h-auto w-72 lg:w-auto 
		bg-[var(--color-bg-primary)] lg:bg-transparent 
		border-r lg:border-r-0 border-[var(--color-border)]/50 
		overflow-y-auto 
		transition-transform duration-300 ease-out
		{mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} 
		lg:translate-x-0
	"
>
	<nav class="p-6 lg:p-0">
		<ul class="space-y-1">
			{#each navigation as node}
				<DocsNavNode {node} {expanded} {toggle} />
			{/each}
		</ul>
	</nav>
</aside>

<style>
	aside {
		-webkit-overflow-scrolling: touch;
	}
</style>
