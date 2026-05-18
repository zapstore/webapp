<script lang="js">
	import DocsNavNode from './DocsNavNode.svelte';
	import { page } from '$app/stores';
	import { untrack } from 'svelte';

	let { navigation = [], onNavigate = undefined } = $props();

	let expanded = $state({});

	function toggle(id) {
		expanded[id] = !expanded[id];
		expanded = { ...expanded };
	}

	let currentPath = $derived($page.url.pathname);

	$effect(() => {
		if (navigation && navigation.length) {
			const next = {};
			function traverse(nodes, ancestors = []) {
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
			const current = untrack(() => expanded);
			expanded = { ...current, ...next };
		}
	});
</script>

<nav class="docs-nav" aria-label="Documentation">
	<ul class="docs-nav-list">
		{#each navigation as node (node.id)}
			<DocsNavNode {node} {expanded} {toggle} {onNavigate} />
		{/each}
	</ul>
</nav>

<style>
	.docs-nav {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}

	.docs-nav-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
</style>
