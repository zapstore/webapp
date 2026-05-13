import { browser } from '$app/environment';
import { untrack } from 'svelte';
import { liveModelGraph } from '../storage/live.js';
import { hydrateFilters } from '../sync/hydrate.js';
import { stableFiltersKey } from '../storage/query.js';

/**
 * Svelte-friendly local-first model query. Data comes from Dexie liveQuery;
 * optional hydration only writes relay results into Dexie.
 *
 * @param {import('../core/types.js').ModelSpec} spec
 * @param {() => object | object[] | null | undefined} getFilters
 * @param {{
 *   include?: string[],
 *   hydrate?: boolean,
 *   relays?: string[],
 *   timeout?: number,
 *   feature?: string,
 *   enabled?: () => boolean
 * }} [options]
 */
export function createModelQuery(spec, getFilters, options = {}) {
	const state = $state({
		models: [],
		events: [],
		relationships: {},
		loading: false,
		error: ''
	});

	$effect(() => {
		const filters = getFilters?.();
		const enabled = options.enabled ? options.enabled() : true;
		if (!browser || !enabled || !filters) {
			state.models = [];
			state.events = [];
			state.relationships = {};
			state.loading = false;
			state.error = '';
			return;
		}

		state.loading = untrack(() => state.models.length === 0);
		const key = stableFiltersKey(filters);
		void key;

		if (options.hydrate && options.relays?.length) {
			hydrateFilters(options.relays, filters, {
				timeout: options.timeout,
				feature: options.feature ?? `purpleweb-${spec.name}`,
				enabled
			}).catch(() => {});
		}

		const observable = liveModelGraph(spec, filters, { include: options.include ?? [] });
		const sub = observable.subscribe({
			next(value) {
				state.models = value.models;
				state.events = value.events;
				state.relationships = value.relationships;
				state.loading = false;
				state.error = '';
			},
			error(err) {
				state.loading = false;
				state.error = err instanceof Error ? err.message : 'Failed to read local data';
			}
		});

		return () => sub.unsubscribe();
	});

	return state;
}
