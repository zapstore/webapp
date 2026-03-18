/**
 * Forum feed — universal load (same pattern as apps).
 *
 * SSR: fetch forum posts from server's in-memory relay cache, return seedEvents.
 * Client nav: return empty — Dexie + liveQuery handle everything.
 */
import { browser } from '$app/environment';

const FORUM_FEED_LIMIT = 50;

export const prerender = false;

export async function load() {
	if (browser) return { seedEvents: [] };

	const { fetchForumPosts } = await import('$lib/nostr/server.js');
	const seedEvents = fetchForumPosts(FORUM_FEED_LIMIT);
	return { seedEvents };
}
