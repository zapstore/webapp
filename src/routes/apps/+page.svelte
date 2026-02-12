<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import AppSmallCard from '$lib/components/cards/AppSmallCard.svelte';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
	import type { App } from '$lib/nostr';
	import type { NostrEvent } from 'nostr-tools';
	import { parseApp } from '$lib/nostr/models';
	import { encodeAppNaddr } from '$lib/nostr/models';
	import { searchApps, initNostrService } from '$lib/nostr/service';
	import { DEFAULT_CATALOG_RELAYS } from '$lib/config';
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
	const seedEvents = $derived(
		((data as PageData & { seedEvents?: NostrEvent[] }).seedEvents ?? [])
	);

	// Reactive getters from store
	const storeApps = $derived(getApps());
	const storeInitialized = $derived(isStoreInitialized());
	const hasMore = $derived(getHasMore());
	const refreshing = $derived(isRefreshing());
	const loadingMore = $derived(isLoadingMore());

	// Search query from URL (?q=...)
	// Guard against prerender: searchParams not available during SSR with prerender=true
	const searchQ = $derived(browser ? ($page.url.searchParams.get('q')?.trim() ?? '') : '');

	// Search state: relay-fetched results when ?q= is present
	let searchResults = $state<App[] | null>(null);
	let searching = $state(false);
	let searchedQuery = $state('');

	// SSR-safe display logic
	const baseApps = $derived(storeInitialized ? storeApps : (data.apps ?? []));

	// When searching, show relay results; otherwise show the paginated list
	const displayApps = $derived(searchQ ? (searchResults ?? []) : baseApps);
	// True while search is in flight, OR when we have a query but no results yet
	const isSearching = $derived(searchQ !== '' && (searching || searchResults === null));

	// Navigate to app detail page route (/apps/[naddr])
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
		if (!searchQ && hasMore && !loadingMore && shouldLoadMore()) {
			loadMore();
		}
	}

	// Run NIP-50 search against the relay when query changes
	async function runSearch(query: string) {
		if (!query) {
			searchResults = null;
			searchedQuery = '';
			return;
		}

		// Don't re-run if already searched for this query
		if (query === searchedQuery && searchResults !== null) return;

		searching = true;
		try {
			await initNostrService();
			const events = await searchApps([...DEFAULT_CATALOG_RELAYS], query, { limit: 50 });

			// Deduplicate and parse
			const seen = new Set<string>();
			const parsed: App[] = [];
			for (const event of events) {
				const app = parseApp(event);
				const key = `${app.pubkey}:${app.dTag}`;
				if (!seen.has(key)) {
					seen.add(key);
					parsed.push(app);
				}
			}

			searchResults = parsed;
			searchedQuery = query;
		} catch (err) {
			console.error('[AppsPage] Search failed:', err);
			searchResults = [];
		} finally {
			searching = false;
		}
	}

	// React to searchQ changes
	$effect(() => {
		if (browser) {
			runSearch(searchQ);
		}
	});

	onMount(() => {
		if (!browser) return;

		// Use cached apps when coming from discover (or elsewhere): don't overwrite with empty.
		// Only init when we have server data to show, or when store was never initialized.
		if (!isStoreInitialized() || (data.apps?.length ?? 0) > 0) {
			initWithPrerenderedData(data.apps ?? [], data.nextCursor ?? null, seedEvents);
		}

		// Add scroll listener for infinite scroll
		window.addEventListener('scroll', handleScroll, { passive: true });

		// Always schedule background refresh so we can load/update in the meantime
		if (!searchQ) {
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
	<title>Browse Apps — Zapstore</title>
	<meta name="description" content="Browse all apps available on Zapstore" />
</svelte:head>

<section class="apps-page">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		<div class="page-header">
			<h1>{searchQ ? `Search: "${searchQ}"` : 'All Apps'}</h1>
		</div>

		<div class="app-grid">
			{#if displayApps.length === 0 && !refreshing && !isSearching}
				<p class="empty-state">{searchQ ? `No apps match "${searchQ}"` : 'No apps found'}</p>
			{:else if displayApps.length > 0}
				{#each displayApps as app (app.id)}
					<div class="app-item">
						<AppSmallCard {app} href={getAppUrl(app)} />
					</div>
				{/each}
			{:else}
				<!-- Loading: 3 skeleton cards that mimic AppSmallCard -->
				{#each [1, 2, 3] as _}
					<div class="app-item skeleton-item">
						<div class="skeleton-card">
							<div class="skeleton-icon">
								<SkeletonLoader />
							</div>
							<div class="skeleton-info">
								<div class="skeleton-name">
									<SkeletonLoader />
								</div>
								<div class="skeleton-desc-lines">
									<div class="skeleton-desc skeleton-desc-1"></div>
									<div class="skeleton-desc skeleton-desc-2 desktop-only"></div>
								</div>
							</div>
						</div>
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

		{#if !searchQ && !hasMore && displayApps.length > 0}
			<p class="end-message">You've reached the end</p>
		{/if}
	</div>
</section>

<style>
	.apps-page {
		padding: 1.5rem 0;
	}

	.page-header {
		margin-bottom: 1.5rem;
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

	/* 3-column grid for apps */
	.app-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.25rem;
	}

	@media (min-width: 640px) {
		.app-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 1.5rem;
		}
	}

	@media (min-width: 1024px) {
		.app-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 2rem;
		}
	}

	.app-item {
		padding: 0.75rem 0;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
		min-width: 0;
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

	/* Skeleton cards (mimic AppSmallCard) when loading */
	.skeleton-item {
		padding: 0.75rem 0;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
	}
	@media (min-width: 640px) {
		.skeleton-item {
			padding: 0;
			border-bottom: none;
		}
	}
	.skeleton-card {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		padding: 4px 0;
	}
	@media (min-width: 768px) {
		.skeleton-card {
			gap: 20px;
		}
	}
	.skeleton-icon {
		width: 56px;
		height: 56px;
		border-radius: 16px;
		overflow: hidden;
		flex-shrink: 0;
	}
	@media (min-width: 768px) {
		.skeleton-icon {
			width: 72px;
			height: 72px;
			border-radius: 24px;
		}
	}
	.skeleton-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 6px;
		min-width: 0;
	}
	.skeleton-name {
		width: 100px;
		height: 18px;
		border-radius: 12px;
		overflow: hidden;
	}
	@media (min-width: 768px) {
		.skeleton-name {
			width: 140px;
			height: 20px;
		}
	}
	.skeleton-desc-lines {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.skeleton-desc {
		height: 10px;
		border-radius: 12px;
		background: hsl(var(--gray33));
	}
	.skeleton-desc-1 {
		width: 180px;
	}
	.skeleton-desc-2 {
		width: 120px;
	}
	.skeleton-desc-2.desktop-only {
		display: none;
	}
	@media (min-width: 768px) {
		.skeleton-desc {
			height: 12px;
		}
		.skeleton-desc-1 {
			width: 220px;
		}
		.skeleton-desc-2 {
			width: 160px;
		}
		.skeleton-desc-2.desktop-only {
			display: block;
		}
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
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.end-message {
		text-align: center;
		padding: 2rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
	}
</style>
