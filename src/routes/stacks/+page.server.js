/**
 * Stacks listing page — server-side seed data
 *
 * Returns raw Nostr events for Dexie seeding. No parsed data — liveQuery handles rendering.
 *
 * On client-side navigation (isDataRequest), returns empty seeds — Dexie already has
 * data from the first page's seed + active relay subscriptions.
 */
import { fetchStacks } from '$lib/nostr/server';

export const prerender = false;

/** Above-the-fold: grid shows ~6 stacks, plus scroll buffer */
const SEED_STACKS_LIMIT = 12;

export const load = async ({ isDataRequest }) => {
	// Client-side navigation: Dexie + relay subscriptions are active, no seed data needed
	if (isDataRequest) {
		return { seedEvents: [] };
	}

	const seedEvents = fetchStacks(SEED_STACKS_LIMIT);
	return { seedEvents };
};
