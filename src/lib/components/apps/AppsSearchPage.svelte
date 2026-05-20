<script lang="js">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/stores';
	import { Search } from 'lucide-svelte';
	import { ChevronDown, ChevronLeft, ChevronRight } from '$lib/components/icons';
	import DropdownMenu from '$lib/components/common/DropdownMenu.svelte';
	import AppsBrowseSections from '$lib/components/apps/AppsBrowseSections.svelte';
	import AppSearchHitRow from '$lib/components/cards/AppSearchHitRow.svelte';
	import AppSearchHitRowSkeleton from '$lib/components/cards/AppSearchHitRowSkeleton.svelte';
	import { APP_SEARCH_HIT_SKELETON_VARIANT_COUNT } from '$lib/components/cards/app-search-hit-skeleton-presets.js';
	import {
		createAppsQuery,
		seedEvents,
		loadMoreApps,
		getHasMore,
		isLoadingMore
	} from '$lib/stores/nostr.svelte.js';
	import {
		createStacksQuery,
		seedStackEvents,
		primeZapstoreCommunityStacks
	} from '$lib/stores/stacks.svelte.js';
	import { getCached, setCached } from '$lib/stores/query-cache.js';
	import { searchApps, fetchProfilesBatch, fetchFromRelays } from '$lib/nostr/service';
	import { ZAPSTORE_RELAY, ZAPSTORE_COMMUNITY_PUBKEY } from '$lib/config';
	import { nip19 } from 'nostr-tools';
	import { isZapstoreCommunityAuthorStack, parseApp, parseProfile, encodeStackNaddr } from '$lib/nostr/models';
	import { sortAppsRelevanceDeveloperFirst } from '$lib/utils/app-search.js';
	import { isOnline } from '$lib/stores/online.svelte.js';
	import { wheelScrollPassthrough } from '$lib/actions/wheelScrollPassthrough.js';
	import { DISCOVER_APPS_INITIAL, DISCOVER_STACKS_INITIAL } from '$lib/constants';
	import '$lib/styles/browse-grid.css';

	const APPS_SEARCH_SKELETON_ROW_COUNT = APP_SEARCH_HIT_SKELETON_VARIANT_COUNT * 3;
	const SEARCH_RELAYS = [ZAPSTORE_RELAY];
	const SEARCH_FETCH_DEBOUNCE_MS = 150;
	const SEARCH_URL_SYNC_DEBOUNCE_MS = 400;
	const SEARCH_RELAY_FETCH_LIMIT = 48;
	const APPS_PER_COLUMN = 2;
	const STACKS_PER_COLUMN = 2;

	let { seedEvents: seedEventsProp = [] } = $props();

	const searchQ = $derived($page.url.searchParams.get('q')?.trim() ?? '');

	let sortDropdownOpen = $state(false);
	let sortDropdownWrap = $state(/** @type {HTMLDivElement | null} */ (null));
	let searchParsedApps = $state(/** @type {ReturnType<typeof parseApp>[] | null} */ null);
	let searchProfileByLc = $state(/** @type {Record<string, ReturnType<typeof parseProfile> | null>} */ ({}));
	let searchLoading = $state(false);
	let searchError = $state(/** @type {string|null} */ (null));
	let lastSyncedUrlQ = $state('');
	let urlSyncGen = 0;

	// eslint-disable-next-line svelte/prefer-writable-derived -- live search field; synced from URL on external nav only
	let searchBarValue = $state('');
	let searchInputEl = $state(/** @type {HTMLInputElement | null} */ (null));

	const activeSearchQuery = $derived(searchBarValue.trim());
	const showSearchResults = $derived(activeSearchQuery.length > 0);
	const offlineForSearch = $derived(browser && showSearchResults && !isOnline());

	// Browse (default view) — same data path as legacy /apps +page.svelte
	let liveApps = $state(getCached('apps'));
	let liveStacks = $state(getCached('stacks'));
	let displayAppsLimit = $state(DISCOVER_APPS_INITIAL);
	let displayStacksLimit = $state(DISCOVER_STACKS_INITIAL);
	let resolvedDisplayStacks = $state(getCached('apps:resolvedStacks') ?? []);
	let stacksSettled = $state((getCached('apps:resolvedStacks') ?? []).length > 0);
	let resolvedStackKeys = $state('');

	/** @type {{ scroll: (direction: number) => void } | null} */
	let releasesCarousel = $state(null);
	/** @type {{ scroll: (direction: number) => void } | null} */
	let stacksCarousel = $state(null);
	let releasesUi = $state({ top: 0, left: 0, right: 0, showLeft: false, showRight: false });
	let stacksUi = $state({ top: 0, left: 0, right: 0, showLeft: false, showRight: false });

	const appsHasMore = $derived(getHasMore());
	const appsLoadingMore = $derived(isLoadingMore());
	const apps = $derived((liveApps ?? []).slice(0, displayAppsLimit));
	const communityLiveStacks = $derived(
		(liveStacks ?? []).filter(({ stack }) => isZapstoreCommunityAuthorStack(stack))
	);
	const rawStacks = $derived(communityLiveStacks.slice(0, displayStacksLimit));
	const communityStacks = $derived(
		resolvedDisplayStacks.filter((s) => s.pubkey === ZAPSTORE_COMMUNITY_PUBKEY)
	);
	const appColumns = $derived(getColumns(apps, APPS_PER_COLUMN));
	const stackColumns = $derived(getColumns(communityStacks, STACKS_PER_COLUMN));

	const showSearchSkeleton = $derived(
		showSearchResults && (searchLoading || searchParsedApps === null)
	);

	/** @template T @param {T[]} items @param {number} size @returns {T[][]} */
	function getColumns(items, size) {
		const columns = [];
		for (let i = 0; i < items.length; i += size) {
			columns.push(items.slice(i, i + size));
		}
		return columns;
	}

	function focusSearchInput() {
		searchInputEl?.focus({ preventScroll: true });
	}

	$effect.pre(() => {
		const typed = searchBarValue.trim();
		if (searchQ === typed) {
			lastSyncedUrlQ = searchQ;
			return;
		}
		if (searchQ === lastSyncedUrlQ) return;
		if (typed !== searchQ && typed !== lastSyncedUrlQ && !(typed === '' && searchQ)) {
			return;
		}
		searchBarValue = searchQ;
		lastSyncedUrlQ = searchQ;
	});

	$effect(() => {
		if (!browser) return;
		const typed = searchBarValue.trim();
		if (typed === searchQ) return;

		const gen = ++urlSyncGen;
		const timer = window.setTimeout(() => {
			if (gen !== urlSyncGen) return;
			const current = searchBarValue.trim();
			if (current !== typed) return;

			const url = new URL($page.url);
			if (typed) url.searchParams.set('q', typed);
			else url.searchParams.delete('q');
			url.searchParams.delete('view');
			const next = url.pathname + url.search;
			if (next === $page.url.pathname + $page.url.search) return;
			replaceState(next, {});
		}, SEARCH_URL_SYNC_DEBOUNCE_MS);

		return () => window.clearTimeout(timer);
	});

	$effect(() => {
		if (!browser || $page.url.searchParams.get('view') !== 'releases') return;
		const url = new URL($page.url);
		url.searchParams.delete('view');
		const next = url.pathname + url.search;
		if (next !== $page.url.pathname + $page.url.search) replaceState(next, {});
	});

	$effect(() => {
		const sub = createAppsQuery().subscribe({
			next: (value) => {
				liveApps = value;
				setCached('apps', value);
			},
			error: (err) => console.error('[AppsPage] apps liveQuery error:', err)
		});
		return () => sub.unsubscribe();
	});

	$effect(() => {
		const sub = createStacksQuery().subscribe({
			next: (value) => {
				liveStacks = value;
				setCached('stacks', value);
			},
			error: (err) => console.error('[AppsPage] stacks liveQuery error:', err)
		});
		return () => sub.unsubscribe();
	});

	$effect(() => {
		if (!browser) return;
		const key = rawStacks.map((s) => s.stack.id).join(',');
		if (rawStacks.length > 0 && key !== resolvedStackKeys) {
			resolvedStackKeys = key;
			resolveCreatorsForStacks(rawStacks);
		}
	});

	$effect(() => {
		if (!browser || showSearchResults) return;
		sortDropdownOpen = false;
		const t = window.setTimeout(focusSearchInput, 50);
		return () => window.clearTimeout(t);
	});

	$effect(() => {
		if (showSearchResults) sortDropdownOpen = false;
	});

	$effect(() => {
		if (!browser || !sortDropdownOpen || !sortDropdownWrap) return;
		function handleClick(/** @type {MouseEvent} */ e) {
			if (sortDropdownWrap && !sortDropdownWrap.contains(/** @type {Node} */ (e.target))) {
				sortDropdownOpen = false;
			}
		}
		document.addEventListener('click', handleClick, true);
		return () => document.removeEventListener('click', handleClick, true);
	});

	const orderedApps = $derived.by(() => {
		if (!showSearchResults) return null;
		const apps = searchParsedApps;
		if (apps === null) return null;
		return sortAppsRelevanceDeveloperFirst(apps);
	});

	const resultRows = $derived.by(() => {
		const apps = orderedApps;
		if (apps === null) return null;
		const pkLcFn = (/** @type {string} */ p) => String(p).trim().toLowerCase();
		return apps.map((app) => ({
			app,
			profile: searchProfileByLc[pkLcFn(app.pubkey)]
		}));
	});

	const searchResultsTwoCol = $derived(
		showSearchSkeleton
			? APPS_SEARCH_SKELETON_ROW_COUNT > 1
			: (resultRows?.length ?? 0) > 1
	);

	function handleSearchInputBlur(e) {
		if (!showSearchResults) return;
		const related = /** @type {Node | null} */ (e.relatedTarget);
		const toolbar =
			e.currentTarget instanceof HTMLElement
				? e.currentTarget.closest('.apps-search-toolbar')
				: null;
		const filters = toolbar?.querySelector('.apps-search-toolbar-filters');
		if (filters && related && filters.contains(related)) return;
		window.setTimeout(focusSearchInput, 0);
	}

	$effect(() => {
		if (!browser) return;

		const q = activeSearchQuery;
		searchError = null;

		if (!q) {
			searchLoading = false;
			searchParsedApps = null;
			searchProfileByLc = {};
			return;
		}

		searchLoading = true;
		searchParsedApps = null;
		searchProfileByLc = {};

		if (!isOnline()) {
			searchLoading = false;
			searchParsedApps = [];
			return;
		}

		let aborted = false;
		const ac = new AbortController();

		const timer = window.setTimeout(() => {
			void (async () => {
				try {
					const events = await searchApps(SEARCH_RELAYS, q, {
						signal: ac.signal,
						limit: SEARCH_RELAY_FETCH_LIMIT
					});
					if (aborted || ac.signal.aborted) return;
					const apps = events.map(parseApp);
					const pubs = [...new Set(apps.map((a) => a.pubkey))];
					const rawProfiles = await fetchProfilesBatch(pubs, { signal: ac.signal });
					if (aborted || ac.signal.aborted) return;
					const byLc = /** @type {Record<string, ReturnType<typeof parseProfile> | null>} */ ({});
					for (const [pk, ev] of rawProfiles) {
						byLc[String(pk).trim().toLowerCase()] = parseProfile(ev);
					}
					searchProfileByLc = Object.fromEntries(
						pubs.map((pk) => [String(pk).trim().toLowerCase(), byLc[String(pk).trim().toLowerCase()] ?? null])
					);
					searchParsedApps = apps;
				} catch {
					if (!aborted && !ac.signal.aborted) {
						searchError = 'Search failed. Try again.';
						searchParsedApps = [];
						searchProfileByLc = {};
					}
				} finally {
					if (!aborted && !ac.signal.aborted) searchLoading = false;
				}
			})();
		}, SEARCH_FETCH_DEBOUNCE_MS);

		return () => {
			aborted = true;
			ac.abort();
			window.clearTimeout(timer);
		};
	});

	function submitAppsSearch(ev) {
		ev.preventDefault();
		urlSyncGen += 1;
		const q = searchBarValue.trim();
		lastSyncedUrlQ = q;
		if (q) goto(`/apps?q=${encodeURIComponent(q)}`, { keepFocus: true, noScroll: true });
		else goto('/apps', { keepFocus: true, noScroll: true });
	}

	let lastLoadMoreAppsAt = 0;
	let lastLoadMoreStacksAt = 0;
	const LOAD_MORE_COOLDOWN_MS = 600;

	function handleLoadMoreApps() {
		const now = Date.now();
		if (now - lastLoadMoreAppsAt < LOAD_MORE_COOLDOWN_MS) return;
		lastLoadMoreAppsAt = now;
		const nextLimit = displayAppsLimit + DISCOVER_APPS_INITIAL;
		if (nextLimit === displayAppsLimit) return;
		displayAppsLimit = nextLimit;
		if (appsHasMore && !appsLoadingMore) loadMoreApps();
	}

	function handleLoadMoreStacks() {
		const now = Date.now();
		if (now - lastLoadMoreStacksAt < LOAD_MORE_COOLDOWN_MS) return;
		lastLoadMoreStacksAt = now;
		const nextLimit = displayStacksLimit + DISCOVER_STACKS_INITIAL;
		if (nextLimit === displayStacksLimit) return;
		displayStacksLimit = nextLimit;
		void primeZapstoreCommunityStacks(fetchFromRelays, [ZAPSTORE_RELAY], displayStacksLimit);
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
			console.error('[AppsPage] Error resolving stack creators:', err);
		} finally {
			stacksSettled = true;
		}
	}

	onMount(async () => {
		if (!browser) return;

		await seedEvents(seedEventsProp ?? []);
		await seedStackEvents(seedEventsProp ?? []);

		if ((!seedEventsProp || seedEventsProp.length === 0) && navigator.onLine) {
			void loadMoreApps();
			void primeZapstoreCommunityStacks(fetchFromRelays, [ZAPSTORE_RELAY], DISCOVER_STACKS_INITIAL);
		}

		window.setTimeout(focusSearchInput, 50);
	});
