/**
 * Apps listing page — universal load
 *
 * SSR: fetches seed events (apps + their latest releases) from the server's
 *      in-memory relay cache, sorted by latest release date.
 *      Both event kinds are needed client-side: apps for display, releases for
 *      liveQuery ordering.
 *
 * Client-side navigation: returns empty — Dexie (IndexedDB) + liveQuery handle everything.
 * Offline: no server round-trip needed, page renders from local data.
 */
import { browser } from '$app/environment';
import { APPS_PAGE_SIZE } from '$lib/constants';

export const prerender = false;

export const load = async () => {
	// Client-side: Dexie + relay subscriptions are active, no seed data needed
	if (browser) return { seedEvents: [], appsCursor: null, appsHasMore: true };

	// SSR: fetch apps + releases sorted by latest release (server-side ranking)
	const { fetchAppsSortedByRelease } = await import('$lib/nostr/server.js');
	const { events, cursor, hasMore } = fetchAppsSortedByRelease(APPS_PAGE_SIZE);
	// Pass hasMore: true so client can load more from relays (server cache may be limited)
	return { seedEvents: events, appsCursor: cursor, appsHasMore: true };
};
