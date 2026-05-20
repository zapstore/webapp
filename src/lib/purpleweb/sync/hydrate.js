import { browser } from '$app/environment';
import { fetchFromRelays } from './service.js';
import { asFilterArray, filterKey } from '../core/refs.js';

const inFlight = new Map();

/**
 * Fire a relay one-shot query for one or more filters. The returned relay events
 * are not a UI data source; fetchFromRelays persists them to Dexie and liveQuery
 * updates subscribers from local storage.
 *
 * @param {string[]} relays
 * @param {object | object[]} filters
 * @param {{ timeout?: number, signal?: AbortSignal, feature?: string, enabled?: boolean }} [options]
 */
export async function hydrateFilters(relays, filters, options = {}) {
	if (!browser || options.enabled === false || options.signal?.aborted) return [];
	const relayList = [...new Set((relays ?? []).filter(Boolean))];
	if (relayList.length === 0) return [];

	const filterList = asFilterArray(filters);
	const results = [];
	await Promise.all(
		filterList.map(async (filter) => {
			const key = `${relayList.join(',')}::${filterKey(filter)}::${options.feature ?? 'purpleweb'}`;
			if (inFlight.has(key)) {
				const existing = await inFlight.get(key);
				results.push(...existing);
				return;
			}
			const task = fetchFromRelays(relayList, filter, {
				timeout: options.timeout ?? 5000,
				signal: options.signal,
				feature: options.feature ?? 'purpleweb'
			}).finally(() => {
				inFlight.delete(key);
			});
			inFlight.set(key, task);
			const events = await task;
			results.push(...events);
		})
	);
	return results;
}
