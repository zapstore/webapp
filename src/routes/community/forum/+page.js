/**
 * Forum feed — universal load.
 *
 * SSR: queries relay directly for forum posts, returns seedEvents.
 * Client nav: return empty — Dexie + liveQuery handle everything.
 */
import { browser } from '$app/environment';

const FORUM_FEED_LIMIT = 50;

export const prerender = false;

export async function load() {
	if (browser) return { seedEvents: [] };

	const { fetchForumPosts } = await import('$lib/nostr/server.js');
	const seedEvents = await fetchForumPosts(FORUM_FEED_LIMIT);
	return { seedEvents };
}
