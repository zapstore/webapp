<script lang="js">
/**
 * AddModal — search and pick an app (stack editor, comments, forum posts, etc.).
 * Single-column browse-style results with an action button per row.
 */
import { fly, fade } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import { Search } from 'lucide-svelte';
import AppSearchHitRow from '$lib/components/cards/AppSearchHitRow.svelte';
import AppSearchHitRowSkeleton from '$lib/components/cards/AppSearchHitRowSkeleton.svelte';
import { APP_SEARCH_HIT_SKELETON_VARIANT_COUNT } from '$lib/components/cards/app-search-hit-skeleton-presets.js';
import {
	searchApps,
	queryEvents,
	fetchAppsByAuthorFromRelays,
	fetchProfilesBatch
} from '$lib/nostr/service';
import { parseApp, parseProfile } from '$lib/nostr/models';
import { ZAPSTORE_RELAY, PLATFORM_FILTER } from '$lib/config';
import {
	sortAppsDeveloperFirst,
	sortAppsRelevanceDeveloperFirst
} from '$lib/utils/app-search.js';
import '$lib/styles/browse-grid.css';

let {
	title = 'Add',
	actionLabel = 'Add',
	isOpen = $bindable(false),
	getCurrentPubkey = () => null,
	onAdd = () => {},
	onclose = () => {},
	/** Dark backdrop (e.g. stack editor). */
	dimOverlay = false,
	/** Cover the nearest positioned panel (studio content) instead of the viewport. */
	scopedInPanel = false
} = $props();

let query = $state('');
let searchLoading = $state(false);
/** @type {import('nostr-tools').Event[]} */
let searchResults = $state([]);
/** @type {import('nostr-tools').Event[]} */
let myApps = $state([]);
let myAppsLoading = $state(false);
/** @type {HTMLInputElement | null} */
let searchInputEl = $state(null);
/** @type {Record<string, ReturnType<typeof parseProfile> | null | undefined>} */
let profileByPubkey = $state({});

const catalogRelays = [ZAPSTORE_RELAY, 'wss://relay.vertexlab.io'];
const SKELETON_ROWS = 4;

$effect(() => {
	if (!isOpen) {
		query = '';
		searchResults = [];
		myApps = [];
		myAppsLoading = false;
		profileByPubkey = {};
		return;
	}
	const t = setTimeout(() => searchInputEl?.focus(), 80);
	return () => clearTimeout(t);
});

$effect(() => {
	if (!isOpen || query.trim()) {
		if (!isOpen) {
			myApps = [];
			myAppsLoading = false;
		}
		return;
	}
	const pubkey = getCurrentPubkey();
	if (!pubkey) {
		myApps = [];
		myAppsLoading = false;
		return;
	}
	myAppsLoading = true;
	const controller = new AbortController();
	const filter = {
		kinds: [32267],
		authors: [pubkey],
		...PLATFORM_FILTER,
		limit: 50
	};
	(async () => {
		try {
			let events = await queryEvents(filter);
			if (
				!controller.signal.aborted &&
				events.length === 0 &&
				typeof window !== 'undefined'
			) {
				events = await fetchAppsByAuthorFromRelays(catalogRelays, pubkey, {
					signal: controller.signal,
					limit: 50,
					timeout: 5000
				});
			}
			if (!controller.signal.aborted) {
				myApps = events;
			}
		} catch {
			if (!controller.signal.aborted) {
				myApps = [];
			}
		} finally {
			if (!controller.signal.aborted) {
				myAppsLoading = false;
			}
		}
	})();
	return () => controller.abort();
});

$effect(() => {
	const q = query.trim();
	if (!isOpen || !q) {
		searchResults = [];
		return;
	}
	searchLoading = true;
	const controller = new AbortController();
	searchApps(catalogRelays, q, { signal: controller.signal, limit: 20 })
		.then((events) => {
			if (!controller.signal.aborted) {
				searchResults = events;
				searchLoading = false;
			}
		})
		.catch(() => {
			if (!controller.signal.aborted) {
				searchResults = [];
				searchLoading = false;
			}
		});
	return () => controller.abort();
});

const hasQuery = $derived(query.trim().length > 0);
const displayResults = $derived.by(() => {
	const raw = hasQuery ? searchResults : myApps;
	if (raw.length === 0) return [];
	const byId = new Map(raw.map((event) => [event.id, event]));
	const apps = raw.map(parseApp);
	const sorted = hasQuery
		? sortAppsRelevanceDeveloperFirst(apps)
		: sortAppsDeveloperFirst(apps);
	return sorted.map((app) => byId.get(app.id)).filter(Boolean);
});
const listLoading = $derived(
	(hasQuery && searchLoading) || (!hasQuery && !!getCurrentPubkey() && myAppsLoading)
);

$effect(() => {
	const results = displayResults;
	if (!isOpen || results.length === 0) {
		profileByPubkey = {};
		return;
	}
	const controller = new AbortController();
	const pubs = [...new Set(results.map((event) => event.pubkey))];
	(async () => {
		try {
			const rawProfiles = await fetchProfilesBatch(pubs, { signal: controller.signal });
			if (controller.signal.aborted) return;
			const next = /** @type {Record<string, ReturnType<typeof parseProfile> | null>} */ ({});
			for (const [pk, ev] of rawProfiles) {
				next[String(pk).trim().toLowerCase()] = parseProfile(ev);
			}
			profileByPubkey = next;
		} catch {
			if (!controller.signal.aborted) {
				profileByPubkey = {};
			}
		}
	})();
	return () => controller.abort();
});

/** @param {ReturnType<typeof parseApp>} parsed */
function handleAdd(parsed) {
	const naddr = parsed?.naddr;
	if (!naddr) return;
	onAdd({
		naddr,
		name: parsed?.name ?? null,
		iconUrl: parsed?.icon ?? null,
		app: parsed
	});
	isOpen = false;
	onclose?.();
}

