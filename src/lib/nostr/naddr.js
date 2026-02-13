/**
 * NIP-19 naddr encoding/decoding utilities
 * Uses nostr-tools nip19 module directly.
 */
import { nip19 } from 'nostr-tools';

/**
 * Encode an address pointer to naddr string
 */
export function encodeNaddr(pointer) {
	return nip19.naddrEncode(pointer);
}

/**
 * Decode an naddr string to address pointer
 */
export function decodeNaddr(naddr) {
	try {
		const decoded = nip19.decode(naddr);
		if (decoded.type === 'naddr') {
			return decoded.data;
		}
	} catch {
		// Invalid naddr
	}
	return null;
}
