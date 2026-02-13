import { json } from '@sveltejs/kit';
import { fetchProfilesServer } from '$lib/nostr/server';

export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	const pubkeys = Array.isArray(body?.pubkeys) ? body.pubkeys : [];
	const timeout = Number(body?.timeout) > 0 ? Number(body.timeout) : 5000;

	const map = await fetchProfilesServer(pubkeys, { timeout });
	const profiles = {};
	for (const [pubkey, event] of map.entries()) {
		profiles[pubkey] = event;
	}
	return json({ profiles });
}
