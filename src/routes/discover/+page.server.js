/**
 * Discover page - server-side data loading
 *
 * Pre-renders apps data for instant first paint,
 * same strategy as /apps page.
 */
import { fetchAppsByReleases, fetchStacks } from '$lib/nostr/server';
export const prerender = true;
const PAGE_SIZE = 40;
const STACKS_PAGE_SIZE = 20;
export const load = async () => {
    // Fetch first page of releases and resolve to apps
    const { apps, nextCursor, seedEvents, hasMore } = await fetchAppsByReleases(PAGE_SIZE);
    const { stacks, resolvedStacks, nextCursor: stacksNextCursor, seedEvents: stacksSeedEvents } = await fetchStacks(STACKS_PAGE_SIZE);
    return {
        apps,
        seedEvents,
        nextCursor,
        appsCursor: nextCursor,
        appsHasMore: hasMore ?? true,
        stacks,
        resolvedStacks,
        stacksNextCursor,
        stacksSeedEvents,
        fetchedAt: Date.now()
    };
};
