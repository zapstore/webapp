/**
 * Discover page — server-side seed data
 *
 * Returns apps and stacks from the polling cache for instant first paint.
 * No releases on server — those are fetched client-side from relays.
 */
import { fetchApps, fetchStacks } from '$lib/nostr/server';

export const prerender = true;

export const load = async () => {
	const { apps, seedEvents } = await fetchApps(50);
	const { stacks, resolvedStacks, seedEvents: stacksSeedEvents } = await fetchStacks(20);
	return {
		apps,
		seedEvents,
		stacks,
		resolvedStacks,
		stacksSeedEvents,
		fetchedAt: Date.now()
	};
};
