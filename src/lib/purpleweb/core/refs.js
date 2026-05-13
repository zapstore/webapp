/**
 * Reference and filter helpers for the local-first purpleweb runtime.
 */

/**
 * @param {number} kind
 * @returns {'regular' | 'replaceable' | 'parameterized' | 'ephemeral'}
 */
export function replaceabilityForKind(kind) {
	const k = Number(kind);
	if (k === 0 || k === 3 || (k >= 10000 && k < 20000)) return 'replaceable';
	if (k >= 20000 && k < 30000) return 'ephemeral';
	if (k >= 30000 && k < 40000) return 'parameterized';
	return 'regular';
}

/**
 * @param {{ tags?: string[][] }} event
 * @param {string} name
 * @returns {string | null}
 */
export function firstTagValue(event, name) {
	return event?.tags?.find((t) => t[0] === name && t[1])?.[1] ?? null;
}

/**
 * @param {{ tags?: string[][] }} event
 * @param {string} name
 * @returns {string[]}
 */
export function tagValues(event, name) {
	return (event?.tags ?? []).filter((t) => t[0] === name && t[1]).map((t) => t[1]);
}

/**
 * @param {number} kind
 * @param {string} pubkey
 * @param {string} identifier
 */
export function addressableId(kind, pubkey, identifier) {
	return `${Number(kind)}:${String(pubkey).trim().toLowerCase()}:${String(identifier).trim()}`;
}

/**
 * @param {string | null | undefined} value
 * @returns {null | { kind: number, pubkey: string, identifier: string }}
 */
export function parseAddressableId(value) {
	if (!value || typeof value !== 'string') return null;
	const [kindStr, pubkey, ...rest] = value.split(':');
	const kind = Number.parseInt(kindStr, 10);
	const identifier = rest.join(':');
	if (!Number.isFinite(kind) || !pubkey || !identifier) return null;
	return { kind, pubkey: pubkey.toLowerCase(), identifier };
}

/**
 * @param {import('nostr-tools').Event} event
 * @returns {string}
 */
export function eventAddress(event) {
	if (!event) return '';
	if (replaceabilityForKind(event.kind) === 'parameterized') {
		return addressableId(event.kind, event.pubkey, firstTagValue(event, 'd') ?? '');
	}
	if (replaceabilityForKind(event.kind) === 'replaceable') {
		return `${Number(event.kind)}:${String(event.pubkey).toLowerCase()}`;
	}
	return event.id;
}

/**
 * @param {object | object[] | null | undefined} filters
 * @returns {object[]}
 */
export function asFilterArray(filters) {
	if (!filters) return [];
	return Array.isArray(filters) ? filters.filter(Boolean) : [filters];
}

/**
 * Remove empty array fields so generated filters stay compact and deterministic.
 *
 * @param {object} filter
 * @returns {object}
 */
export function compactFilter(filter) {
	const out = {};
	for (const [key, value] of Object.entries(filter ?? {})) {
		if (Array.isArray(value) && value.length === 0) continue;
		if (value === undefined || value === null) continue;
		out[key] = value;
	}
	return out;
}

/**
 * @param {string[]} values
 * @returns {string[]}
 */
export function uniqueStrings(values) {
	return [...new Set((values ?? []).map((v) => String(v).trim()).filter(Boolean))];
}

/**
 * @param {string[]} ids
 * @returns {string[]}
 */
export function uniqueHexIds(ids) {
	return uniqueStrings(ids)
		.map((id) => id.toLowerCase())
		.filter((id) => /^[a-f0-9]{64}$/.test(id));
}

/**
 * @param {object} filter
 * @returns {string}
 */
export function filterKey(filter) {
	const sorted = {};
	for (const key of Object.keys(filter ?? {}).sort()) {
		const value = filter[key];
		sorted[key] = Array.isArray(value) ? [...value].sort() : value;
	}
	return JSON.stringify(sorted);
}
