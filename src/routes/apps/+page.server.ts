/**
 * Apps listing page - server-side data loading
 *
 * Data loading strategy:
 * - Load releases (kind 30063) sorted by created_at
 * - For each release, find its app (kind 32267)
 * - Pre-render first 20 apps for instant first paint
 * - Client hydrates and paginates for remaining apps
 */

import { fetchAppsByReleases } from '$lib/nostr/server';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 20;

export const prerender = true;

export const load: PageServerLoad = async () => {
	// Fetch first page of releases and resolve to apps
	const { apps, nextCursor } = await fetchAppsByReleases(PAGE_SIZE);

	return {
		apps,
		nextCursor,
		fetchedAt: Date.now()
	};
};
