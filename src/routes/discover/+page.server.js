/**
 * Discover page — server-side seed data
 *
 * Returns raw Nostr events for Dexie seeding. No parsed data — liveQuery handles rendering.
 * No releases on server — those are fetched client-side from relays.
 *
 * On client-side navigation (isDataRequest), returns empty seeds — Dexie already has
 * data from the first page's seed + active relay subscriptions. This prevents sending
 * duplicate app/stack payloads when navigating between listing pages.
 */
import { fetchApps, fetchStacks } from '$lib/nostr/server';

export const prerender = false;

/** Above-the-fold limits: ~4 columns × 4 rows of apps, ~4 visible stacks */
const SEED_APPS_LIMIT = 24;
const SEED_STACKS_LIMIT = 8;

export const load = async ({ isDataRequest }) => {
	// Client-side navigation: Dexie + relay subscriptions are active, no seed data needed
	if (isDataRequest) {
		return { seedEvents: [] };
	}

	const appEvents = fetchApps(SEED_APPS_LIMIT);
	const stackEvents = fetchStacks(SEED_STACKS_LIMIT);

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