function handleOverlayClick() {
	isOpen = false;
	onclose?.();
}

function handleKeydown(/** @type {KeyboardEvent} */ e) {
	if (e.key === 'Escape') {
		isOpen = false;
		onclose?.();
	}
}

/** @param {ReturnType<typeof parseApp>} parsed */
function profileForApp(parsed) {
	return profileByPubkey[String(parsed.pubkey).trim().toLowerCase()];
}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<div
		class="add-overlay"
		class:add-overlay-dim={dimOverlay}
		class:add-overlay-scoped={scopedInPanel}
		onclick={handleOverlayClick}
		role="presentation"
		transition:fade={{ duration: 180 }}
	></div>

	<div
		class="add-wrapper"
		class:add-wrapper-scoped={scopedInPanel}
		role="dialog"
		aria-modal="true"
		aria-label={title}
	>
		<div class="add-sheet" transition:fly={{ y: 80, duration: 200, easing: cubicOut }}>
			<div class="add-title-block">
				<h2 class="add-title">{title}</h2>
			</div>

			<div class="add-search-row">
				<div class="add-search-inner">
					<span class="add-search-icon" aria-hidden="true"><Search /></span>
					<input
						type="search"
						class="add-search-input"
						placeholder="Search apps"
						bind:value={query}
						bind:this={searchInputEl}
						aria-label="Search apps"
					/>
				</div>
			</div>

			<div class="add-body-wrap">
				<div class="add-body-inner">
					{#if listLoading}
						<ul class="browse-grid add-modal-results" role="list" aria-hidden="true">
							{#each Array(SKELETON_ROWS) as _, i (i)}
								<li class="browse-grid-item browse-grid-item--app add-modal-row">
									<div class="add-modal-hit">
										<AppSearchHitRowSkeleton
											variant={i % APP_SEARCH_HIT_SKELETON_VARIANT_COUNT}
											showDescription={false}
											showChevron={false}
											iconSize="md"
										/>
									</div>
								</li>
							{/each}
						</ul>
					{:else if displayResults.length === 0}
						<div class="add-empty-state">
							<p class="add-empty-text">
								{!hasQuery && !getCurrentPubkey() ? 'Search apps' : 'No apps found'}
							</p>
						</div>
					{:else}
						<ul class="browse-grid add-modal-results" role="list">
							{#each displayResults as event (event.id)}
								{@const parsed = parseApp(event)}
								<li class="browse-grid-item browse-grid-item--app add-modal-row">
									<div class="add-modal-hit">
										<AppSearchHitRow
											app={parsed}
											authorProfile={profileForApp(parsed)}
											showDescription={false}
											showChevron={false}
											iconSize="md"
											noHover={true}
											onNavigate={(e) => e.preventDefault()}
										/>
										<button
											type="button"
											class="btn-secondary-small btn-secondary-light add-modal-action"
											onclick={() => handleAdd(parsed)}
										>
											{actionLabel}
										</button>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.add-overlay {
		position: fixed;
		inset: 0;
		z-index: 109;
		background: transparent;
	}

	.add-overlay-dim {
		background: color-mix(in srgb, var(--black) 65%, transparent);
	}

	.add-overlay-scoped {
		position: absolute;
	}

	.add-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 110;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.add-wrapper-scoped {
		position: absolute;
	}

	.add-sheet {
		width: 100%;
		max-width: 100%;
		margin: 0;
		background: var(--gray66);
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid var(--white8);
		border-bottom: none;
		padding: 16px;
		pointer-events: auto;
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		display: flex;
		flex-direction: column;
		height: 50vh;
		max-height: 50vh;
		min-height: 0;
		box-sizing: border-box;
	}

	@media (min-width: 768px) {
		.add-sheet {
			max-width: 560px;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid var(--white8);
			padding: 12px;
		}
	}

	.add-title-block {
		flex-shrink: 0;
		padding: 0 0 8px;
	}

	.add-title {
		margin: 0;
		font-size: 1.875rem;
		font-weight: 600;
		color: var(--white);
		text-align: center;
	}

	.add-search-row {
		flex-shrink: 0;
		padding-bottom: 0;
	}

	.add-search-inner {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 40px;
		padding: 0 12px;
		background: var(--black33);
		border: 0.33px solid var(--white33);
		border-radius: 16px;
	}

	.add-search-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: var(--white33);
	}

	.add-search-input {
		flex: 1;
		min-width: 0;
		background: none;
		border: none;
		outline: none;
		color: var(--white);
		font-family: 'Inter', sans-serif;
		font-size: 16px;
	}

	.add-search-input::placeholder {
		color: var(--white33);
	}

	.add-body-wrap {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		padding-top: 12px;
	}

	.add-body-inner {
		flex: 1;
		min-height: 0;
		background: var(--black33);
		border-radius: var(--radius-12);
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--white33) transparent;
	}

	.add-body-inner::-webkit-scrollbar {
		width: 4px;
	}

	.add-body-inner::-webkit-scrollbar-thumb {
		background: var(--white33);
		border-radius: 2px;
	}

	.add-empty-state {
		flex: 1;
		min-height: 0;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.add-empty-text {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--white16);
		text-align: center;
		margin: 0;
		padding: 24px 16px;
	}

	.add-modal-results {
		border-top: none;
	}

	.add-modal-row {
		padding: 0;
	}

	.add-modal-hit {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-width: 0;
		padding: 16px;
		box-sizing: border-box;
	}

	.add-modal-hit :global(.app-search-hit) {
		flex: 1;
		min-width: 0;
	}

	.add-modal-action {
		flex-shrink: 0;
	}
</style>
