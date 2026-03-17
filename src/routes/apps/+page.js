/**
 * Apps page — universal load
 *
 * SSR: fetches seed events from the server's in-memory relay cache.
 *      Seeds only DISCOVER_APPS_INITIAL apps and DISCOVER_STACKS_INITIAL stacks
 *      so the first paint is lean. Stack app refs are limited to 4 per stack (preview).
 *
 * Client-side navigation: returns empty — Dexie + liveQuery handle everything.
 * Offline: no server round-trip needed, page renders from local data.
 */
import { browser } from '$app/environment';
import { DISCOVER_APPS_INITIAL, DISCOVER_STACKS_INITIAL } from '$lib/constants';

export const prerender = false;

export const load = async () => {
	if (browser) return { seedEvents: [], appsCursor: null, appsHasMore: true };

	const { fetchAppsSortedByRelease, fetchStacks } = await import('$lib/nostr/server.js');
	const { events: appEvents, cursor, hasMore } = fetchAppsSortedByRelease(DISCOVER_APPS_INITIAL);
	const stackEvents = fetchStacks(DISCOVER_STACKS_INITIAL);

	const seen = new Set();
	const seedEvents = [];
	for (const event of [...appEvents, ...stackEvents]) {
		if (!seen.has(event.id)) {
			seen.add(event.id);
			seedEvents.push(event);
		}
	}

	return { seedEvents, appsCursor: cursor, appsHasMore: hasMore };
};
