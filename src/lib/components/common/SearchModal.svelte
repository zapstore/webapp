<script lang="js">
import { browser } from '$app/environment';
import { Search, X } from 'lucide-svelte';
import { fade } from 'svelte/transition';
import Label from './Label.svelte';
import ProfilePic from './ProfilePic.svelte';
import { ArrowDown, ChevronRight, Recent } from '$lib/components/icons';
import { wheelScroll } from '$lib/actions/wheelScroll.js';
import { goto } from '$app/navigation';
import { zapstoreProfileStore, ZAPSTORE_PUBKEY } from '$lib/services/profile-search';
import { ZAPSTORE_RELAY } from '$lib/config';
import { fetchProfilesBatch, searchApps } from '$lib/nostr/service';
import { parseApp, parseProfile } from '$lib/nostr/models';
import AppSearchHitRow from '$lib/components/cards/AppSearchHitRow.svelte';
import AppSearchHitRowSkeleton from '$lib/components/cards/AppSearchHitRowSkeleton.svelte';
import { SEARCH_PREVIEW_SKELETON_VARIANTS } from '$lib/components/cards/app-search-hit-skeleton-presets.js';
import { isOnline } from '$lib/stores/online.svelte.js';
import { sortAppsRelevanceDeveloperFirst } from '$lib/utils/app-search.js';

let { open = $bindable(false), searchQuery = $bindable(''), categories: _categories = [], platforms: _platforms = [] } = $props();

let searchInput = $state(undefined);

const RECENTS_STORAGE_KEY = 'zapstore.searchRecent';
const RECENTS_MAX = 12;
const SEARCH_RELAYS = [ZAPSTORE_RELAY];
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_RELAY_FETCH_LIMIT = 48;

