import { liveQuery } from 'dexie';
import { queryModelGraph, queryModels } from './query.js';

/**
 * Reactive Dexie query for parsed models. The observable emits immediately from
 * local IndexedDB and re-emits whenever putEvents writes matching events.
 *
 * @param {import('../core/types.js').ModelSpec} spec
 * @param {object | object[]} filters
 */
export function liveModels(spec, filters) {
	return liveQuery(() => queryModels(spec, filters));
}

/**
 * Reactive Dexie query for a model plus batched relationships.
 *
 * @param {import('../core/types.js').ModelSpec} spec
 * @param {object | object[]} filters
 * @param {{ include?: string[] }} [options]
 */
export function liveModelGraph(spec, filters, options = {}) {
	return liveQuery(() => queryModelGraph(spec, filters, options));
}
