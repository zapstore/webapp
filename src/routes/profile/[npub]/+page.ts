/**
 * Profile detail page - client-only, decode npub from URL.
 */

import type { PageLoad } from './$types';
import { nip19 } from 'nostr-tools';

export const prerender = false;

export const load: PageLoad = async ({ params }) => {
	const npub = params.npub ?? '';
	let pubkey: string | null = null;
	try {
		const decoded = nip19.decode(npub);
		if (decoded.type === 'npub') {
			pubkey = decoded.data;
		}
	} catch {
		// invalid npub
	}
	return { npub, pubkey };
};
