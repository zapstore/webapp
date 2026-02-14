/**
 * Apps listing page — server-side seed data
 *
 * Returns raw Nostr events for Dexie seeding. No parsed data — liveQuery handles rendering.
 * No releases on server — those are fetched client-side from relays.
 *
 * On client-side navigation (isDataRequest), returns empty seeds — Dexie already has
 * data from the first page's seed + active relay subscriptions. This prevents sending
 * duplicate app payloads when navigating from /discover → /apps.
 */
import { fetchApps } from '$lib/nostr/server';

export const prerender = false;

/** Above-the-fold: 3-column grid × ~3 rows ≈ 9, plus scroll buffer */
const SEED_APPS_LIMIT = 24;

export const load = async ({ isDataRequest }) => {
	// Client-side navigation: Dexie + relay subscriptions are active, no seed data needed
	if (isDataRequest) {
		return { seedEvents: [] };
	}

	const seedEvents = fetchApps(SEED_APPS_LIMIT);
	return { seedEvents };
};
