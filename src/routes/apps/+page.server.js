/**
 * Apps listing page — server-side seed data
 *
 * Returns raw Nostr events for Dexie seeding. No parsed data — liveQuery handles rendering.
 * No releases on server — those are fetched client-side from relays.
 */
import { fetchApps } from '$lib/nostr/server';

export const prerender = false;

export const load = async () => {
	const seedEvents = fetchApps(50);
	return { seedEvents };
};
