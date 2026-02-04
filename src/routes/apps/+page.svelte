<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { pushState, replaceState } from '$app/navigation';
	import { get } from 'svelte/store';
	import AppSmallCard from '$lib/components/cards/AppSmallCard.svelte';
	import AppDetail from '$lib/components/AppDetail.svelte';
	import type { App } from '$lib/nostr';
	import { encodeAppNaddr } from '$lib/nostr/models';
	import {
		getApps,
		getHasMore,
		isRefreshing,
		isLoadingMore,
		isStoreInitialized,
		initWithPrerenderedData,
		scheduleRefresh,
		loadMore
	} from '$lib/stores/nostr.svelte';
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
	const storeApps = $derived(getApps());
	const storeInitialized = $derived(isStoreInitialized());
	const hasMore = $derived(getHasMore());
	const refreshing = $derived(isRefreshing());
	const loadingMore = $derived(isLoadingMore());

	// SSR-safe display logic:
	// - Before store initialized: always use prerendered data.apps (instant content)
	// - After store initialized: use store data (which was initialized from data.apps)
	// This ensures prerendered HTML matches initial client render (no hydration mismatch)
	const displayApps = $derived(storeInitialized ? storeApps : data.apps);

	// Handle app click - shallow routing for instant navigation
	function handleAppClick(app: App) {
		return (e: MouseEvent) => {
			e.preventDefault();
			
			// Save current scroll position in current history entry
			const currentState = get(page).state as Record<string, unknown>;
			replaceState('', { ...currentState, scrollY: window.scrollY });
			
			// Create serializable app data
			const appData = JSON.parse(JSON.stringify(app));
			const naddr = app.naddr || encodeAppNaddr(app.pubkey, app.dTag);
			
			// Push state with app data - instant, no page reload
			pushState(`/apps/${naddr}`, { selectedApp: appData });
			
			// Scroll to top for detail view
			window.scrollTo(0, 0);
		};
	}

	// Get app URL for href (SEO / fallback)
	function getAppUrl(app: App): string {
		const naddr = app.naddr || encodeAppNaddr(app.pubkey, app.dTag);
		return `/apps/${naddr}`;
	}

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
		<meta name="description" content={selectedApp.description?.slice(0, 160) ?? ''} />
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
	<section class="apps-page">
		<div class="container">
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
						<div class="app-item">
							<AppSmallCard 
								{app} 
								href={getAppUrl(app)}
								onclick={handleAppClick(app)}
							/>
						</div>
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
		</div>
	</section>
{/if}

<style>
	.apps-page {
		padding: 1.5rem 0;
	}

	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 1rem;
	}

	@media (min-width: 640px) {
		.container {
			padding: 0 1.5rem;
		}
	}

	@media (min-width: 1024px) {
		.container {
			padding: 0 2rem;
		}
	}

	.page-header {
		margin-bottom: 1.5rem;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.page-header h1 {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0;
		color: hsl(var(--foreground));
	}

	@media (min-width: 768px) {
		.page-header h1 {
			font-size: 2rem;
		}
	}

	.refresh-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--primary));
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	/* 3-column grid for apps */
	.app-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.25rem;
	}

	@media (min-width: 640px) {
		.app-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 1.5rem;
		}
	}

	@media (min-width: 1024px) {
		.app-grid {
			grid-template-columns: repeat(3, 1fr);
			gap: 2rem;
		}
	}

	.app-item {
		padding: 0.75rem 0;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
	}

	.app-item:last-child {
		border-bottom: none;
	}

	@media (min-width: 640px) {
		.app-item {
			padding: 0;
			border-bottom: none;
		}
	}

	.empty-state {
		grid-column: 1 / -1;
		text-align: center;
		color: hsl(var(--muted-foreground));
		padding: 3rem;
	}

	.loader {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 2rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
	}

	.loading-spinner {
		width: 1.25rem;
		height: 1.25rem;
		border: 2px solid hsl(var(--border));
		border-top-color: hsl(var(--primary));
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.end-message {
		text-align: center;
		padding: 2rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
	}
</style>
