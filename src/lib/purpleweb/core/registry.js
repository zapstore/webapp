/**
 * Tiny kind -> spec registry.
 *
 * Each spec is `{ kind, parse }`. Specs are intentionally minimal — relay
 * choice, hydration cadence, and entity chaining live in per-page wrappers,
 * not here. The registry exists so future generic helpers (e.g. "parse any
 * seeded event by kind") can dispatch without a hard-coded switch.
 */

/** @type {Map<number, { kind: number, parse: (event: import('nostr-tools').Event) => any, name?: string }>} */
const specsByKind = new Map();

/**
 * @param {{ kind: number, parse: (event: import('nostr-tools').Event) => any, name?: string }} spec
 */
export function defineModel(spec) {
	if (!Number.isFinite(Number(spec?.kind))) {
		throw new Error(`Model spec requires a numeric kind (got ${spec?.kind})`);
	}
	if (typeof spec.parse !== 'function') {
		throw new Error(`Model spec for kind ${spec.kind} requires a parse function`);
	}
	return spec;
}

/**
 * @param {{ kind: number, parse: (event: import('nostr-tools').Event) => any }[]} specs
 */
export function registerModels(specs) {
	for (const spec of specs) {
		specsByKind.set(Number(spec.kind), spec);
	}
}

/**
 * @param {number} kind
 */
export function getModelByKind(kind) {
	return specsByKind.get(Number(kind)) ?? null;
}

/**
 * Parse a batch of raw events through a specific spec. Falls back to a generic
 * shape when no spec is given (used by social.js for profile/comment/zap/label
 * batches where the spec is known at the call site).
 *
 * @param {import('nostr-tools').Event[]} events
 * @param {{ parse: (event: import('nostr-tools').Event) => any } | null | undefined} [spec]
 */
export function parseModels(events, spec = undefined) {
	if (!events?.length) return [];
	if (spec) return events.map((event) => spec.parse(event)).filter(Boolean);
	return events
		.map((event) => {
			const match = getModelByKind(event?.kind);
			if (match) return match.parse(event);
			return {
				id: event.id,
				kind: event.kind,
				pubkey: event.pubkey,
				createdAt: event.created_at,
				event
			};
		})
		.filter(Boolean);
}
