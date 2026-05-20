<script lang="js">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Search } from 'lucide-svelte';
	import DropdownMenu from '$lib/components/common/DropdownMenu.svelte';
	import { ChevronDown } from '$lib/components/icons';
	import AppSearchHitRow from '$lib/components/cards/AppSearchHitRow.svelte';
	import AppSearchHitRowSkeleton from '$lib/components/cards/AppSearchHitRowSkeleton.svelte';
	import { APP_SEARCH_HIT_SKELETON_VARIANT_COUNT } from '$lib/components/cards/app-search-hit-skeleton-presets.js';
	import { createAppsListingQuery } from '$lib/purpleweb';
	import { searchApps, fetchProfilesBatch } from '$lib/purpleweb';
	import { ZAPSTORE_RELAY } from '$lib/config';
	import { parseApp, parseProfile } from '$lib/nostr/models';
	import {
		sortAppsByLatestRelease,
		sortAppsDeveloperFirst,
		sortAppsRelevanceDeveloperFirst
	} from '$lib/utils/app-search.js';
	import { isOnline } from '$lib/stores/online.svelte.js';

	const APPS_SEARCH_SKELETON_ROW_COUNT = APP_SEARCH_HIT_SKELETON_VARIANT_COUNT * 3;
	const SEARCH_RELAYS = [ZAPSTORE_RELAY];
	const SEARCH_DEBOUNCE_MS = 300;
	const SEARCH_RELAY_FETCH_LIMIT = 48;

	const searchQ = $derived($page.url.searchParams.get('q')?.trim() ?? '');
	const releasesBrowse = $derived($page.url.searchParams.get('view') === 'releases');
	const isLocalBrowse = $derived(!searchQ);

	const listing = createAppsListingQuery();
	const liveApps = $derived(listing.items);
	let searchParsedApps = $state(/** @type {ReturnType<typeof parseApp>[] | null} */ null);
	let searchProfileByLc = $state(/** @type {Record<string, ReturnType<typeof parseProfile> | null>} */ ({}));
	let browseProfileByLc = $state(
		/** @type {Record<string, ReturnType<typeof parseProfile> | null>} */ ({})
	);
	let searchLoading = $state(false);
	let searchError = $state(/** @type {string|null} */ (null));
	let lastSyncedUrlQ = $state('');

	// eslint-disable-next-line svelte/prefer-writable-derived -- live search field; synced from URL on external nav only
	let searchBarValue = $state('');
	let searchInputEl = $state(/** @type {HTMLInputElement | null} */ (null));

	const activeSearchQuery = $derived(searchBarValue.trim());
	const offlineForSearch = $derived(browser && !!searchQ && !isOnline());

	/** @type {'latest-releases' | 'relevance'} */
	let listMode = $state('latest-releases');
	let toolbarDropdownOpen = $state(false);
	let toolbarDropdownWrap = $state(/** @type {HTMLDivElement | null} */ (null));

	const toolbarDropdownLabel = $derived(
		listMode === 'latest-releases' ? 'Latest Releases' : 'Relevance'
	);

	$effect.pre(() => {
		if (!searchQ) {
			lastSyncedUrlQ = '';
			return;
		}
		if (searchQ !== lastSyncedUrlQ) {
			searchBarValue = searchQ;
			lastSyncedUrlQ = searchQ;
		}
	});

	$effect(() => {
		if (!browser) return;
		searchQ;
		releasesBrowse;
		listMode = searchQ ? 'relevance' : 'latest-releases';
		toolbarDropdownOpen = false;
	});

	const showSearchSkeleton = $derived(
		!!searchQ && (searchLoading || searchParsedApps === null)
	);

	function focusSearchInput() {
		searchInputEl?.focus({ preventScroll: true });
	}

	$effect(() => {
		if (!browser || !searchQ) return;
		const t = window.setTimeout(focusSearchInput, 100);
		return () => window.clearTimeout(t);
	});

	/** Profiles for local browse (?view=releases, no ?q=). */
	$effect(() => {
		if (!browser || searchQ) return;
		const apps = liveApps ?? [];
		if (apps.length === 0) {
			browseProfileByLc = {};
			return;
		}

		let aborted = false;
		void (async () => {
			try {
				const pubs = [...new Set(apps.map((a) => a.pubkey))];
				const rawProfiles = await fetchProfilesBatch(pubs);
				if (aborted) return;
				const byLc = /** @type {Record<string, ReturnType<typeof parseProfile> | null>} */ ({});
				for (const [pk, ev] of rawProfiles) {
					byLc[String(pk).trim().toLowerCase()] = parseProfile(ev);
				}
				browseProfileByLc = Object.fromEntries(
					pubs.map((pk) => [String(pk).trim().toLowerCase(), byLc[String(pk).trim().toLowerCase()] ?? null])
				);
			} catch (err) {
				console.error('[AppsSearch] browse profile fetch failed:', err);
			}
		})();

		return () => {
			aborted = true;
		};
	});

	function orderApps(/** @type {ReturnType<typeof parseApp>[]} */ apps) {
		if (listMode === 'latest-releases') {
			return sortAppsByLatestRelease(apps);
		}
		if (searchQ) {
			return sortAppsRelevanceDeveloperFirst(apps);
		}
		return sortAppsDeveloperFirst(apps);
	}

	const orderedApps = $derived.by(() => {
		if (searchQ) {
			const apps = searchParsedApps;
			if (apps === null) return null;
			return orderApps(apps);
		}
		return orderApps(liveApps ?? []);
	});

	const resultRows = $derived.by(() => {
		const apps = orderedApps;
		if (apps === null) return null;
		const pkLcFn = (/** @type {string} */ p) => String(p).trim().toLowerCase();
		const profiles = searchQ ? searchProfileByLc : browseProfileByLc;
		return apps.map((app) => ({
			app,
			profile: profiles[pkLcFn(app.pubkey)]
		}));
	});

	/** @param {FocusEvent} e */
	function handleSearchInputBlur(e) {
		if (!searchQ) return;
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
		if (!toolbarDropdownOpen || !toolbarDropdownWrap) return;
		function handleClick(/** @type {MouseEvent} */ e) {
			if (toolbarDropdownWrap && !toolbarDropdownWrap.contains(/** @type {Node} */ (e.target))) {
				toolbarDropdownOpen = false;
			}
		}
		document.addEventListener('click', handleClick, true);
		return () => document.removeEventListener('click', handleClick, true);
	});

	$effect(() => {
		if (!browser || !searchQ) return;

		const q = activeSearchQuery || searchQ;
		searchError = null;

		if (!q) {
			searchLoading = false;
			searchParsedApps = null;
			searchProfileByLc = {};
			return;
		}

		if (offlineForSearch) {
			searchLoading = false;
			searchParsedApps = [];
			searchProfileByLc = {};
			return;
		}

		let aborted = false;
		const ac = new AbortController();
		searchLoading = true;
		searchParsedApps = null;
		searchProfileByLc = {};

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
		}, SEARCH_DEBOUNCE_MS);

		return () => {
			aborted = true;
			ac.abort();
			window.clearTimeout(timer);
		};
	});

	function submitAppsSearch(/** @type {SubmitEvent} */ ev) {
		ev.preventDefault();
		const q = searchBarValue.trim();
		if (q) goto(`/apps?q=${encodeURIComponent(q)}`);
		else if (releasesBrowse) goto('/apps');
		else goto('/apps');
	}
