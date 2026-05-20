import { browser } from '$app/environment';
import { liveQuery } from 'dexie';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { putEvents } from '../storage/dexie.js';
import { hydrateFilters } from '../sync/hydrate.js';

/**
 * Module-scoped back-nav cache. Keyed by `cacheKey`; persists the last
 * resolved items array for the page lifetime so re-mounting a listing
 * shows content instantly instead of a skeleton flash.
 *
 * @type {SvelteMap<string, any[]>}
 */
const listingCache = new SvelteMap();

/**
 * Local-first listing query primitive.
 *
 * Each per-kind listing wrapper (apps listing, stacks listing, …) describes
 * its own Dexie read (`load`) and any background-refresh / pagination
 * actions (`hydrate`, optional kind-specific `loadMore`). The primitive
 * owns the universal lifecycle:
 *
 *   - SSR/back-nav: items start from `listingCache.get(cacheKey)` if set,
 *     so re-mount shows content immediately.
 *   - Browser: subscribes to `liveQuery(() => load(input))`. Every emission
 *     replaces `state.items` and refreshes the back-nav cache.
 *   - Seed events from `getSeedEvents(input)` are awaited via `putEvents`
 *     before the subscription starts — prevents the cold-cache race where
 *     `load` returns `[]` and clobbers a seed-initialised list.
 *   - `hydrate({ input, items, hydrateOnce })` runs at mount; use it for
 *     one-shot background refreshes (relay -> Dexie -> liveQuery refires).
 *   - All work cancels on input change / component destroy.
 *
 * The returned `$state` exposes `items`, `loading`, `loadingMore`, `hasMore`,
 * and any extra fields from `initial`. Per-kind wrappers attach a
 * `loadMore` method that mutates `state.cursor`, `state.hasMore`, and
 * `state.loadingMore`.
 *
 * @template TInput
 * @template TItem
 * @param {{
 *   load: (input: TInput) => Promise<TItem[]>,
 *   cacheKey?: string,
 *   initial?: Record<string, any>,
 *   getInput?: () => TInput | null,
 *   getSeedEvents?: (input: TInput) => import('nostr-tools').Event[] | null | undefined,
 *   hydrate?: (ctx: {
 *     input: TInput,
 *     items: TItem[],
 *     hydrateOnce: (key: string, relays: string[], filters: object | object[], feature: string) => void
 *   }) => void,
 *   featurePrefix?: string,
 *   timeout?: number
 * }} config
 */
export function createListingQuery(config) {
	const {
		load,
		cacheKey,
		initial = {},
		getInput,
		getSeedEvents,
		hydrate,
		featurePrefix = 'purpleweb-listing',
		timeout = 5000
	} = config;

	const cached = cacheKey ? listingCache.get(cacheKey) : null;

	const state = $state({
		cursor: null,
		hasMore: true,
		loadingMore: false,
		error: '',
		...initial,
		items: cached ?? [],
		loading: !cached
	});

	$effect(() => {
		const input = /** @type {any} */ (getInput?.() ?? null);

		if (!browser) {
			state.items = [];
			state.loading = false;
			return;
		}

		let cancelled = false;
		const hydratedKeys = new SvelteSet();

		/**
		 * @param {string} key
		 * @param {string[]} relays
		 * @param {object | object[]} filters
		 * @param {string} feature
		 */
		function hydrateOnce(key, relays, filters, feature) {
			if (cancelled || hydratedKeys.has(key)) return;
			hydratedKeys.add(key);
			hydrateFilters(relays, filters, { timeout, feature }).catch(() => {});
		}

		// Persist any SSR seed events before liveQuery fires. See the equivalent
		// note in `createDetailQuery` — without this await the first liveQuery
		// emission can race the putEvents and momentarily return an empty list.
		const seedEvents = getSeedEvents?.(input);
		const seedPersist =
			seedEvents && seedEvents.length > 0
				? putEvents(seedEvents).catch((err) => {
						console.error(`[${featurePrefix}] seed persist failed:`, err);
					})
				: Promise.resolve();

		try {
			hydrate?.({
				input,
				items: /** @type {any} */ (state.items),
				hydrateOnce
			});
		} catch (err) {
			console.error(`[${featurePrefix}] initial hydrate failed:`, err);
		}

		/** @type {{ unsubscribe(): void } | null} */
		let sub = null;
		seedPersist.then(() => {
			if (cancelled) return;
			sub = liveQuery(() => load(input)).subscribe({
				next(items) {
					if (cancelled) return;
					state.items = items;
					state.loading = false;
					state.error = '';
					if (cacheKey) listingCache.set(cacheKey, items);
				},
				error(err) {
					if (cancelled) return;
					state.loading = false;
					state.error = err instanceof Error ? err.message : 'Failed to read listing';
				}
			});
		});

		return () => {
			cancelled = true;
			sub?.unsubscribe();
		};
	});

	return state;
}

/** Drop back-nav listing cache for one key (e.g. after clearLocalData). */
export function clearListingCache(cacheKey) {
	listingCache.delete(cacheKey);
}
