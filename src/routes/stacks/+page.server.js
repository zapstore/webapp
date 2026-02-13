/**
 * Stacks listing page — server-side seed data
 *
 * Returns raw Nostr events for Dexie seeding. No parsed data — liveQuery handles rendering.
 */
import { fetchStacks } from '$lib/nostr/server';

export const prerender = false;

export const load = async () => {
	const seedEvents = fetchStacks(20);
	return { seedEvents };
};
