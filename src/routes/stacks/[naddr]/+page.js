/**
 * Stack detail page — universal load
 *
 * SSR: queries relay.zapstore.dev directly for stack + apps + creator.
 * Client-side navigation: returns empty — component queries Dexie directly.
 * Offline: no server round-trip needed, component loads from IndexedDB.
 */
import { browser } from '$app/environment';
import { decodeNaddr } from '$lib/nostr';

export const prerender = false;

export const load = async ({ params }) => {
	if (browser) return { stack: null, apps: [], error: null, seedEvents: [] };

	const { nip19 } = await import('nostr-tools');
	const { fetchStack } = await import('$lib/nostr/server.js');

	const pointer = decodeNaddr(params.naddr);
	if (!pointer) {
		return { stack: null, apps: [], error: 'Invalid stack URL', seedEvents: [] };
	}

	const { pubkey, identifier } = pointer;
	const result = await fetchStack(pubkey, identifier);
	if (!result) {
		return { stack: null, apps: [], error: 'Stack not found', seedEvents: [] };
	}

	const creator = result.creator
		? {
				...result.creator,
				npub: result.creator.pubkey ? nip19.npubEncode(result.creator.pubkey) : undefined
			}
		: null;

	return {
		stack: { ...result.stack, creator },
		apps: result.apps,
		error: null,
		seedEvents: result.seedEvents
	};
};
