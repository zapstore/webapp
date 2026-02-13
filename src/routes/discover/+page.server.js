/**
 * Discover page — server-side seed data
 *
 * Returns raw Nostr events for Dexie seeding. No parsed data — liveQuery handles rendering.
 * No releases on server — those are fetched client-side from relays.
 */
import { fetchApps, fetchStacks } from '$lib/nostr/server';

export const prerender = false;

export const load = async () => {
	const appEvents = fetchApps(50);
	const stackEvents = fetchStacks(20);

	// Deduplicate: stacks seed includes referenced app events that may overlap with app seed
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
