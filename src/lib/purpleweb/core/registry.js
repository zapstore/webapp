import { replaceabilityForKind } from './refs.js';

/** @type {Map<string, import('./types.js').ModelSpec>} */
const specsByName = new Map();
/** @type {Map<number, import('./types.js').ModelSpec>} */
const specsByKind = new Map();

/**
 * @param {import('./types.js').ModelSpec} spec
 * @returns {import('./types.js').ModelSpec}
 */
export function defineModel(spec) {
	if (!spec?.name) throw new Error('Model spec requires a name');
	if (!Number.isFinite(Number(spec.kind))) throw new Error(`Model ${spec.name} requires a numeric kind`);
	return {
		replaceability: replaceabilityForKind(spec.kind),
		relationships: {},
		...spec
	};
}

/**
 * @param {import('./types.js').ModelSpec[]} specs
 */
export function registerModels(specs) {
	for (const spec of specs) {
		specsByName.set(spec.name, spec);
		specsByKind.set(Number(spec.kind), spec);
	}
}

/**
 * @param {string} name
 */
export function getModelByName(name) {
	const spec = specsByName.get(name);
	if (!spec) throw new Error(`Unknown model spec: ${name}`);
	return spec;
}

/**
 * @param {number} kind
 */
export function getModelByKind(kind) {
	return specsByKind.get(Number(kind)) ?? null;
}

/**
 * @returns {import('./types.js').ModelSpec[]}
 */
export function getRegisteredModels() {
	return [...specsByKind.values()];
}

/**
 * @param {import('nostr-tools').Event} event
 * @param {import('./types.js').ModelSpec | null | undefined} [spec]
 */
export function parseModel(event, spec = undefined) {
	const modelSpec = spec ?? getModelByKind(event?.kind);
	if (!modelSpec) {
		return {
			id: event.id,
			kind: event.kind,
			pubkey: event.pubkey,
			createdAt: event.created_at,
			event
		};
	}
	return modelSpec.parse(event);
}

/**
 * @param {import('nostr-tools').Event[]} events
 * @param {import('./types.js').ModelSpec | null | undefined} [spec]
 */
export function parseModels(events, spec = undefined) {
	return (events ?? []).map((event) => parseModel(event, spec)).filter(Boolean);
}
