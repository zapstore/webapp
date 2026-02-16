<script lang="js">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { beforeNavigate } from '$app/navigation';
	import { wheelScroll } from '$lib/actions/wheelScroll.js';
	import SectionHeader from '$lib/components/cards/SectionHeader.svelte';
	import AppSmallCard from '$lib/components/cards/AppSmallCard.svelte';
	import AppStackCard from '$lib/components/cards/AppStackCard.svelte';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
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
	import {
		createStacksQuery,
		seedStackEvents,
		getStacksHasMore,
		isStacksLoadingMore,
		loadMoreStacks
	} from '$lib/stores/stacks.svelte.js';
	import { getCached, setCached } from '$lib/stores/query-cache.js';
	import { fetchFromRelays } from '$lib/nostr/service';
	import { DEFAULT_CATALOG_RELAYS } from '$lib/config';
	import { nip19 } from 'nostr-tools';
	import { encodeStackNaddr } from '$lib/nostr/models';
	import { fetchProfilesBatch } from '$lib/nostr/service';
	import { parseProfile } from '$lib/nostr/models';

	// Server-provided data
	let { data } = $props();

	// liveQuery-driven data from Dexie (local-first, auto-updates)
	// Initialize from cache to avoid skeleton flash on back navigation.
	let liveApps = $state(getCached('apps'));
	let liveStacks = $state(getCached('stacks'));

	// Apps pagination state
	const appsHasMore = $derived(getHasMore());
	const appsLoadingMore = $derived(isLoadingMore());

	// Stacks pagination state
	const stacksHasMore = $derived(getStacksHasMore());
	const stacksLoadingMore = $derived(isStacksLoadingMore());

	// Refs for horizontal scroll containers
	let appsScrollContainer = $state(null);
	let stacksScrollContainer = $state(null);

	// Subscribe to Dexie liveQuery for reactive apps
	$effect(() => {
		const sub = createAppsQuery().subscribe({
			next: (value) => {
				liveApps = value;
				setCached('apps', value);
			},
			error: (err) => console.error('[Discover] apps liveQuery error:', err)
		});
		return () => sub.unsubscribe();
	});

	// Subscribe to Dexie liveQuery for reactive stacks (with resolved apps)
	$effect(() => {
		const sub = createStacksQuery().subscribe({
			next: (value) => {
				liveStacks = value;
				setCached('stacks', value);
			},
			error: (err) => console.error('[Discover] stacks liveQuery error:', err)
		});
		return () => sub.unsubscribe();
	});

	// Data: always from liveQuery (Dexie). Skeleton until first emission.
	// Limit to first 20 apps for discover page display
	const apps = $derived(liveApps !== null && liveApps.length > 0 ? liveApps.slice(0, 20) : []);
	const rawStacks = $derived(liveStacks !== null && liveStacks.length > 0 ? liveStacks : []);

	// Resolved stacks with creator profiles (fetched as side effect)
	// Initialize from cache so back navigation shows content instantly.
	let resolvedDisplayStacks = $state(getCached('discover:resolvedStacks') ?? []);
	let stacksLoading = $state(false);
	let resolvedStackKeys = $state('');

	// Save scroll positions before navigating away
	beforeNavigate(() => {
		if (!browser) return;
		const scrollState = {
			scrollY: window.scrollY,
			appsScrollX: appsScrollContainer?.scrollLeft ?? 0,
			stacksScrollX: stacksScrollContainer?.scrollLeft ?? 0,
			timestamp: Date.now()
		};
		sessionStorage.setItem('discover_scroll', JSON.stringify(scrollState));
	});

	// Restore scroll positions
	let pendingScrollRestore = null;
	function restoreScrollPositions() {
		const saved = sessionStorage.getItem('discover_scroll');
		if (saved) {
			try {
				const scrollState = JSON.parse(saved);
				if (Date.now() - scrollState.timestamp < 5 * 60 * 1000) {
					pendingScrollRestore = scrollState;
					if (scrollState.scrollY > 0) {
						window.scrollTo(0, scrollState.scrollY);
					}
					tryRestoreHorizontalScroll();
				}
			} catch (e) {
				/* ignore */
			}
			sessionStorage.removeItem('discover_scroll');
		}
	}

	function tryRestoreHorizontalScroll() {
		if (!pendingScrollRestore) return;
		if (appsScrollContainer && pendingScrollRestore.appsScrollX > 0) {
			appsScrollContainer.scrollLeft = pendingScrollRestore.appsScrollX;
		}
		if (stacksScrollContainer && pendingScrollRestore.stacksScrollX > 0) {
			stacksScrollContainer.scrollLeft = pendingScrollRestore.stacksScrollX;
		}
		if (appsScrollContainer && stacksScrollContainer) {
			pendingScrollRestore = null;
		} else {
			requestAnimationFrame(tryRestoreHorizontalScroll);
		}
	}

	$effect(() => {
		if (browser && pendingScrollRestore && (appsScrollContainer || stacksScrollContainer)) {
			tryRestoreHorizontalScroll();
		}
	});

	// Group apps into columns of 4 for horizontal scroll
	function getAppColumns(appList, itemsPerColumn = 4) {
		const columns = [];
		for (let i = 0; i < appList.length; i += itemsPerColumn) {
			columns.push(appList.slice(i, i + itemsPerColumn));
		}
		return columns;
	}

	const appColumns = $derived(getAppColumns(apps, 4));

	const HORIZONTAL_SCROLL_THRESHOLD = 500;

	function handleAppsScroll() {
		if (!appsScrollContainer || !appsHasMore || appsLoadingMore) return;
		const { scrollLeft, scrollWidth, clientWidth } = appsScrollContainer;
		if (scrollWidth - scrollLeft - clientWidth < HORIZONTAL_SCROLL_THRESHOLD) {
			loadMoreApps();
		}
	}

	function handleStacksScroll() {
		if (!stacksScrollContainer || !stacksHasMore || stacksLoadingMore) return;
		const { scrollLeft, scrollWidth, clientWidth } = stacksScrollContainer;
		if (scrollWidth - scrollLeft - clientWidth < HORIZONTAL_SCROLL_THRESHOLD) {
			loadMoreStacks(fetchFromRelays, DEFAULT_CATALOG_RELAYS);
		}
	}

	function getAppUrl(app) {
		return `/apps/${app.naddr}`;
	}

	function isHexPubkey(value) {
		return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value.trim());
	}

	function hasIdentifier(value) {
		return typeof value === 'string' && value.trim().length > 0;
	}

	function safeEncodeStackNaddr(pubkey, dTag) {
		if (!isHexPubkey(pubkey) || !hasIdentifier(dTag)) return '';
		try {
			return encodeStackNaddr(pubkey.trim().toLowerCase(), dTag.trim());
		} catch {
			return '';
		}
	}

	function safeNpub(pubkey) {
		if (!isHexPubkey(pubkey)) return '';
		try {
			return nip19.npubEncode(pubkey.trim().toLowerCase());
		} catch {
			return '';
		}
	}

	function getStackUrl(stack) {
		const naddr = safeEncodeStackNaddr(stack?.pubkey, stack?.dTag);
		return naddr ? `/stacks/${naddr}` : '#';
	}

	// Fetch creator profiles when liveQuery stacks change
	async function resolveCreatorsForStacks(stacksWithApps) {
		if (!browser || stacksWithApps.length === 0) return;
		stacksLoading = true;
		try {
			const visible = stacksWithApps.slice(0, 20);
			const creatorPubkeys = [
				...new Set(visible.map((s) => s.stack.pubkey).filter((pk) => isHexPubkey(pk)))
			];
			const creatorEvents = await fetchProfilesBatch(creatorPubkeys);
			resolvedDisplayStacks = visible.map(({ stack, apps: stackApps }) => {
				let creator = undefined;
				if (isHexPubkey(stack.pubkey)) {
					const profileEvent = creatorEvents.get(stack.pubkey);
					if (profileEvent) {
						const profile = parseProfile(profileEvent);
						creator = {
							name: profile.displayName || profile.name,
							picture: profile.picture,
							pubkey: stack.pubkey,
							npub: safeNpub(stack.pubkey)
						};
					}
				}
				return {
					name: stack.title,
					description: stack.description,
					apps: stackApps,
					creator,
					pubkey: stack.pubkey,
					dTag: stack.dTag
				};
			});
			setCached('discover:resolvedStacks', resolvedDisplayStacks);
		} catch (err) {
			console.error('Error resolving stack creators:', err);
		} finally {
			stacksLoading = false;
		}
	}

	// Re-resolve creators when stacks change
	$effect(() => {
		if (!browser) return;
		const key = rawStacks.map((s) => s.stack.id).join(',');
		if (rawStacks.length > 0 && key !== resolvedStackKeys) {
			resolvedStackKeys = key;
			resolveCreatorsForStacks(rawStacks);
		}
	});

	onMount(async () => {
		if (!browser) return;

		// Seed SSR events into Dexie → liveQuery picks them up
		seedEvents(data.seedEvents ?? []);
		seedStackEvents(data.seedEvents ?? []);
		// Initialize apps pagination cursor from SSR response
		initPagination(data.appsCursor, data.appsHasMore);

		// If no SSR data (client-side nav), fetch page 0 from API and stacks from relays
		if ((!data.seedEvents || data.seedEvents.length === 0) && navigator.onLine) {
			await loadMoreApps();
			await loadMoreStacks(fetchFromRelays, DEFAULT_CATALOG_RELAYS);
		}

		// Start periodic page-0 refresh for apps (every 60s)
		startAppsRefresh();

		// Restore scroll positions
		restoreScrollPositions();
	});

	onDestroy(() => {
		if (browser) {
			stopAppsRefresh();
		}
	});
