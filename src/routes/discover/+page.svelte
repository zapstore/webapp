<script lang="js">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { beforeNavigate } from '$app/navigation';
	import SectionHeader from '$lib/components/cards/SectionHeader.svelte';
	import { ChevronRight, ChevronLeft } from '$lib/components/icons';
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

	// Track whether each container has been scrolled (to show left button)
	let appsScrolledRight = $state(false);
	let stacksScrolledRight = $state(false);

	const SCROLL_STEP = 320;

	function scrollApps(dir) {
		if (!appsScrollContainer) return;
		appsScrollContainer.scrollBy({ left: dir * SCROLL_STEP, behavior: 'smooth' });
	}

	function scrollStacks(dir) {
		if (!stacksScrollContainer) return;
		stacksScrollContainer.scrollBy({ left: dir * SCROLL_STEP, behavior: 'smooth' });
	}

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
	// Show all apps so horizontal scroll can load more (like /apps vertical scroll).
	const apps = $derived(liveApps !== null && liveApps.length > 0 ? liveApps : []);
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

	// Group stacks into columns of 2 for the 2-row horizontal layout
	function getStackColumns(stackList, itemsPerColumn = 2) {
		const columns = [];
		for (let i = 0; i < stackList.length; i += itemsPerColumn) {
			columns.push(stackList.slice(i, i + itemsPerColumn));
		}
		return columns;
	}

	const stackColumns = $derived(getStackColumns(resolvedDisplayStacks, 2));

	const HORIZONTAL_SCROLL_THRESHOLD = 500;

	function handleAppsScroll() {
		if (!appsScrollContainer) return;
		const { scrollLeft, scrollWidth, clientWidth } = appsScrollContainer;
		appsScrolledRight = scrollLeft > 20;
		if (appsHasMore && !appsLoadingMore && scrollWidth - scrollLeft - clientWidth < HORIZONTAL_SCROLL_THRESHOLD) {
			loadMoreApps();
		}
	}

	function handleStacksScroll() {
		if (!stacksScrollContainer) return;
		const { scrollLeft, scrollWidth, clientWidth } = stacksScrollContainer;
		stacksScrolledRight = scrollLeft > 20;
		if (stacksHasMore && !stacksLoadingMore && scrollWidth - scrollLeft - clientWidth < HORIZONTAL_SCROLL_THRESHOLD) {
			loadMoreStacks(fetchFromRelays, DEFAULT_CATALOG_RELAYS);
		}
	}

	function getAppUrl(app) {
		return `/apps/${app.dTag}`;
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
	<div class="container mx-auto py-6 px-3 sm:px-6 lg:px-8">
		<!-- Apps Section -->
		<div class="section-container apps-section">
			<SectionHeader title="Apps" linkText="See more" href="/apps" />
			<div class="scroll-wrap">
				{#if apps.length === 0}
					<!-- Apps loading skeleton -->
					<div class="horizontal-scroll">
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

				<!-- Fade overlays (replaces mask-image to avoid backdrop-filter conflict) -->
				{#if appsScrolledRight}
					<div class="scroll-fade scroll-fade-left" aria-hidden="true"></div>
				{/if}
				<div class="scroll-fade scroll-fade-right" aria-hidden="true"></div>

				<!-- Scroll buttons (mouse users, desktop only) -->
				{#if appsScrolledRight}
					<button class="scroll-btn scroll-btn-left" onclick={() => scrollApps(-1)} aria-label="Scroll left">
						<ChevronLeft size={14} strokeWidth={1.4} color="hsl(var(--white66))" />
					</button>
				{/if}
				<button class="scroll-btn scroll-btn-right" onclick={() => scrollApps(1)} aria-label="Scroll right">
					<ChevronRight size={14} strokeWidth={1.4} color="hsl(var(--white66))" />
				</button>
			</div>
		</div>

		<!-- Stacks Section -->
		<div class="section-container">
			<SectionHeader title="Stacks" linkText="See more" href="/stacks" />
			<div class="scroll-wrap">
				{#if resolvedDisplayStacks.length === 0 && (liveStacks === null || stacksLoading)}
					<div class="horizontal-scroll">
						<div class="scroll-content">
							{#each Array(4) as _}
								<div class="stack-column">
									{#each Array(2) as _}
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
									{/each}
								</div>
							{/each}
						</div>
					</div>
				{:else if resolvedDisplayStacks.length > 0}
					<div
						class="horizontal-scroll"
						bind:this={stacksScrollContainer}
						onscroll={handleStacksScroll}
					>
						<div class="scroll-content">
							{#each stackColumns as column}
								<div class="stack-column">
									{#each column as stack}
										<AppStackCard {stack} href={getStackUrl(stack)} />
									{/each}
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

				<!-- Fade overlays (replaces mask-image to avoid backdrop-filter conflict) -->
				{#if stacksScrolledRight}
					<div class="scroll-fade scroll-fade-left" aria-hidden="true"></div>
				{/if}
				<div class="scroll-fade scroll-fade-right" aria-hidden="true"></div>

				<!-- Scroll buttons (mouse users, desktop only) -->
				{#if stacksScrolledRight}
					<button class="scroll-btn scroll-btn-left" onclick={() => scrollStacks(-1)} aria-label="Scroll left">
						<ChevronLeft size={14} strokeWidth={1.4} color="hsl(var(--white66))" />
					</button>
				{/if}
				<button class="scroll-btn scroll-btn-right" onclick={() => scrollStacks(1)} aria-label="Scroll right">
					<ChevronRight size={14} strokeWidth={1.4} color="hsl(var(--white66))" />
				</button>
			</div>
		</div>

		<!-- Catalogs Section (placeholder) -->
		<!-- <div class="section-container">
			<SectionHeader title="Catalogs" />
			<EmptyState message="Catalogs coming soon" />
		</div> -->

		<!-- Labels Section (placeholder) -->
		<!-- <div class="section-container">
			<SectionHeader title="Labels" />
			<EmptyState message="Labels coming soon" />
		</div> -->
	</div>
</section>

<style>
	.discover-page {
		min-height: 100vh;
	}

	.section-container {
		margin-bottom: 24px;
	}

	/* Wrapper for scroll container + overlay buttons */
	.scroll-wrap {
		position: relative;
	}

	/* Scroll arrow buttons — desktop + mouse only */
	.scroll-btn {
		display: none;
	}

	@media (min-width: 768px) and (hover: hover) and (pointer: fine) {
		.scroll-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			position: absolute;
			top: 50%;
			transform: translateY(-50%) scale(1);
			width: 38px;
			height: 38px;
			border-radius: 50%;
			border: none;
			background: hsl(var(--white16));
			backdrop-filter: blur(var(--blur-sm));
			-webkit-backdrop-filter: blur(var(--blur-sm));
			cursor: pointer;
			z-index: 10;
			transition: transform 0.2s ease;
		}

		.scroll-btn:hover {
			transform: translateY(-50%) scale(1.08);
		}

		.scroll-btn:active {
			transform: translateY(-50%) scale(0.95);
		}

		.scroll-btn-right {
			right: -56px;
		}

		/* Right button: icon points right → 2px padding on left (opposite side) */
		.scroll-btn-right :global(svg) {
			padding-left: 2px;
		}

		.scroll-btn-left {
			left: -56px;
		}

		/* Left button: icon points left → 2px padding on right (opposite side) */
		.scroll-btn-left :global(svg) {
			padding-right: 2px;
		}
	}

	/* Extra gap under the Apps section header (desktop +4px, mobile +2px) */
	.apps-section :global(.section-header) {
		margin-bottom: 20px;
	}

	@media (max-width: 767px) {
		.apps-section :global(.section-header) {
			margin-bottom: 18px;
		}
	}

	/* Horizontal scroll container: negative margins bleed to the outer padding edges */
	.horizontal-scroll {
		margin-left: -1rem;
		margin-right: -1rem;
		padding-left: 1rem;
		padding-right: 1rem;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		-ms-overflow-style: none;
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
		}
	}

	@media (min-width: 768px) {
		.horizontal-scroll {
			margin-left: -38px;
			margin-right: -38px;
			padding-left: 38px;
			padding-right: 38px;
		}
	}

	/*
	 * Fade overlays — replace mask-image to avoid backdrop-filter compositing conflict.
	 * mask-image + backdrop-filter sibling = broken compositing in all browsers.
	 * Plain gradient divs avoid the issue entirely.
	 */
	.scroll-fade {
		position: absolute;
		top: 0;
		bottom: 8px; /* stop above scrollbar area */
		pointer-events: none;
		z-index: 5;
	}

	.scroll-fade-left {
		left: -1rem;
		width: 1rem;
		background: linear-gradient(to right, hsl(var(--background)), transparent);
	}

	.scroll-fade-right {
		right: -1rem;
		width: 1rem;
		background: linear-gradient(to left, hsl(var(--background)), transparent);
	}

	@media (min-width: 640px) {
		.scroll-fade-left { left: -1.5rem; width: 1.5rem; }
		.scroll-fade-right { right: -1.5rem; width: 1.5rem; }
	}

	@media (min-width: 768px) {
		.scroll-fade-left { left: -38px; width: 38px; }
		.scroll-fade-right { right: -38px; width: 38px; }
	}

	.scroll-content {
		display: flex;
		gap: 16px;
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

	.stack-column {
		flex-shrink: 0;
		width: 280px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	@media (min-width: 768px) {
		.stack-column {
			width: 320px;
			gap: 16px;
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