/** @returns {string[]} */
function readRecentsFromStorage() {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(RECENTS_STORAGE_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed.filter((/** @type {unknown} */ x) => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

/** @param {string[]} list */
function writeRecentsToStorage(list) {
	if (!browser) return;
	try {
		localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(list.slice(0, RECENTS_MAX)));
	} catch {
		/* quota / privacy mode */
	}
}

/** @param {string} term */
function addToRecents(term) {
	const t = term.trim();
	if (!t) return;
	const next = [t, ...readRecentsFromStorage().filter((x) => x !== t)].slice(0, RECENTS_MAX);
	writeRecentsToStorage(next);
	recentSearches = next;
}

let recentSearches = $state(readRecentsFromStorage());

let zapstoreProfile = $state(null);
$effect(() => {
	const unsub = zapstoreProfileStore.subscribe((v) => (zapstoreProfile = v));
	return unsub;
});

const commonLabels = [
	'Nostr',
	'Bitcoin',
	'Chat',
	'Files',
	'Wallet',
	'Social',
	'Productivity',
	'Utilities',
	'Games',
	'Developer'
];

const typedQuery = $derived(searchQuery.trim());
const showLiveResults = $derived(typedQuery.length > 0);
const offlineForSearch = $derived(browser && !isOnline());

let previewHits = $state(
	/** @type {{ app: ReturnType<typeof parseApp>; profile: ReturnType<typeof parseProfile> | null | undefined }[]} */ ([])
);
let previewLoading = $state(false);
let previewError = $state(/** @type {string|null} */ (null));

$effect(() => {
	if (!browser || !open) return;
	recentSearches = readRecentsFromStorage();
});

$effect(() => {
	const el = searchInput;
	if (open && el) {
		setTimeout(() => el.focus(), 100);
	}
	if (!open) {
		searchQuery = '';
		previewHits = [];
		previewLoading = false;
		previewError = null;
	}
});

$effect(() => {
	if (!browser || !open) return;
	const q = typedQuery;
	previewError = null;

	if (!q) {
		previewHits = [];
		previewLoading = false;
		return;
	}

	if (offlineForSearch) {
		previewHits = [];
		previewLoading = false;
		return;
	}

	let aborted = false;
	const ac = new AbortController();
	previewLoading = true;
	previewHits = [];

	const timer = window.setTimeout(() => {
		void (async () => {
			try {
				const events = await searchApps(SEARCH_RELAYS, q, {
					signal: ac.signal,
					limit: SEARCH_RELAY_FETCH_LIMIT
				});
				if (aborted || ac.signal.aborted) return;
				const apps = sortAppsRelevanceDeveloperFirst(events.map(parseApp));
				const pubs = [...new Set(apps.map((a) => a.pubkey))];
				const rawProfiles = await fetchProfilesBatch(pubs, { signal: ac.signal });
				if (aborted || ac.signal.aborted) return;
				const byLc = /** @type {Record<string, ReturnType<typeof parseProfile> | null>} */ ({});
				for (const [pk, ev] of rawProfiles) {
					const key = String(pk).trim().toLowerCase();
					byLc[key] = parseProfile(ev);
				}
				previewHits = apps.map((app) => ({
					app,
					profile: byLc[String(app.pubkey).trim().toLowerCase()] ?? null
				}));
			} catch {
				if (!aborted && !ac.signal.aborted) {
					previewError = 'Search failed. Try again.';
					previewHits = [];
				}
			} finally {
				if (!aborted && !ac.signal.aborted) previewLoading = false;
			}
		})();
	}, SEARCH_DEBOUNCE_MS);

	return () => {
		aborted = true;
		ac.abort();
		window.clearTimeout(timer);
	};
});

function handleBackdropClick(e) {
	if (e.target === e.currentTarget) {
		open = false;
	}
}

function handleKeydown(e) {
	if (!open) return;
	if (e.key === 'Escape') {
		open = false;
	}
	if (e.key === 'Enter' && typedQuery) {
		handleSearch();
	}
}

function handleSearch() {
	const q = typedQuery;
	if (!q) return;
	addToRecents(q);
	open = false;
	goto(`/apps?q=${encodeURIComponent(q)}`);
}

function openSearchForTerm(/** @type {string} */ term) {
	const t = term.trim();
	if (!t) return;
	addToRecents(t);
	open = false;
	goto(`/apps?q=${encodeURIComponent(t)}`);
}

function handleAllResultsClick() {
	openSearchForTerm(typedQuery);
}

function handleHitNavigate() {
	if (typedQuery) addToRecents(typedQuery);
	open = false;
}

function handleLabelTap(label) {
	searchQuery = label;
	addToRecents(label);
	open = false;
	goto(`/apps?q=${encodeURIComponent(label)}`);
}
</script>

{#snippet AndroidIcon()}
	<svg
		class="platform-icon"
		viewBox="0 0 24 24"
		fill="currentColor"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path
			d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.463 11.463 0 00-8.94 0L5.65 5.67c-.19-.29-.58-.38-.87-.2-.28.18-.37.54-.22.83L6.4 9.48A10.78 10.78 0 003 18h18a10.78 10.78 0 00-3.4-8.52zM8.5 14c-.83 0-1.5-.67-1.5-1.5S7.67 11 8.5 11s1.5.67 1.5 1.5S9.33 14 8.5 14zm7 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
		/>
	</svg>
{/snippet}

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="fixed inset-0 z-[100] bg-overlay flex justify-center items-start"
		style="position: fixed !important; inset: 0 !important; margin: 0 !important;"
		transition:fade={{ duration: 150 }}
		onclick={handleBackdropClick}
		role="dialog"
		aria-modal="true"
		aria-label="Search overlay"
		tabindex="-1"
	>
		<div
			class="search-modal-panel border-subtle shadow-2xl overflow-hidden backdrop-blur-lg w-full search-modal-width mx-0 sm:mx-4 flex flex-col min-h-0"
			style="
        background: linear-gradient(
          to bottom,
          var(--gray33),
          hsl(241 15% 25% / 0.5)
        );
        border-top-left-radius: 0;
        border-top-right-radius: 0;
        border-bottom-left-radius: var(--radius-32);
        border-bottom-right-radius: var(--radius-32);
        max-height: min(90vh, calc(100dvh - 16px));
      "
			transition:fade={{ duration: 150 }}
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Search Bar -->
			<div class="p-3 pb-1 shrink-0">
				<div
					class="search-bar-btn flex items-center gap-3 pl-3 pr-4 h-10 transition-all duration-200 focus-within:shadow-[0_0_80px_color-mix(in_srgb,var(--blurpleColor)_20%,transparent),0_0_160px_color-mix(in_srgb,var(--blurpleColor)_15%,transparent),0_0_240px_color-mix(in_srgb,var(--blurpleColor)_12%,transparent),0_0_320px_color-mix(in_srgb,var(--blurpleColor)_8%,transparent)]"
					style="border-color: var(--white16); background-color: var(--black16);"
				>
					<Search class="h-5 w-5 flex-shrink-0" style="color: var(--white33);" />
					<input
						bind:this={searchInput}
						type="text"
						bind:value={searchQuery}
						placeholder="Search apps"
						class="search-input flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none regular16 min-w-0"
					/>
					<button
						type="button"
						onclick={() => (open = false)}
						class="close-btn rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
						aria-label="Close search"
					>
						<X class="h-5 w-5" style="color: var(--white33);" />
					</button>
				</div>
			</div>

			{#if showLiveResults}
				<div class="query-action-row shrink-0 px-3 pb-2">
					<button
						type="button"
						class="query-go-row w-full text-left flex items-center gap-3 min-w-0 cursor-pointer"
						onclick={handleAllResultsClick}
						aria-label="All results for {typedQuery}"
					>
						<Search class="h-5 w-5 flex-shrink-0" style="color: var(--white16);" />
						<span class="regular14 flex-1 truncate min-w-0" style="color: var(--white66);">{typedQuery}</span>
						<span class="query-go-arrow shrink-0" aria-hidden="true">
							<span class="query-go-arrow-rot">
								<span class="query-go-arrow-pad">
									<ArrowDown variant="outline" size={14} strokeWidth={1.4} color="var(--white16)" />
								</span>
							</span>
						</span>
					</button>
				</div>
				<div
					class="live-results-panel divider-line relative flex flex-col min-h-0 flex-1 overflow-y-auto"
					role="status"
					aria-busy={previewLoading}
					aria-live="polite"
				>
					{#if offlineForSearch}
						<p class="preview-muted regular14 px-4 py-6 text-center">
							You're offline — connect to the network to search apps.
						</p>
					{:else if previewLoading}
						<ul class="live-results-list" role="list">
							{#each SEARCH_PREVIEW_SKELETON_VARIANTS as variant (variant)}
								<li class="live-results-item">
									<AppSearchHitRowSkeleton {variant} />
								</li>
							{/each}
						</ul>
						<span class="sr-only">Loading search results</span>
					{:else if previewError}
						<p class="preview-muted regular14 px-4 py-6 text-center">{previewError}</p>
					{:else if previewHits.length === 0}
						<p class="preview-muted regular14 px-4 py-6 text-center">No matching apps.</p>
					{:else}
						<ul class="live-results-list" role="list">
							{#each previewHits as row (row.app.id)}
								<li class="live-results-item">
									<AppSearchHitRow
										app={row.app}
										authorProfile={row.profile}
										onNavigate={handleHitNavigate}
									/>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{:else}
				{#if recentSearches.length > 0}
					<div class="recent-searches-block shrink-0">
						<div class="suggestions-area px-3">
							{#each recentSearches as term (term)}
								<button
									type="button"
									class="recent-search-item w-full text-left flex items-center gap-3 min-w-0"
									onclick={() => openSearchForTerm(term)}
									aria-label="All results for {term}"
								>
									<Recent size={18} strokeWidth={2.35} color="var(--white33)" className="flex-shrink-0" />
									<span class="regular14 flex-1 truncate min-w-0" style="color: var(--white66);">{term}</span>
									<span class="query-go-arrow shrink-0" aria-hidden="true">
										<span class="query-go-arrow-rot">
											<span class="query-go-arrow-pad">
												<ArrowDown variant="outline" size={14} strokeWidth={1.4} color="var(--white16)" />
											</span>
										</span>
									</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}
				<div
					class="content-area flex flex-col gap-4"
					class:content-area--after-recents={recentSearches.length > 0}
				>
					<div>
						<div class="section-header flex items-center justify-between mb-2">
							<h3 class="eyebrow-label">Labels</h3>
							<button type="button" class="more-btn flex items-center gap-1.5 cursor-pointer">
								<span class="regular12" style="color: var(--white33);">More</span>
								<ChevronRight variant="outline" color="var(--white33)" size={10} />
							</button>
						</div>
						<div class="scrollable-row scrollbar-hide" use:wheelScroll>
							<div class="flex gap-2">
								{#each commonLabels as label (label)}
									<button
										type="button"
										class="label-tap flex-shrink-0 cursor-pointer bg-transparent border-none p-0"
										onclick={() => handleLabelTap(label)}
										aria-label="Search for {label}"
									>
										<Label text={label} isSelected={false} isEmphasized={false} />
									</button>
								{/each}
							</div>
						</div>
					</div>

					<div>
						<div class="section-header flex items-center justify-between mb-2">
							<h3 class="eyebrow-label">Communities</h3>
							<button type="button" class="more-btn flex items-center gap-1.5 cursor-pointer">
								<span class="regular12" style="color: var(--white33);">More</span>
								<ChevronRight variant="outline" color="var(--white33)" size={10} />
							</button>
						</div>
						<div class="scrollable-row scrollbar-hide" use:wheelScroll>
							<div class="flex gap-2 items-center">
								<button
									type="button"
									class="catalog-pill zapstore-pill flex items-center gap-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
								>
									<span class="catalog-pill-avatar">
										<ProfilePic
											pictureUrl={zapstoreProfile?.picture}
											name={zapstoreProfile?.name ?? 'Zapstore'}
											pubkey={ZAPSTORE_PUBKEY}
											size="sm"
										/>
									</span>
									<span class="regular14 whitespace-nowrap" style="color: var(--white66);"
										>Zapstore</span
									>
								</button>
								<span class="pill coming-soon-pill--catalog flex items-center flex-shrink-0">
									<span class="regular14 whitespace-nowrap" style="color: var(--white33);"
										>More communities coming soon</span
									>
								</span>
							</div>
						</div>
					</div>

					<div class="platforms-section">
						<div class="section-header mb-2">
							<h3 class="eyebrow-label">Platforms</h3>
						</div>
						<div class="flex flex-wrap gap-2 platform-pills">
							<button
								type="button"
								class="pill flex items-center gap-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
							>
								{@render AndroidIcon()}
								<span class="regular14 whitespace-nowrap" style="color: var(--white66);"
									>Android</span
								>
							</button>
							<span class="pill flex items-center">
								<span class="regular14 whitespace-nowrap" style="color: var(--white33);"
									>More platforms coming soon</span
								>
							</span>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.close-btn {
		padding: 0.125rem;
		margin-right: -0.25rem;
	}

	.content-area {
		padding-top: 0.5rem;
	}

	.content-area--after-recents {
		padding-top: 0.625rem;
	}

	.section-header {
		padding-left: 1rem;
		padding-right: 0.75rem;
	}

	.more-btn {
		background: none;
		border: none;
		padding: 0;
	}

	.more-btn:hover span {
		color: var(--white66) !important;
	}

	.scrollable-row {
		overflow-x: auto;
		padding-left: 1rem;
		padding-right: 1rem;
	}

	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}

	.catalog-pill {
		padding: 4px;
		padding-right: 0.875rem;
		border-radius: 9999px;
	}

	.catalog-pill-avatar {
		opacity: 0.66;
		transition: opacity 0.15s ease;
	}

	.zapstore-pill:hover .catalog-pill-avatar {
		opacity: 1;
	}

	.pill {
		height: 32px;
		padding: 0 0.875rem 0 0.5rem;
		border-radius: 9999px;
	}

	.platform-icon {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
		color: var(--white33);
	}

	.coming-soon-pill--catalog {
		margin-top: -2px;
		min-height: 36px;
		align-items: center;
	}

	.platform-pills {
		padding-left: 1rem;
		padding-right: 1rem;
	}

	.divider-line {
		border-top: 1.4px solid var(--white11);
	}

	.recent-search-item {
		padding: 6px 12px 6px 14px;
		border: none;
		font-size: 0.875rem;
		border-radius: 8px;
		background: none;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.recent-search-item:hover {
		background-color: rgb(255 255 255 / 0.05);
	}

	.recent-searches-block .suggestions-area {
		padding-top: 2px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--white8);
	}

	.query-go-row {
		padding: 6px 12px 6px 13px;
		border: none;
		border-radius: 8px;
		background: none;
		transition: background-color 0.15s ease;
	}

	.query-go-row:hover {
		background-color: rgb(255 255 255 / 0.05);
	}

	.query-go-arrow {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		margin-right: 4px;
	}

	.query-go-arrow-rot {
		display: inline-flex;
		line-height: 0;
		transform: rotate(-90deg);
	}

	.query-go-arrow-pad {
		display: inline-flex;
		padding-bottom: 3px;
	}

	.platforms-section {
		padding-bottom: 16px;
	}

	.preview-muted {
		color: var(--white66);
		max-width: 28rem;
		margin-inline: auto;
	}

	.live-results-item {
		border-bottom: 1.4px solid var(--white11);
	}

	.live-results-item:last-child {
		border-bottom: none;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}
</style>
