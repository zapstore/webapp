/**
 * App detail page — universal load
 *
 * Accepts either a plain app identifier (d-tag, e.g. "net.primal.android")
 * or a legacy naddr string. Both resolve to the same app detail page.
 *
 * SSR: queries relay.zapstore.dev directly for app metadata.
 * Client-side navigation: returns empty — component queries Dexie directly.
 * Offline: no server round-trip needed, component loads from IndexedDB.
 */
import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { decodeNaddr } from '$lib/nostr';
import { EVENT_KINDS } from '$lib/config';

export const prerender = false;

export const load = async ({ params }) => {
	if (browser) return { app: null, error: null, seedEvents: [] };

	const { fetchApp, fetchAppByIdentifier } = await import('$lib/nostr/server.js');

	const appid = params.appid;
	const pointer = decodeNaddr(appid);

	if (pointer) {
		// `/apps/naddr…` must be an app (32267). Stack naddrs belong on `/stacks/…`.
		if (pointer.kind === EVENT_KINDS.APP_STACK) {
			redirect(302, `/stacks/${appid}`);
		}
		const { pubkey, identifier } = pointer;
		const result = await fetchApp(pubkey, identifier);
		if (!result) {
			return { app: null, error: null, seedEvents: [] };
		}
		return { app: result.app, error: null, seedEvents: result.seedEvents };
	}

	const result = await fetchAppByIdentifier(appid);
	if (!result) {
		return { app: null, error: null, seedEvents: [] };
	}
	return { app: result.app, error: null, seedEvents: result.seedEvents };
};
