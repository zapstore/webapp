/**
 * Generic module-level cache for liveQuery results.
 *
 * Eliminates skeleton flash on back navigation. Module-level Map persists
 * across component mount/unmount cycles within the same client session.
 *
 * Usage in any page:
 *
 *   import { getCached, setCached } from '$lib/stores/query-cache.js';
 *
 *   let liveApps = $state(getCached('apps'));
 *
 *   $effect(() => {
 *       const sub = createAppsQuery().subscribe({
 *           next: (v) => { liveApps = v; setCached('apps', v); },
 *       });
 *       return () => sub.unsubscribe();
 *   });
 */

/** @type {Map<string, any>} */
const cache = new Map();

/**
 * Get a cached liveQuery result, or null if not yet cached.
 * @param {string} key
 * @returns {any}
 */
export function getCached(key) {
	return cache.get(key) ?? null;
}

/**
 * Store a liveQuery result in the cache.
 * @param {string} key
 * @param {any} value
 */
export function setCached(key, value) {
	cache.set(key, value);
}
