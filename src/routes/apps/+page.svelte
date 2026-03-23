<script lang="js">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { wheelScroll } from '$lib/actions/wheelScroll.js';
	import SectionHeader from '$lib/components/cards/SectionHeader.svelte';
	import Label from '$lib/components/common/Label.svelte';
	import AlternativeToBrowseTrigger from '$lib/components/common/AlternativeToBrowseTrigger.svelte';
	import { ChevronRight, ChevronLeft } from '$lib/components/icons';
	import AppSmallCard from '$lib/components/cards/AppSmallCard.svelte';
	import AppStackCard from '$lib/components/cards/AppStackCard.svelte';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
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
	import { fetchFromRelays, searchApps } from '$lib/nostr/service';
	import { ZAPSTORE_RELAY } from '$lib/config';
	import { nip19 } from 'nostr-tools';
	import { encodeStackNaddr, parseApp, parseProfile } from '$lib/nostr/models';
	import { fetchProfilesBatch } from '$lib/nostr/service';
	import { DISCOVER_APPS_INITIAL, DISCOVER_STACKS_INITIAL } from '$lib/constants';

	/** `true` = show category chips + alternative-to row at top of /apps (off for now). */
	const SHOW_APPS_CATEGORY_ROW = false;

	/** Quick category chips — navigates to relay search (same as typing in header search). */
	const APP_PAGE_CATEGORIES = [
		'Social',
		'Security',
		'Music',
		'Productivity',
		'Wallet',
		'Privacy',
		'Email',
		'Todos',
		'Photos',
		'Notes',
		'News',
		'Weather',
		'Fitness',
		'Developer',
		'Open Source'
	];

	let { data } = $props();

	function gotoCategorySearch(/** @type {string} */ label) {
		goto(`/apps?q=${encodeURIComponent(label)}`);
	}

	// liveQuery-driven data (local-first, auto-updates)
	// Initialize from cache to avoid skeleton flash on back navigation.
	let liveApps = $state(getCached('apps'));
	let liveStacks = $state(getCached('stacks'));

	// Display limits — start small, grow on load-more
	let displayAppsLimit = $state(DISCOVER_APPS_INITIAL);
	let displayStacksLimit = $state(DISCOVER_STACKS_INITIAL);

	// Pagination state
	const appsHasMore = $derived(getHasMore());
	const appsLoadingMore = $derived(isLoadingMore());
	const stacksHasMore = $derived(getStacksHasMore());
	const stacksLoadingMore = $derived(isStacksLoadingMore());

	// Refs for horizontal scroll containers
	let appsScrollContainer = $state(null);
	let stacksScrollContainer = $state(null);
	let categoriesScrollContainer = $state(null);

	let appsScrolledRight = $state(false);
	let stacksScrolledRight = $state(false);
	let categoriesScrolledRight = $state(false);

	const SCROLL_STEP = 320;

	function scrollApps(dir) {
		if (!appsScrollContainer) return;
		appsScrollContainer.scrollBy({ left: dir * SCROLL_STEP, behavior: 'smooth' });
		// Re-check load-more after smooth scroll settles (covers "already at right edge" case)
		if (dir > 0) setTimeout(handleAppsScroll, 350);
	}

	function scrollStacks(dir) {
		if (!stacksScrollContainer) return;
		stacksScrollContainer.scrollBy({ left: dir * SCROLL_STEP, behavior: 'smooth' });
		if (dir > 0) setTimeout(handleStacksScroll, 350);
	}

	// Subscribe to liveQuery for reactive apps
	$effect(() => {
		const sub = createAppsQuery().subscribe({
			next: (value) => {
				liveApps = value;
				setCached('apps', value);
			},
			error: (err) => console.error('[Apps] apps liveQuery error:', err)
		});
		return () => sub.unsubscribe();
	});

	// Subscribe to liveQuery for reactive stacks
	$effect(() => {
		const sub = createStacksQuery().subscribe({
			next: (value) => {
				liveStacks = value;
				setCached('stacks', value);
			},
			error: (err) => console.error('[Apps] stacks liveQuery error:', err)
		});
		return () => sub.unsubscribe();
	});

	// Cap display to current limits — liveQuery always returns the full available set
	const apps = $derived((liveApps ?? []).slice(0, displayAppsLimit));
	const rawStacks = $derived((liveStacks ?? []).slice(0, displayStacksLimit));

	// Resolved stacks with creator profiles
	let resolvedDisplayStacks = $state(getCached('apps:resolvedStacks') ?? []);
	let stacksSettled = $state(false);
	let resolvedStackKeys = $state('');

	// ── Search ──────────────────────────────────────────────────────────────
	const searchQ = $derived(browser ? ($page.url.searchParams.get('q')?.trim() ?? '') : '');
	let searchResults = $state(null);
	let searchLoading = $state(false);
	let searchAbortController = null;

	$effect(() => {
		if (!browser) return;
		const q = searchQ;
		searchAbortController?.abort();
		searchAbortController = null;

		if (!q) {
			searchResults = null;
			searchLoading = false;
			return;
		}

		searchLoading = true;
		searchResults = null;

		const controller = new AbortController();
		searchAbortController = controller;

		searchApps(['wss://relay.zapstore.dev'], q, { signal: controller.signal, limit: 50 })
			.then((events) => {
				if (!controller.signal.aborted) {
					console.log('[Search] raw events for', JSON.stringify(q), ':', events.length, events);
					searchResults = events.map(parseApp);
					searchLoading = false;
				}
			})
			.catch((err) => {
				if (!controller.signal.aborted) {
					console.error('[Apps] Search failed:', err);
					searchResults = [];
					searchLoading = false;
				}
			});
	});

	// Save scroll positions before navigating away
	beforeNavigate(() => {
		if (!browser) return;
		const scrollState = {
			scrollY: window.scrollY,
			appsScrollX: appsScrollContainer?.scrollLeft ?? 0,
			stacksScrollX: stacksScrollContainer?.scrollLeft ?? 0,
			categoriesScrollX: categoriesScrollContainer?.scrollLeft ?? 0,
			timestamp: Date.now()
		};
		sessionStorage.setItem('apps_scroll', JSON.stringify(scrollState));
	});

	let pendingScrollRestore = null;
	function restoreScrollPositions() {
		if (!browser) return;
		const saved = sessionStorage.getItem('apps_scroll');
		if (saved) {
			try {
				const scrollState = JSON.parse(saved);
				if (Date.now() - scrollState.timestamp < 5 * 60 * 1000) {
					pendingScrollRestore = scrollState;
					if (scrollState.scrollY > 0) window.scrollTo(0, scrollState.scrollY);
					tryRestoreHorizontalScroll();
				}
			} catch {
				/* ignore */
			}
			sessionStorage.removeItem('apps_scroll');
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
		const catX = pendingScrollRestore.categoriesScrollX ?? 0;
		if (categoriesScrollContainer && catX > 0) {
			categoriesScrollContainer.scrollLeft = catX;
		}
		handleCategoriesScroll();
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

	// Group stacks into columns of 2
	function getStackColumns(stackList, itemsPerColumn = 2) {
		const columns = [];
		for (let i = 0; i < stackList.length; i += itemsPerColumn) {
			columns.push(stackList.slice(i, i + itemsPerColumn));
		}
		return columns;
	}

	const stackColumns = $derived(getStackColumns(resolvedDisplayStacks, 2));

	const HORIZONTAL_SCROLL_THRESHOLD = 500;

	// Load more: increase display limit AND fetch from relay if needed
	function handleLoadMoreApps() {
		displayAppsLimit += DISCOVER_APPS_INITIAL;
		if (appsHasMore && !appsLoadingMore) loadMoreApps();
	}

	function handleLoadMoreStacks() {
		displayStacksLimit += DISCOVER_STACKS_INITIAL;
		if (stacksHasMore && !stacksLoadingMore) {
			loadMoreStacks(fetchFromRelays, [ZAPSTORE_RELAY]);
		}
	}

	function handleAppsScroll() {
		if (!appsScrollContainer) return;
		const { scrollLeft, scrollWidth, clientWidth } = appsScrollContainer;
		appsScrolledRight = scrollLeft > 20;
		if (scrollWidth - scrollLeft - clientWidth < HORIZONTAL_SCROLL_THRESHOLD) {
			handleLoadMoreApps();
		}
	}

	function handleStacksScroll() {
		if (!stacksScrollContainer) return;
		const { scrollLeft, scrollWidth, clientWidth } = stacksScrollContainer;
		stacksScrolledRight = scrollLeft > 20;
		if (scrollWidth - scrollLeft - clientWidth < HORIZONTAL_SCROLL_THRESHOLD) {
			handleLoadMoreStacks();
		}
	}

	function handleCategoriesScroll() {
		if (!categoriesScrollContainer) return;
		const { scrollLeft } = categoriesScrollContainer;
		categoriesScrolledRight = scrollLeft > 20;
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

	// Fetch creator profiles when stacks change
	async function resolveCreatorsForStacks(stacksWithApps) {
		if (!browser || stacksWithApps.length === 0) return;
		try {
			const creatorPubkeys = [
				...new Set(stacksWithApps.map((s) => s.stack.pubkey).filter((pk) => isHexPubkey(pk)))
			];
			const creatorEvents = await fetchProfilesBatch(creatorPubkeys);
			resolvedDisplayStacks = stacksWithApps.map(({ stack, apps: stackApps }) => {
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
			setCached('apps:resolvedStacks', resolvedDisplayStacks);
		} catch (err) {
			console.error('[Apps] Error resolving stack creators:', err);
		} finally {
			stacksSettled = true;
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

		seedEvents(data.seedEvents ?? []);
		seedStackEvents(data.seedEvents ?? []);
		initPagination(data.appsCursor, data.appsHasMore);

		if ((!data.seedEvents || data.seedEvents.length === 0) && navigator.onLine) {
			await loadMoreApps();
			await loadMoreStacks(fetchFromRelays, [ZAPSTORE_RELAY]);
		}

		startAppsRefresh();
		restoreScrollPositions();
	});

	onDestroy(() => {
		if (browser) stopAppsRefresh();
	});
</script>

<svelte:head>
	<title>Apps — Zapstore</title>
	<meta name="description" content="Discover apps and stacks on Zapstore" />
</svelte:head>

<section class="apps-page">
	<div class="container mx-auto pt-3 pb-6 px-3 sm:px-6 sm:pt-4 lg:px-8">

	{#if searchQ}
		<!-- Search Results -->
		<div class="section-container">
			<SectionHeader title={`Results for "${searchQ}"`} />
			{#if searchLoading}
				<div class="search-spinner-wrap">
					<div class="spinner"></div>
				</div>
			{:else if searchResults && searchResults.length > 0}
				<div class="search-results-grid">
				{#each searchResults as app (app.id)}
					<AppSmallCard {app} href={getAppUrl(app)} />
					{/each}
				</div>
			{:else if searchResults !== null}
				<p class="text-muted-foreground text-sm px-1 py-4">No apps found for "{searchQ}".</p>
			{/if}
		</div>
	{:else}

		{#if SHOW_APPS_CATEGORY_ROW}
			<!-- Categories + alternative-to picker -->
			<div class="section-container apps-categories-section">
				<div class="scroll-wrap apps-categories-scroll-wrap">
					<div
						class="apps-categories-scroll"
						use:wheelScroll
						bind:this={categoriesScrollContainer}
						onscroll={handleCategoriesScroll}
					>
						<div class="apps-categories-inner">
							<AlternativeToBrowseTrigger />
							{#each APP_PAGE_CATEGORIES as cat (cat)}
								<Label
									text={cat}
									isSelected={false}
									isEmphasized={false}
									onTap={() => gotoCategorySearch(cat)}
								/>
							{/each}
						</div>
					</div>
					{#if categoriesScrolledRight}
						<div class="scroll-fade apps-cat-fade scroll-fade-left" aria-hidden="true"></div>
					{/if}
					<div class="scroll-fade apps-cat-fade scroll-fade-right" aria-hidden="true"></div>
				</div>
			</div>
		{/if}

		<!-- App stacks (first main section) -->
		<div class="section-container stacks-section">
			<SectionHeader title="App Stacks" linkText="See more" href="/stacks" />
			<div class="scroll-wrap">
				{#if resolvedDisplayStacks.length === 0 && !stacksSettled}
					<div class="horizontal-scroll">
						<div class="scroll-content">
						{#each Array(6) as _, i (i)}
							<div class="stack-column">
								{#each Array(2) as _, j (j)}
										<div class="skeleton-stack">
											<div class="skeleton-stack-grid"><SkeletonLoader /></div>
											<div class="skeleton-stack-info">
												<div class="skeleton-stack-text">
													<div class="skeleton-stack-name"><SkeletonLoader /></div>
													<div class="skeleton-stack-desc-lines">
														<div class="skeleton-stack-desc skeleton-stack-desc-1"></div>
														<div class="skeleton-stack-desc skeleton-stack-desc-2"></div>
													</div>
												</div>
												<div class="skeleton-stack-creator">
													<div class="skeleton-stack-avatar"><SkeletonLoader /></div>
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
						{#each stackColumns as column, ci (ci)}
							<div class="stack-column">
								{#each column as stack (`${stack.pubkey}:${stack.dTag}`)}
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
				{/if}

				{#if stacksScrolledRight}
					<div class="scroll-fade scroll-fade-left" aria-hidden="true"></div>
				{/if}
				<div class="scroll-fade scroll-fade-right" aria-hidden="true"></div>

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

		<!-- Latest apps (second main section) -->
		<div class="section-container apps-section">
			<SectionHeader title="Latest Apps" />
			<div class="scroll-wrap">
				{#if apps.length === 0}
					<div class="horizontal-scroll">
						<div class="scroll-content">
							{#each Array(4) as _, i (i)}
								<div class="app-column">
									{#each Array(4) as _, j (j)}
										<div class="skeleton-card">
											<div class="skeleton-icon"><SkeletonLoader /></div>
											<div class="skeleton-info">
												<div class="skeleton-name"><SkeletonLoader /></div>
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
						{#each appColumns as column, ci (ci)}
							<div class="app-column">
								{#each column as app (app.id)}
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

				{#if appsScrolledRight}
					<div class="scroll-fade scroll-fade-left" aria-hidden="true"></div>
				{/if}
				<div class="scroll-fade scroll-fade-right" aria-hidden="true"></div>

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

	{/if}

	</div>
</section>

<style>
	.search-spinner-wrap {
		display: flex;
		justify-content: center;
		padding: 3rem 0;
	}

	.search-results-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0.25rem;
	}

	.apps-page {
		min-height: 100vh;
	}

	.section-container {
		margin-bottom: 24px;
	}

	.apps-categories-section {
		margin-bottom: 16px;
		margin-top: 0;
		overflow: visible;
	}

	.apps-categories-scroll {
		overflow-x: auto;
		overflow-y: visible;
		scrollbar-width: none;
		-ms-overflow-style: none;
		margin-left: -0.75rem;
		margin-right: -0.75rem;
		padding-left: 0.75rem;
		padding-right: 0.75rem;
		padding-bottom: 4px;
	}

	.apps-categories-scroll::-webkit-scrollbar {
		display: none;
	}

	@media (min-width: 640px) {
		.apps-categories-scroll {
			margin-left: -1.5rem;
			margin-right: -1.5rem;
			padding-left: 1.5rem;
			padding-right: 1.5rem;
		}
	}

	@media (min-width: 768px) {
		.apps-categories-scroll {
			margin-left: -38px;
			margin-right: -38px;
			padding-left: 38px;
			padding-right: 38px;
		}
	}

	.apps-categories-inner {
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		align-items: center;
		gap: 8px;
		width: max-content;
		min-height: 36px;
	}

	/* Edge fades: match .apps-categories-scroll negative margins (not the same as .horizontal-scroll). */
	.apps-categories-scroll-wrap .apps-cat-fade {
		bottom: 4px;
	}

	.apps-categories-scroll-wrap .apps-cat-fade.scroll-fade-left {
		left: -0.75rem;
		width: 0.75rem;
		background: linear-gradient(to right, hsl(var(--background)), transparent);
	}

	.apps-categories-scroll-wrap .apps-cat-fade.scroll-fade-right {
		right: -0.75rem;
		width: 0.75rem;
		background: linear-gradient(to left, hsl(var(--background)), transparent);
	}

	@media (min-width: 640px) {
		.apps-categories-scroll-wrap .apps-cat-fade.scroll-fade-left {
			left: -1.5rem;
			width: 1.5rem;
		}
		.apps-categories-scroll-wrap .apps-cat-fade.scroll-fade-right {
			right: -1.5rem;
			width: 1.5rem;
		}
	}

	@media (min-width: 768px) {
		.apps-categories-scroll-wrap .apps-cat-fade.scroll-fade-left {
			left: -38px;
			width: 38px;
		}
		.apps-categories-scroll-wrap .apps-cat-fade.scroll-fade-right {
			right: -38px;
			width: 38px;
		}
	}

	/* Stacks section: SectionHeader margin to match scroll content */
	.stacks-section :global(.section-header) {
		margin-bottom: 12px;
	}

	.see-more-link {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 32px;
		padding: 0 16px;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--white33));
		text-decoration: none;
		border-radius: 9999px;
		transition: background-color 0.15s ease, color 0.15s ease;
		white-space: nowrap;
	}

	.see-more-link:hover {
		background-color: hsl(var(--white8));
		color: hsl(var(--white66));
	}

	/* Apps section: extra margin after header */
	.apps-section :global(.section-header) {
		margin-bottom: 20px;
	}

	@media (max-width: 767px) {
		.apps-section :global(.section-header) {
			margin-bottom: 18px;
		}
	}

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

		.scroll-btn-right :global(svg) {
			padding-left: 2px;
		}

		.scroll-btn-left {
			left: -56px;
		}

		.scroll-btn-left :global(svg) {
			padding-right: 2px;
		}
	}

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

	.scroll-fade {
		position: absolute;
		top: 0;
		bottom: 8px;
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
		to { transform: rotate(360deg); }
	}

	/* Skeleton styles */
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
		.skeleton-card { gap: 20px; }
		.skeleton-icon { width: 72px; height: 72px; border-radius: 24px; }
		.skeleton-name { width: 140px; height: 20px; }
		.skeleton-desc { height: 12px; }
		.skeleton-desc-1 { width: 220px; }
		.skeleton-desc-2 { width: 160px; }
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

	.skeleton-desc-1 { width: 180px; }
	.skeleton-desc-2 { width: 120px; }

	.skeleton-desc-2.desktop-only { display: none; }

	@media (min-width: 768px) {
		.skeleton-desc-2.desktop-only { display: block; }
	}

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

	.skeleton-stack-desc-1 { width: 160px; }
	.skeleton-stack-desc-2 { width: 100px; }

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
		.skeleton-stack { gap: 20px; }
		.skeleton-stack-grid { width: 104px; height: 104px; border-radius: 20px; }
		.skeleton-stack-name { width: 130px; height: 20px; }
		.skeleton-stack-desc { height: 12px; }
		.skeleton-stack-desc-1 { width: 200px; }
		.skeleton-stack-desc-2 { width: 140px; }
		.skeleton-stack-avatar { width: 24px; height: 24px; }
		.skeleton-stack-creator-name { width: 80px; height: 14px; }
	}
</style>
