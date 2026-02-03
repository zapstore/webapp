<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { AppCard, AppDetail } from '$lib/components';
	import type { App } from '$lib/nostr';
	import {
		getApps,
		getHasMore,
		isRefreshing,
		isLoadingMore,
		initWithPrerenderedData,
		scheduleRefresh,
		loadMore
	} from '$lib/stores';
	import type { PageData } from './$types';

	const SCROLL_THRESHOLD = 800; // pixels from bottom to trigger load

	let { data }: { data: PageData } = $props();

	// Check if an app is selected via shallow routing (instant navigation)
	const selectedApp = $derived(($page.state as { selectedApp?: App }).selectedApp ?? null);

	// Get scroll position from history state (saved when navigating to detail)
	const savedScrollY = $derived(($page.state as { scrollY?: number }).scrollY ?? 0);

	// Track if we were showing detail to detect back navigation
	let wasShowingDetail = false;

	// Restore scroll position when navigating back from detail
	$effect(() => {
		if (!browser) return;

		const showingDetail = selectedApp !== null;

		if (!showingDetail && wasShowingDetail && savedScrollY > 0) {
			requestAnimationFrame(() => {
				window.scrollTo(0, savedScrollY);
			});
		}

		wasShowingDetail = showingDetail;
	});

	// Reactive getters from store
	const apps = $derived(getApps());
	const hasMore = $derived(getHasMore());
	const refreshing = $derived(isRefreshing());
	const loadingMore = $derived(isLoadingMore());

	// Use prerendered data if store is empty
	const displayApps = $derived(apps.length > 0 ? apps : data.apps);

	// Infinite scroll: check if near bottom
	function shouldLoadMore(): boolean {
		if (!browser) return false;
		const scrollTop = window.scrollY || document.documentElement.scrollTop;
		const scrollHeight = document.documentElement.scrollHeight;
		const clientHeight = window.innerHeight;
		const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
		return distanceFromBottom < SCROLL_THRESHOLD;
	}

	function handleScroll() {
		if (selectedApp !== null) return; // Don't load more when showing detail
		if (hasMore && !loadingMore && shouldLoadMore()) {
			loadMore();
		}
	}

	onMount(() => {
		if (!browser) return;

		// Initialize store with prerendered data
		initWithPrerenderedData(data.apps, data.nextCursor);

		// Add scroll listener for infinite scroll
		window.addEventListener('scroll', handleScroll, { passive: true });

		// Schedule background refresh from relays (only if showing list view)
		if (selectedApp === null) {
			scheduleRefresh();
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('scroll', handleScroll);
		}
	});
</script>

<svelte:head>
	{#if selectedApp}
		<title>{selectedApp.name} — Zapstore</title>
		<meta name="description" content={selectedApp.description.slice(0, 160)} />
	{:else}
		<title>Browse Apps — Zapstore</title>
		<meta name="description" content="Browse all apps available on Zapstore" />
	{/if}
</svelte:head>

{#if selectedApp}
	<!-- App detail view (instant via shallow routing) -->
	<AppDetail app={selectedApp} />
{:else}
	<!-- Apps list view -->
	<div class="page-header">
		<div class="title-row">
			<h1>All Apps</h1>
			{#if refreshing}
				<span class="refresh-icon" title="Refreshing from relays...">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
						<path d="M21 3v5h-5" />
					</svg>
				</span>
		{/if}
	</div>
</div>

	<div class="app-grid">
		{#if displayApps.length === 0}
			<p class="empty-state">No apps found</p>
		{:else}
			{#each displayApps as app (app.id)}
				<AppCard {app} />
			{/each}
		{/if}
	</div>

	{#if loadingMore}
		<div class="loader">
			<span class="loading-spinner"></span>
			<span>Loading more...</span>
		</div>
	{/if}

	{#if !hasMore && displayApps.length > 0}
		<p class="end-message">You've reached the end</p>
	{/if}
{/if}

<style>
	.page-header {
		margin-bottom: 1.5rem;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.page-header h1 {
		font-size: 2rem;
		font-weight: 700;
		margin: 0;
	}

	.refresh-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--color-accent, #8b5cf6);
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.page-header p {
		color: var(--color-text-secondary, #6b7280);
		margin: 0.25rem 0 0;
	}

	.app-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1rem;
	}

	.empty-state {
		grid-column: 1 / -1;
		text-align: center;
		color: var(--text-secondary, #6b7280);
		padding: 3rem;
	}

	.loader {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 2rem;
		color: var(--color-text-secondary, #6b7280);
		font-size: 0.875rem;
	}

	.loading-spinner {
		width: 1.25rem;
		height: 1.25rem;
		border: 2px solid var(--color-border, #e5e7eb);
		border-top-color: var(--color-accent, #8b5cf6);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.end-message {
		text-align: center;
		padding: 2rem;
		color: var(--color-text-tertiary, #9ca3af);
		font-size: 0.875rem;
	}
</style>
