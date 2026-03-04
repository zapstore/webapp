/**
 * App detail page — universal load
 *
 * Accepts either a plain app identifier (d-tag, e.g. "net.primal.android")
 * or a legacy naddr string. Both resolve to the same app detail page.
 *
 * SSR: fetches app metadata from the server's in-memory relay cache.
 * Client-side navigation: returns empty — component queries Dexie directly.
 * Offline: no server round-trip needed, component loads from IndexedDB.
 */
import { browser } from '$app/environment';
import { decodeNaddr } from '$lib/nostr';

export const prerender = false;

export const load = async ({ params }) => {
	// Client-side: component queries Dexie for app data, no server seed needed
	if (browser) return { app: null, error: null, seedEvents: [] };

	// SSR: fetch from server cache
	const { fetchApp, fetchAppByIdentifier } = await import('$lib/nostr/server.js');

	const appid = params.appid;

	// Try naddr decode first; if it fails treat as plain d-tag identifier
	const pointer = decodeNaddr(appid);

	if (pointer) {
		const { pubkey, identifier } = pointer;
		const result = fetchApp(pubkey, identifier);
		if (!result) {
			return { app: null, error: 'App not found', seedEvents: [] };
		}
		return { app: result.app, error: null, seedEvents: result.seedEvents };
	}

	// Plain d-tag identifier path
	const result = fetchAppByIdentifier(appid);
	if (!result) {
		return { app: null, error: 'App not found', seedEvents: [] };
	}
	return { app: result.app, error: null, seedEvents: result.seedEvents };
};