</script>

<section class="apps-page" use:wheelScrollPassthrough>
	<div class="apps-search-outer container mx-auto px-0 sm:px-6 lg:px-8">
		<div class="apps-search-frame">
			<div class="apps-search-toolbar">
				<div class="apps-search-toolbar-query">
					<form class="apps-search-field-wrap" onsubmit={submitAppsSearch}>
						<div class="apps-search-input-row">
							<Search
								class="apps-search-input-icon flex-shrink-0"
								style="color: var(--white33);"
								strokeWidth={2.5}
								aria-hidden="true"
							/>
							<input
								type="search"
								bind:this={searchInputEl}
								bind:value={searchBarValue}
								placeholder="Search apps"
								class="apps-search-input semibold18"
								aria-label="Search apps"
								autocomplete="off"
								spellcheck="false"
								onblur={handleSearchInputBlur}
							/>
						</div>
					</form>
				</div>
				<div class="apps-search-toolbar-divider" aria-hidden="true"></div>
				<div
					class="apps-search-toolbar-filters apps-search-controls"
					class:apps-search-controls--disabled={showSearchSkeleton}
				>
					<div class="apps-sort-wrap" bind:this={sortDropdownWrap}>
						<button
							type="button"
							class="forum-all-btn forum-latest-btn apps-sort-trigger"
							onclick={() => {
								sortDropdownOpen = !sortDropdownOpen;
							}}
							aria-label="Sort order"
							aria-expanded={sortDropdownOpen}
							disabled={showSearchSkeleton}
						>
							<span>Relevance</span>
							<span class="forum-all-btn-icon">
								<ChevronDown variant="outline" size={14} strokeWidth={1.4} color="var(--white66)" />
							</span>
						</button>
						{#if sortDropdownOpen}
							<DropdownMenu class="apps-search-sort-dropdown">
								<button
									type="button"
									class="dropdown-item dropdown-item--active"
									role="menuitem"
									onclick={() => {
										sortDropdownOpen = false;
									}}
								>
									Relevance
								</button>
							</DropdownMenu>
						{/if}
					</div>
				</div>
			</div>

			<div class="apps-search-results-scroll" data-main-scroll>
				<div class="apps-search-panel" class:hidden={!showSearchResults} aria-hidden={!showSearchResults}>
					{#if showSearchResults && offlineForSearch}
						<p class="apps-search-empty regular14">
							You're offline — connect to the network to search the catalog.
						</p>
					{:else if showSearchResults && showSearchSkeleton}
						<ul
							class="browse-grid apps-search-results-list"
							class:browse-grid--two-col={searchResultsTwoCol}
							role="list"
						>
							{#each Array(APPS_SEARCH_SKELETON_ROW_COUNT) as _, i (i)}
								<li class="browse-grid-item browse-grid-item--app apps-search-result-row">
									<AppSearchHitRowSkeleton
										variant={i % APP_SEARCH_HIT_SKELETON_VARIANT_COUNT}
										showDescription={true}
										showChevron={false}
									/>
								</li>
							{/each}
						</ul>
					{:else if showSearchResults && searchError}
						<p class="apps-search-empty regular14">{searchError}</p>
					{:else if showSearchResults && resultRows && resultRows.length > 0}
						<ul
							class="browse-grid apps-search-results-list"
							class:browse-grid--two-col={searchResultsTwoCol}
							role="list"
						>
							{#each resultRows as row (row.app.id)}
								<li class="browse-grid-item browse-grid-item--app apps-search-result-row">
									<AppSearchHitRow
										app={row.app}
										authorProfile={row.profile}
										showDescription={true}
									/>
								</li>
							{/each}
						</ul>
					{:else if showSearchResults && searchParsedApps !== null}
						<p class="apps-search-empty regular14">
							No apps found for "{activeSearchQuery}".
						</p>
					{/if}
				</div>

				<AppsBrowseSections
					hidden={showSearchResults}
					bind:releasesCarousel
					bind:stacksCarousel
					onReleasesUiChange={(ui) => {
						if (
							releasesUi.showLeft === ui.showLeft &&
							releasesUi.showRight === ui.showRight &&
							releasesUi.top === ui.top &&
							releasesUi.left === ui.left &&
							releasesUi.right === ui.right
						) {
							return;
						}
						releasesUi = ui;
					}}
					onStacksUiChange={(ui) => {
						if (
							stacksUi.showLeft === ui.showLeft &&
							stacksUi.showRight === ui.showRight &&
							stacksUi.top === ui.top &&
							stacksUi.left === ui.left &&
							stacksUi.right === ui.right
						) {
							return;
						}
						stacksUi = ui;
					}}
					{apps}
					{appColumns}
					{stackColumns}
					{stacksSettled}
					{resolvedDisplayStacks}
					appsLoadingMore={appsLoadingMore}
					stacksLoadingMore={false}
					getAppUrl={getAppUrl}
					getStackUrl={getStackUrl}
					onLoadMoreApps={handleLoadMoreApps}
					onLoadMoreStacks={handleLoadMoreStacks}
				/>
			</div>
		</div>

		{#if !showSearchResults}
			{#if releasesUi.showLeft || releasesUi.showRight}
				<div
					class="screenshots-controls"
					style="top: {releasesUi.top}px"
					aria-hidden={!releasesUi.showLeft && !releasesUi.showRight}
				>
					{#if releasesUi.showLeft}
						<button
							type="button"
							class="screenshots-btn screenshots-btn-left"
							style="left: {releasesUi.left}px"
							onclick={() => releasesCarousel?.scroll(-1)}
							aria-label="Scroll releases left"
						>
							<ChevronLeft size={14} strokeWidth={1.4} color="var(--white66)" />
						</button>
					{/if}
					{#if releasesUi.showRight}
						<button
							type="button"
							class="screenshots-btn screenshots-btn-right"
							style="right: {releasesUi.right}px"
							onclick={() => releasesCarousel?.scroll(1)}
							aria-label="Scroll releases right"
						>
							<ChevronRight size={14} strokeWidth={1.4} color="var(--white66)" />
						</button>
					{/if}
				</div>
			{/if}
			{#if stacksUi.showLeft || stacksUi.showRight}
				<div
					class="screenshots-controls"
					style="top: {stacksUi.top}px"
					aria-hidden={!stacksUi.showLeft && !stacksUi.showRight}
				>
					{#if stacksUi.showLeft}
						<button
							type="button"
							class="screenshots-btn screenshots-btn-left"
							style="left: {stacksUi.left}px"
							onclick={() => stacksCarousel?.scroll(-1)}
							aria-label="Scroll stacks left"
						>
							<ChevronLeft size={14} strokeWidth={1.4} color="var(--white66)" />
						</button>
					{/if}
					{#if stacksUi.showRight}
						<button
							type="button"
							class="screenshots-btn screenshots-btn-right"
							style="right: {stacksUi.right}px"
							onclick={() => stacksCarousel?.scroll(1)}
							aria-label="Scroll stacks right"
						>
							<ChevronRight size={14} strokeWidth={1.4} color="var(--white66)" />
						</button>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</section>

<style>
	.apps-page {
		display: flex;
		flex-direction: column;
		min-height: calc(100dvh - 64px);
		height: calc(100dvh - 64px);
		overflow-x: visible;
		overflow-y: hidden;
	}

	.apps-search-outer {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.apps-search-frame {
		--apps-pad-x: 14px;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		border-left: 1px solid var(--white16);
		border-right: 1px solid var(--white16);
		margin-left: -16px;
		margin-right: -16px;
	}

	@media (min-width: 768px) {
		.apps-search-frame {
			--apps-pad-x: 20px;
		}
	}

	@media (max-width: 639px) {
		.apps-search-frame {
			margin-left: -4px;
			margin-right: -4px;
		}
	}

	@media (max-width: 767px) {
		.apps-search-frame {
			border-left: none;
			border-right: none;
			margin-left: 0;
			margin-right: 0;
		}
	}

	.apps-search-toolbar {
		display: flex;
		flex-direction: row;
		align-items: stretch;
		flex-shrink: 0;
		padding: 0;
		border-bottom: 1px solid var(--white16);
		background-color: var(--background);
		z-index: 2;
	}

	.apps-search-toolbar-query,
	.apps-search-toolbar-filters {
		display: flex;
		align-items: center;
		padding: var(--apps-pad-x);
	}

	.apps-search-toolbar-query {
		flex: 1;
		min-width: 0;
	}

	.apps-search-toolbar-divider {
		flex-shrink: 0;
		width: 1px;
		align-self: stretch;
		background-color: var(--white16);
	}

	.apps-search-toolbar-filters {
		flex-shrink: 0;
		justify-content: flex-end;
	}

	.apps-search-results-scroll {
		flex: 1;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}

	.apps-search-field-wrap {
		width: 100%;
		min-width: 0;
	}

	.apps-search-input-row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-width: 0;
	}

	.apps-search-input-icon {
		width: 1.5rem;
		height: 1.5rem;
	}

	@media (min-width: 768px) {
		.apps-search-input-icon {
			width: 1.625rem;
			height: 1.625rem;
		}
	}

	.apps-search-input {
		flex: 1;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: none;
		background: transparent;
		outline: none;
		line-height: 1.3;
		letter-spacing: -0.02em;
		color: var(--white);
	}

	@media (min-width: 768px) {
		.apps-search-input {
			font-size: 20px;
			font-weight: 600;
		}
	}

	.apps-search-input::placeholder {
		color: var(--white33);
	}

	.apps-search-controls {
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.apps-search-controls--disabled {
		opacity: 0.45;
		pointer-events: none;
	}

	.apps-sort-wrap {
		position: relative;
		z-index: 2;
		flex-shrink: 0;
	}

	.forum-all-btn {
		position: relative;
		z-index: 1;
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 32px;
		padding: 0 12px 0 16px;
		font-size: 14px;
		font-weight: 500;
		color: var(--white66);
		background: var(--white16);
		border: none;
		border-radius: 12px;
	}

	.forum-all-btn.forum-latest-btn {
		background: var(--gray66);
		color: var(--white);
	}

	.forum-all-btn.forum-latest-btn:hover:not(:disabled) {
		filter: brightness(1.08);
	}

	.forum-all-btn:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.forum-all-btn .forum-all-btn-icon {
		display: flex;
		align-items: center;
		padding-top: 2px;
	}

	:global(.apps-search-sort-dropdown) {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		min-width: 160px;
		z-index: 50;
	}

	.apps-search-empty {
		color: var(--white66);
		margin: 0;
		padding: var(--apps-pad-x);
	}

	.apps-search-result-row:hover {
		background-color: var(--white4);
	}

	.apps-search-panel.hidden {
		display: none;
	}

	.screenshots-controls {
		position: absolute;
		left: 0;
		right: 0;
		transform: translateY(-50%);
		pointer-events: none;
		z-index: 30;
	}

	.screenshots-controls .screenshots-btn {
		pointer-events: auto;
	}

	.screenshots-btn {
		display: none;
	}

	@media (min-width: 768px) and (hover: hover) and (pointer: fine) {
		.screenshots-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			position: absolute;
			top: 50%;
			transform: translateY(-60%) scale(1);
			width: 34px;
			height: 34px;
			border-radius: 50%;
			border: none;
			background: var(--gray66);
			backdrop-filter: blur(var(--blur-sm));
			-webkit-backdrop-filter: blur(var(--blur-sm));
			cursor: pointer;
			z-index: 20;
			transition: transform 0.2s ease;
		}

		.screenshots-btn-left {
			transform: translate(-50%, -60%);
		}

		.screenshots-btn-left:hover {
			transform: translate(-50%, -60%) scale(1.08);
		}

		.screenshots-btn-left:active {
			transform: translate(-50%, -60%) scale(0.95);
		}

		.screenshots-btn-left :global(svg) {
			padding-right: 2px;
		}

		.screenshots-btn-right {
			left: auto;
			transform: translate(50%, -60%);
		}

		.screenshots-btn-right:hover {
			transform: translate(50%, -60%) scale(1.08);
		}

		.screenshots-btn-right:active {
			transform: translate(50%, -60%) scale(0.95);
		}

		.screenshots-btn-right :global(svg) {
			padding-left: 2px;
		}
	}
</style>
