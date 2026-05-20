import { browser } from '$app/environment';
import { liveQuery } from 'dexie';
import { untrack } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import { putEvents } from '../storage/dexie.js';
import { hydrateFilters } from '../sync/hydrate.js';

/**
 * Local-first detail query primitive.
 *
 * Each per-kind detail wrapper (app detail, stack detail, …) describes its
 * own read shape — `load(input)` returns a plain object — and its hydration
 * plan. The primitive owns the universal lifecycle:
 *
 *   - SSR initial state from `getSeed(input)` so server-rendered HTML shows
 *     real content before hydration.
 *   - Browser: subscribes to `liveQuery(() => load(input))`. Every emission
 *     replaces the matching fields on `state` so the UI reactively updates.
 *   - Background hydration: `hydrate({ input, value, hydrateOnce })` runs at
 *     mount and after every liveQuery emission. `hydrateOnce(key, …)` dedupes
 *     so the same filter isn't refetched on re-renders.
 *   - Seed events from `input.seedEvents` (and any `getSeedEvents(input)`)
 *     are `putEvents`-ed in the background; liveQuery picks them up.
 *   - 404 timer: if `isPresent(value)` stays false for `timeout` ms, the
 *     query resolves with `state.error = notFoundMessage`.
 *   - All work cancels on input change / component destroy.
 *
 * The returned object is a Svelte `$state` — read its fields directly from
 * components, no further subscription needed.
 *
 * @template TInput
 * @template TValue
 * @param {{
 *   initial: TValue & { loading?: boolean, error?: string },
 *   getInput: () => TInput | null,
 *   load: (input: TInput) => Promise<TValue>,
 *   isPresent: (value: TValue) => boolean,
 *   hydrate?: (ctx: {
 *     input: TInput,
 *     value: TValue,
 *     hydrateOnce: (key: string, relays: string[], filters: object | object[], feature: string) => void
 *   }) => void,
 *   getSeed?: (input: TInput) => Partial<TValue> | null,
 *   getSeedEvents?: (input: TInput) => import('nostr-tools').Event[] | null | undefined,
 *   getInitialError?: (input: TInput) => string,
 *   notFoundMessage?: string,
 *   timeout?: number,
 *   featurePrefix?: string
 * }} config
 */
export function createDetailQuery(config) {
	const {
		initial,
		getInput,
		load,
		isPresent,
		hydrate,
		getSeed,
		getSeedEvents,
		getInitialError,
		notFoundMessage = 'Not found',
		timeout = 5000,
		featurePrefix = 'purpleweb-detail'
	} = config;

	const initialInput = /** @type {any} */ (getInput?.() ?? null);
	const seedSnapshot = !browser && initialInput ? (getSeed?.(initialInput) ?? null) : null;
	const initialError = !browser && initialInput ? (getInitialError?.(initialInput) ?? '') : '';

	const state = $state({
		...initial,
		...(seedSnapshot ?? {}),
		loading: false,
		error: initialError
	});

	$effect(() => {
		const input = /** @type {any} */ (getInput?.() ?? null);

		if (!browser) {
			// SSR re-run: keep the seed snapshot in sync if the loader changed.
			Object.assign(state, initial, getSeed?.(input) ?? {});
			state.loading = false;
			state.error = getInitialError?.(input) ?? '';
			return;
		}

		if (!input) {
			Object.assign(state, initial);
			state.loading = false;
			state.error = '';
			return;
		}

		// Persist any SSR seed events before liveQuery fires. If we let liveQuery
		// race the putEvents write, a cold cache returns null on the first run
		// and momentarily clobbers the SSR-seeded `state.entity`. Awaiting the
		// write keeps first paint stable. Failures degrade silently — relay
		// hydration is the fallback path.
		const seedEvents = getSeedEvents?.(input);
		const seedPersist =
			seedEvents && seedEvents.length > 0
				? putEvents(seedEvents).catch((err) => {
						console.error(`[${featurePrefix}] seed persist failed:`, err);
					})
				: Promise.resolve();

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

		// Loading is "first paint pending" — we already have something to show
		// once isPresent(state) is true (from seed or prior cache).
		state.loading = untrack(() => !isPresent(state));
		state.error = '';

		const notFoundTimer = setTimeout(() => {
			if (cancelled) return;
			if (!isPresent(state)) {
				state.loading = false;
				state.error = getInitialError?.(input) || notFoundMessage;
			}
		}, timeout);

		// Initial hydration runs before liveQuery emits — kicks off the
		// "fetch what we don't have yet" path keyed on input alone.
		try {
			hydrate?.({ input, value: /** @type {any} */ (state), hydrateOnce });
		} catch (err) {
			console.error(`[${featurePrefix}] initial hydrate failed:`, err);
		}

		/** @type {{ unsubscribe(): void } | null} */
		let sub = null;
		seedPersist.then(() => {
			if (cancelled) return;
			sub = liveQuery(() => load(input)).subscribe({
				next(value) {
					if (cancelled) return;
					Object.assign(state, value);
					if (isPresent(/** @type {any} */ (value))) {
						state.loading = false;
						state.error = '';
						clearTimeout(notFoundTimer);
					}
					try {
						hydrate?.({ input, value, hydrateOnce });
					} catch (err) {
						console.error(`[${featurePrefix}] hydrate failed:`, err);
					}
				},
				error(err) {
					if (cancelled) return;
					state.loading = false;
					state.error = err instanceof Error ? err.message : 'Failed to read detail';
				}
			});
		});

		return () => {
			cancelled = true;
			clearTimeout(notFoundTimer);
			sub?.unsubscribe();
		};
	});

	return state;
}
