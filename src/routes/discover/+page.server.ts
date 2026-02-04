/**
 * Discover page - server-side data loading
 *
 * Pre-renders apps data for instant first paint,
 * same strategy as /apps page.
 */

import { fetchAppsByReleases } from '$lib/nostr/server';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 40;

export const load: PageServerLoad = async () => {
	// Fetch first page of releases and resolve to apps
	const { apps, nextCursor } = await fetchAppsByReleases(PAGE_SIZE);

	return {
		apps,
		nextCursor,
		fetchedAt: Date.now()
	};
};