</script>

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
							autofocus={!!searchQ}
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
				<div class="apps-sort-wrap" bind:this={toolbarDropdownWrap}>
					<button
						type="button"
						class="forum-all-btn forum-latest-btn apps-sort-trigger"
						onclick={() => {
							toolbarDropdownOpen = !toolbarDropdownOpen;
						}}
						aria-label="List mode"
						aria-expanded={toolbarDropdownOpen}
						disabled={showSearchSkeleton}
					>
						<span>{toolbarDropdownLabel}</span>
						<span class="forum-all-btn-icon">
							<ChevronDown variant="outline" size={14} strokeWidth={1.4} color="var(--white66)" />
						</span>
					</button>
					{#if toolbarDropdownOpen}
						<DropdownMenu class="apps-search-sort-dropdown">
							<button
								type="button"
								class="dropdown-item"
								class:dropdown-item--active={listMode === 'latest-releases'}
								role="menuitem"
								onclick={() => {
									listMode = 'latest-releases';
									toolbarDropdownOpen = false;
								}}
							>
								Latest Releases
							</button>
							<button
								type="button"
								class="dropdown-item"
								class:dropdown-item--active={listMode === 'relevance'}
								role="menuitem"
								onclick={() => {
									listMode = 'relevance';
									toolbarDropdownOpen = false;
								}}
							>
								Relevance
							</button>
						</DropdownMenu>
					{/if}
				</div>
			</div>
		</div>

		<div class="apps-search-results-scroll">
			{#if offlineForSearch}
				<p class="apps-search-empty regular14">
					You're offline — connect to the network to search the catalog.
				</p>
			{:else if showSearchSkeleton}
				<ul class="apps-search-results-list" role="list">
					{#each Array(APPS_SEARCH_SKELETON_ROW_COUNT) as _, i (i)}
						<li class="apps-search-result-row">
							<AppSearchHitRowSkeleton
								variant={i % APP_SEARCH_HIT_SKELETON_VARIANT_COUNT}
								showDescription={true}
								showChevron={false}
							/>
						</li>
					{/each}
				</ul>
			{:else if searchError}
				<p class="apps-search-empty regular14">{searchError}</p>
			{:else if resultRows && resultRows.length > 0}
				<ul class="apps-search-results-list" role="list">
					{#each resultRows as row (row.app.id)}
						<li class="apps-search-result-row">
							<AppSearchHitRow
								app={row.app}
								authorProfile={row.profile}
								showDescription={true}
							/>
						</li>
					{/each}
				</ul>
			{:else if searchQ && searchParsedApps !== null}
				<p class="apps-search-empty regular14">
					No apps found for "{activeSearchQuery}".
				</p>
			{:else if isLocalBrowse}
				<p class="apps-search-empty regular14">No releases in your catalog yet.</p>
			{/if}
		</div>
	</div>
</div>

<style>
	.apps-search-outer {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.apps-search-frame {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		border-left: 1px solid var(--white16);
		border-right: 1px solid var(--white16);
		margin-left: -16px;
		margin-right: -16px;
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

	.apps-search-toolbar-query {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		padding: 14px;
	}

	@media (min-width: 768px) {
		.apps-search-toolbar-query {
			padding: 16px;
		}
	}

	.apps-search-toolbar-divider {
		flex-shrink: 0;
		width: 1px;
		align-self: stretch;
		background-color: var(--white16);
	}

	.apps-search-toolbar-filters {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding: 14px;
	}

	@media (min-width: 768px) {
		.apps-search-toolbar-filters {
			padding: 16px;
		}
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
		pointer-events: auto;
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
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.forum-all-btn .forum-all-btn-icon {
		display: flex;
		align-items: center;
		padding-top: 2px;
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
		padding: 14px;
	}

	@media (min-width: 768px) {
		.apps-search-empty {
			padding: 16px;
		}
	}

	.apps-search-results-list {
		display: grid;
		grid-template-columns: 1fr;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	@media (min-width: 768px) {
		.apps-search-results-list {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	.apps-search-result-row {
		min-width: 0;
		border-bottom: 1px solid var(--white16);
		padding: 14px 14px 12px;
	}

	@media (min-width: 768px) {
		.apps-search-result-row {
			padding: 16px 16px 14px;
			border-right: 1px solid var(--white16);
		}

		.apps-search-result-row:nth-child(2n) {
			border-right: none;
		}
	}

	.apps-search-result-row:hover {
		background-color: var(--white4);
	}
</style>
