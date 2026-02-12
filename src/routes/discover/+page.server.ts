/**
 * Discover page - server-side data loading
 *
 * Pre-renders apps data for instant first paint,
 * same strategy as /apps page.
 */

import { fetchAppsByReleases } from '$lib/nostr/server';
import type { PageServerLoad } from './$types';

export const prerender = true;

const PAGE_SIZE = 40;

export const load: PageServerLoad = async () => {
	// Fetch first page of releases and resolve to apps
	const { apps, nextCursor, seedEvents } = await fetchAppsByReleases(PAGE_SIZE);

	return {
		apps,
		seedEvents,
		nextCursor,
		fetchedAt: Date.now()
	};
};
