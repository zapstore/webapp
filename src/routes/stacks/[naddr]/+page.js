/**
 * Stack detail page — universal load
 *
 * SSR: queries relay.zapstore.dev directly for stack + apps + creator.
 * Client-side navigation: returns empty — component queries Dexie directly.
 * Offline: no server round-trip needed, component loads from IndexedDB.
 */
import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { decodeNaddr } from '$lib/nostr';
import { EVENT_KINDS } from '$lib/config';

export const prerender = false;

export const load = async ({ params }) => {
	if (browser) return { stack: null, apps: [], error: null, seedEvents: [] };

	const { nip19 } = await import('nostr-tools');
	const { fetchStack } = await import('$lib/purpleweb/server.js');

	const pointer = decodeNaddr(params.naddr);
	if (!pointer) {
		const seg = params.naddr ?? '';
		// Bare package ids (e.g. com.example.app) are app URLs, not stack naddrs.
		if (seg && !seg.startsWith('naddr1')) {
			redirect(302, `/apps/${seg}`);
		}
		return { stack: null, apps: [], error: 'Invalid stack URL', seedEvents: [] };
	}

	// `/stacks/naddr...` must be a stack (30267). App naddrs belong on `/apps/…`.
	if (pointer.kind === EVENT_KINDS.APP) {
		redirect(302, `/apps/${params.naddr}`);
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
