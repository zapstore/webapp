/**
 * Stacks listing page — universal load
 *
 * SSR: queries relay.zapstore.dev directly for seed events.
 * Client-side navigation: returns empty — Dexie (IndexedDB) + liveQuery handle everything.
 * Offline: no server round-trip needed, page renders from local data.
 */
import { browser } from '$app/environment';
import { STACKS_PAGE_SIZE } from '$lib/constants';

export const prerender = false;

export const load = async () => {
	if (browser) return { seedEvents: [] };

	const { fetchStacks } = await import('$lib/nostr/server.js');
	const seedEvents = await fetchStacks(STACKS_PAGE_SIZE);
	return { seedEvents };
};
