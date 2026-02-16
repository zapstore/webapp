<script lang="js">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import AppSmallCard from '$lib/components/cards/AppSmallCard.svelte';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
	import { parseApp } from '$lib/nostr/models';
	import { encodeAppNaddr } from '$lib/nostr/models';
	import { searchApps } from '$lib/nostr/service';
	import { DEFAULT_CATALOG_RELAYS } from '$lib/config';
	import {
		createAppsQuery,
		seedEvents,
		initPagination,
		loadMoreApps,
		startAppsRefresh,
		stopAppsRefresh,
		getHasMore,
		isLoadingMore
	} from '$lib/stores/nostr.svelte.js';
	import { getCached, setCached } from '$lib/stores/query-cache.js';

	const SCROLL_THRESHOLD = 800;

	let { data } = $props();

	// liveQuery-driven apps from Dexie (local-first, auto-updates)
	// Initialize from cache to avoid skeleton flash on back navigation.
	let liveApps = $state(getCached('apps'));

	// Pagination state from store
	const hasMore = $derived(getHasMore());
	const loadingMore = $derived(isLoadingMore());

	// Search query from URL (?q=...)
	const searchQ = $derived(browser ? ($page.url.searchParams.get('q')?.trim() ?? '') : '');

	// Search state
	let searchResults = $state(null);
	let searching = $state(false);
	let searchedQuery = $state('');

	// Data: always from liveQuery (Dexie). Skeleton until first emission.
	const baseApps = $derived(liveApps !== null && liveApps.length > 0 ? liveApps : []);
	const displayApps = $derived(searchQ ? (searchResults ?? []) : baseApps);
	const isSearching = $derived(searchQ !== '' && (searching || searchResults === null));
	// In-grid skeleton count: initial load (no apps yet) = 12 slots; load more = 6 slots
	const skeletonCount = $derived(
		searchQ
			? 0
			: displayApps.length === 0
				? (liveApps === null ? 12 : 0)
				: loadingMore
					? 6
					: 0
	);

	// Subscribe to Dexie liveQuery for reactive local-first data
	$effect(() => {
		const sub = createAppsQuery().subscribe({
			next: (value) => {
				liveApps = value;
				setCached('apps', value);
			},
			error: (err) => console.error('[AppsPage] liveQuery error:', err)
		});
		return () => sub.unsubscribe();
	});

	function getAppUrl(app) {
		const naddr = app.naddr || encodeAppNaddr(app.pubkey, app.dTag);
		return `/apps/${naddr}`;
	}

	function shouldLoadMore() {
		if (!browser) return false;
		const scrollTop = window.scrollY || document.documentElement.scrollTop;
		const scrollHeight = document.documentElement.scrollHeight;
		const clientHeight = window.innerHeight;
		return scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
	}

	function handleScroll() {
		if (!searchQ && hasMore && !loadingMore && shouldLoadMore()) {
			loadMoreApps();
		}
	}

	async function runSearch(query) {
		if (!query) {
			searchResults = null;
			searchedQuery = '';
			return;
		}
		if (query === searchedQuery && searchResults !== null) return;
		searching = true;
		try {
			const events = await searchApps([...DEFAULT_CATALOG_RELAYS], query, { limit: 50 });
			const seen = new Set();
			const parsed = [];
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

	$effect(() => {
		if (browser) runSearch(searchQ);
	});

	onMount(async () => {
		if (!browser) return;

		// Seed SSR events into Dexie → liveQuery picks them up
		seedEvents(data.seedEvents ?? []);
		// Initialize pagination cursor from SSR response
		initPagination(data.appsCursor, data.appsHasMore);

		// If no data yet (client-side nav without SSR), fetch page 0 from API
		if ((!data.seedEvents || data.seedEvents.length === 0) && navigator.onLine) {
			await loadMoreApps();
		}

		// Start periodic page-0 refresh (every 60s)
		startAppsRefresh();

		// Scroll listener for infinite scroll
		window.addEventListener('scroll', handleScroll, { passive: true });
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('scroll', handleScroll);
			stopAppsRefresh();
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
			<h1>{searchQ ? `Search: "${searchQ}"` : 'Latest Apps'}</h1>
		</div>

		<div class="app-grid">
			{#if searchQ && displayApps.length === 0 && !isSearching}
				<p class="empty-state">No apps match "{searchQ}"</p>
			{:else}
				{#each displayApps as app (app.id)}
					<div class="app-item">
						<AppSmallCard {app} href={getAppUrl(app)} />
					</div>
				{/each}
				{#each Array(skeletonCount) as _}
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
		gap: 0.75rem;
	}

	@media (min-width: 640px) {
		.app-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 1.25rem;
		}
	}

	@media (min-width: 1024px) {
		.app-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 2rem;
		}
	}

	.app-item {
		padding: 0.5rem 0;
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
		padding: 0.5rem 0;
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

	.end-message {
		text-align: center;
		padding: 2rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
	}
</style>
