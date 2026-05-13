import { queryEvents } from '$lib/nostr/dexie.js';
import { asFilterArray, filterKey } from '../core/refs.js';
import { parseModels } from '../core/registry.js';

/**
 * @param {import('nostr-tools').Event[]} events
 */
export function dedupeEvents(events) {
	const byId = new Map();
	for (const event of events ?? []) {
		if (event?.id && !byId.has(event.id)) byId.set(event.id, event);
	}
	return [...byId.values()].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
}

/**
 * Query Dexie with one or more NIP-01 filters and parse the results through a model spec.
 *
 * @param {import('../core/types.js').ModelSpec} spec
 * @param {object | object[]} filters
 * @returns {Promise<{ events: import('nostr-tools').Event[], models: any[] }>}
 */
export async function queryModels(spec, filters) {
	const list = asFilterArray(filters).map((filter) => ({
		kinds: [spec.kind],
		...filter
	}));
	const batches = await Promise.all(list.map((filter) => queryEvents(filter)));
	const events = dedupeEvents(batches.flat());
	return { events, models: parseModels(events, spec) };
}

/**
 * @param {import('../core/types.js').ModelSpec} spec
 * @param {any[]} parents
 * @param {string} relationshipName
 * @param {{ limit?: number }} [options]
 */
export async function queryRelationship(spec, parents, relationshipName, options = {}) {
	const relationship = spec.relationships?.[relationshipName];
	if (!relationship || !parents?.length) {
		return { events: [], models: [], byParent: new Map() };
	}

	const filters = asFilterArray(relationship.filters(parents, options, options.parentEvents ?? []));
	if (filters.length === 0) {
		return { events: [], models: [], byParent: new Map() };
	}

	const target = relationship.model;
	const batches = await Promise.all(filters.map((filter) => queryEvents(filter)));
	const events = dedupeEvents(batches.flat());
	const models = target ? parseModels(events, target) : events;
	const byParent = relationship.group ? relationship.group(parents, models, events) : new Map();
	return { events, models, byParent };
}

/**
 * Query a model and a set of relationships. Relationship filters are generated once
 * for the full parent set, which is the no-N+1 boundary for UI code.
 *
 * @param {import('../core/types.js').ModelSpec} spec
 * @param {object | object[]} filters
 * @param {{ include?: string[] }} [options]
 */
export async function queryModelGraph(spec, filters, options = {}) {
	const root = await queryModels(spec, filters);
	const relationships = {};
	for (const name of options.include ?? []) {
		relationships[name] = await queryRelationship(spec, root.models, name, {
			parentEvents: root.events
		});
	}
	return { ...root, relationships };
}

/**
 * @param {object | object[]} filters
 */
export function stableFiltersKey(filters) {
	return asFilterArray(filters).map(filterKey).sort().join('|');
}
