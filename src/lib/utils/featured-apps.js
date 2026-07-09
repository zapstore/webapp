import { ZAPSTORE_APP_DTAG } from '$lib/config.js';

/**
 * @template {{ dTag?: string }} T
 * @param {T[]} apps
 * @returns {T[]}
 */
export function pinZapstoreAppFirst(apps) {
	if (!apps?.length) return apps ?? [];
	const idx = apps.findIndex((a) => a.dTag === ZAPSTORE_APP_DTAG);
	if (idx === -1) return apps;
	if (idx === 0) return apps;
	return [apps[idx], ...apps.filter((_, i) => i !== idx)];
}
