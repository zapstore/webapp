/**
 * Stacks listing page — server-side seed data
 *
 * Returns stacks with resolved apps from the polling cache.
 */
import { fetchStacks } from '$lib/nostr/server';

export const load = async () => {
	const { stacks, resolvedStacks, seedEvents } = await fetchStacks(20);
	return {
		stacks,
		resolvedStacks,
		seedEvents,
		fetchedAt: Date.now()
	};
};
