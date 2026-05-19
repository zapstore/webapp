/**
 * Reference and filter helpers used by purpleweb storage and sync.
 *
 * Kept intentionally small: anything not used by a current consumer was
 * removed (compactFilter, eventAddress, parseAddressableId, replaceability
 * dispatch). If a future helper genuinely needs them, add back with a
 * consumer in the same change.
 */

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
 * NIP-01 addressable id: `kind:pubkey:identifier`.
 *
 * @param {number} kind
 * @param {string} pubkey
 * @param {string} identifier
 */
export function addressableId(kind, pubkey, identifier) {
	return `${Number(kind)}:${String(pubkey).trim().toLowerCase()}:${String(identifier).trim()}`;
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
 * @param {string[]} values
 * @returns {string[]}
 */
export function uniqueStrings(values) {
	return [...new Set((values ?? []).map((v) => String(v).trim()).filter(Boolean))];
}

/**
 * Stable serialization of a NIP-01 filter so equal-shaped filters share a key.
 *
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
