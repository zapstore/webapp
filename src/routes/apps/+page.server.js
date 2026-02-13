/**
 * Apps listing page — server-side seed data
 *
 * Returns top apps from the polling cache (ordered by created_at).
 * No releases on server — those are fetched client-side from relays.
 */
import { fetchApps } from '$lib/nostr/server';

export const prerender = true;

export const load = async () => {
	const { apps, seedEvents } = await fetchApps(50);
	return {
		apps,
		seedEvents,
		fetchedAt: Date.now()
	};
};
