/**
 * Purpleweb — local-first page-data runtime for the Zapstore webapp.
 *
 * Public surface is intentionally tiny. Page components consume the per-kind
 * Svelte query wrappers below; internals (model registry, filter helpers,
 * storage/sync primitives) are not part of the contract and may change.
 *
 * Internal modules:
 *   - `core/registry.js`  — defineModel/registerModels/parseModels
 *   - `core/refs.js`      — tag and filter helpers
 *   - `models/index.js`   — registered specs + social filter helpers
 *   - `storage/query.js`  — dedupeEvents
 *   - `storage/social.js` — queryAddressableSocial (Dexie-only read)
 *   - `sync/hydrate.js`   — hydrateFilters (one-shot relay -> Dexie)
 *   - `sync/social.js`    — persistent subscriptions
 *   - `svelte/*`          — Svelte query wrappers (this file's exports)
 */

export { createAppDetailQuery } from './svelte/app-detail.svelte.js';
export { createStackDetailQuery } from './svelte/stack-detail.svelte.js';
export {
	createAddressableSocialQuery,
	createAppSocialQuery,
	createStackSocialQuery
} from './svelte/social.svelte.js';
