/**
 * Apps page — universal load
 *
 * SSR: queries relay.zapstore.dev directly for seed events.
 *      Fetches apps (ordered by release recency) and stacks.
 *
 * Client-side navigation: returns empty — Dexie + liveQuery handle everything.
 * Offline: no server round-trip needed, page renders from local data.
 */
import { browser } from '$app/environment';
import { DISCOVER_APPS_INITIAL, DISCOVER_STACKS_INITIAL } from '$lib/constants';

export const prerender = false;

export const load = async () => {
	if (browser) return { seedEvents: [] };

	const { fetchApps, fetchStacks } = await import('$lib/nostr/server.js');
	const [appEvents, stackEvents] = await Promise.all([
		fetchApps(DISCOVER_APPS_INITIAL),
		fetchStacks(DISCOVER_STACKS_INITIAL)
	]);

	const seen = new Set();
	const seedEvents = [];
	for (const event of [...appEvents, ...stackEvents]) {
		if (!seen.has(event.id)) {
			seen.add(event.id);
			seedEvents.push(event);
		}
	}

	return { seedEvents };
};
