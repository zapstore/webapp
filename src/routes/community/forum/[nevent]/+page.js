/**
 * Forum post detail — universal load (same pattern as app detail).
 *
 * SSR: fetch post from server cache by event id, return { post, seedEvents }.
 * Client nav: return empty — component loads from Dexie or relay.
 */
import { browser } from '$app/environment';
import { nip19 } from 'nostr-tools';

export const prerender = false;

export async function load({ params }) {
	const encoded = params.nevent ?? '';
	let eventId = '';
	try {
		const d = nip19.decode(encoded);
		if (d.type === 'nevent') eventId = d.data.id;
		else if (d.type === 'note') eventId = d.data;
	} catch {
		// invalid nevent
	}

	if (browser) return { post: null, seedEvents: [] };
	if (!eventId) return { post: null, seedEvents: [] };

	const { fetchForumPostById } = await import('$lib/nostr/server.js');
	const result = fetchForumPostById(eventId);
	if (!result) return { post: null, seedEvents: [] };

	return {
		post: result.post ? { ...result.post, _raw: result.seedEvents[0] } : null,
		seedEvents: result.seedEvents
	};
}