</script>

<svelte:head>
	<title>Discover — Zapstore</title>
	<meta name="description" content="Discover apps, stacks, communities and more on Zapstore" />
</svelte:head>

<section class="discover-page">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
		<!-- Apps Section -->
		<div class="section-container">
			<SectionHeader title="Apps" linkText="See more" href="/apps" />
			{#if apps.length === 0}
				<!-- Apps loading skeleton -->
				<div class="horizontal-scroll" use:wheelScroll>
					<div class="scroll-content">
						{#each Array(4) as _}
							<div class="app-column">
								{#each Array(4) as _}
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
								{/each}
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<div
					class="horizontal-scroll"
					use:wheelScroll
					bind:this={appsScrollContainer}
					onscroll={handleAppsScroll}
				>
					<div class="scroll-content">
						{#each appColumns as column}
							<div class="app-column">
								{#each column as app}
									<AppSmallCard {app} href={getAppUrl(app)} />
								{/each}
							</div>
						{/each}

						{#if appsLoadingMore}
							<div class="load-more-column">
								<div class="spinner"></div>
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<!-- Stacks Section -->
		<div class="section-container">
			<SectionHeader title="Stacks" linkText="See more" href="/stacks" />
			{#if resolvedDisplayStacks.length === 0 && (liveStacks === null || stacksLoading)}
				<div class="horizontal-scroll" use:wheelScroll>
					<div class="scroll-content">
						{#each Array(4) as _}
							<div class="stack-item">
								<div class="skeleton-stack">
									<div class="skeleton-stack-grid">
										<SkeletonLoader />
									</div>
									<div class="skeleton-stack-info">
										<div class="skeleton-stack-text">
											<div class="skeleton-stack-name"><SkeletonLoader /></div>
											<div class="skeleton-stack-desc-lines">
												<div class="skeleton-stack-desc skeleton-stack-desc-1"></div>
												<div class="skeleton-stack-desc skeleton-stack-desc-2"></div>
											</div>
										</div>
										<div class="skeleton-stack-creator">
											<div class="skeleton-stack-avatar">
												<SkeletonLoader />
											</div>
											<div class="skeleton-stack-creator-name"></div>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else if resolvedDisplayStacks.length > 0}
				<div
					class="horizontal-scroll"
					use:wheelScroll
					bind:this={stacksScrollContainer}
					onscroll={handleStacksScroll}
				>
					<div class="scroll-content">
						{#each resolvedDisplayStacks as stack}
							<div class="stack-item">
								<AppStackCard {stack} href={getStackUrl(stack)} />
							</div>
						{/each}

						{#if stacksLoadingMore}
							<div class="load-more-column">
								<div class="spinner"></div>
							</div>
						{/if}
					</div>
				</div>
			{:else}
				<div class="placeholder-content">
					<p class="text-muted-foreground text-sm">
						No app stacks found yet. Create one in the Zapstore app!
					</p>
				</div>
			{/if}
		</div>

		<!-- Catalogs Section (placeholder) -->
		<div class="section-container">
			<SectionHeader title="Catalogs" />
			<EmptyState message="Catalogs coming soon" />
		</div>

		<!-- Labels Section (placeholder) -->
		<div class="section-container">
			<SectionHeader title="Labels" />
			<EmptyState message="Labels coming soon" />
		</div>
	</div>
</section>

<style>
	.discover-page {
		min-height: 100vh;
	}

	.section-container {
		margin-bottom: 24px;
	}

	/* Horizontal scroll container */
	.horizontal-scroll {
		margin-left: -1rem;
		margin-right: -1rem;
		padding-left: 1rem;
		padding-right: 1rem;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		-ms-overflow-style: none;
		mask-image: linear-gradient(
			to right,
			transparent 0%,
			black 1rem,
			black calc(100% - 1rem),
			transparent 100%
		);
		-webkit-mask-image: linear-gradient(
			to right,
			transparent 0%,
			black 1rem,
			black calc(100% - 1rem),
			transparent 100%
		);
	}

	.horizontal-scroll::-webkit-scrollbar {
		display: none;
	}

	@media (min-width: 640px) {
		.horizontal-scroll {
			margin-left: -1.5rem;
			margin-right: -1.5rem;
			padding-left: 1.5rem;
			padding-right: 1.5rem;
			mask-image: linear-gradient(
				to right,
				transparent 0%,
				black 1.5rem,
				black calc(100% - 1.5rem),
				transparent 100%
			);
			-webkit-mask-image: linear-gradient(
				to right,
				transparent 0%,
				black 1.5rem,
				black calc(100% - 1.5rem),
				transparent 100%
			);
		}
	}

	@media (min-width: 1024px) {
		.horizontal-scroll {
			margin-left: -2rem;
			margin-right: -2rem;
			padding-left: 2rem;
			padding-right: 2rem;
			mask-image: linear-gradient(
				to right,
				transparent 0%,
				black 2rem,
				black calc(100% - 2rem),
				transparent 100%
			);
			-webkit-mask-image: linear-gradient(
				to right,
				transparent 0%,
				black 2rem,
				black calc(100% - 2rem),
				transparent 100%
			);
		}
	}

	.scroll-content {
		display: flex;
		gap: 16px;
		padding-bottom: 8px;
	}

	.app-column {
		flex-shrink: 0;
		width: 280px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	@media (min-width: 768px) {
		.app-column {
			width: 320px;
			gap: 16px;
		}
	}

	.stack-item {
		flex-shrink: 0;
		width: 280px;
	}

	@media (min-width: 768px) {
		.stack-item {
			width: 320px;
		}
	}

	.load-more-column {
		flex-shrink: 0;
		width: 120px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.spinner {
		width: 20px;
		height: 20px;
		border: 2px solid hsl(var(--white33));
		border-top-color: hsl(var(--foreground));
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.placeholder-content {
		padding: 24px;
		background-color: hsl(var(--gray66));
		border-radius: 16px;
		text-align: center;
	}

	/* Skeleton loading styles */
	.skeleton-card {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		padding: 4px 0;
	}

	.skeleton-icon {
		width: 56px;
		height: 56px;
		border-radius: 16px;
		overflow: hidden;
		flex-shrink: 0;
	}

	@media (min-width: 768px) {
		.skeleton-card {
			gap: 20px;
		}
		.skeleton-icon {
			width: 72px;
			height: 72px;
			border-radius: 24px;
		}
		.skeleton-name {
			width: 140px;
			height: 20px;
		}
		.skeleton-desc {
			height: 12px;
		}
		.skeleton-desc-1 {
			width: 220px;
		}
		.skeleton-desc-2 {
			width: 160px;
		}
	}

	.skeleton-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 6px;
	}

	.skeleton-name {
		width: 100px;
		height: 18px;
		border-radius: 12px;
		overflow: hidden;
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
		.skeleton-desc-2.desktop-only {
			display: block;
		}
	}

	/* Stack skeleton styles */
	.skeleton-stack {
		display: flex;
		align-items: stretch;
		gap: 16px;
		padding: 8px 0;
		width: 100%;
	}

	.skeleton-stack-grid {
		width: 86px;
		height: 86px;
		border-radius: 16px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.skeleton-stack-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 4px 0;
	}

	.skeleton-stack-text {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.skeleton-stack-name {
		width: 100px;
		height: 18px;
		border-radius: 12px;
		overflow: hidden;
	}

	.skeleton-stack-desc-lines {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.skeleton-stack-desc {
		height: 10px;
		border-radius: 12px;
		background-color: hsl(var(--gray33));
	}

	.skeleton-stack-desc-1 {
		width: 160px;
	}

	.skeleton-stack-desc-2 {
		width: 100px;
	}

	.skeleton-stack-creator {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.skeleton-stack-avatar {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		overflow: hidden;
		flex-shrink: 0;
	}

	.skeleton-stack-creator-name {
		width: 60px;
		height: 12px;
		border-radius: 12px;
		background-color: hsl(var(--gray33));
	}

	@media (min-width: 768px) {
		.skeleton-stack {
			gap: 20px;
		}
		.skeleton-stack-grid {
			width: 104px;
			height: 104px;
			border-radius: 20px;
		}
		.skeleton-stack-name {
			width: 130px;
			height: 20px;
		}
		.skeleton-stack-desc {
			height: 12px;
		}
		.skeleton-stack-desc-1 {
			width: 200px;
		}
		.skeleton-stack-desc-2 {
			width: 140px;
		}
		.skeleton-stack-avatar {
			width: 24px;
			height: 24px;
		}
		.skeleton-stack-creator-name {
			width: 80px;
			height: 14px;
		}
	}
</style>
