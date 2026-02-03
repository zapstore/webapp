/**
 * NIP-19 naddr encoding/decoding utilities
 * Uses applesauce-core helpers (which re-export from nostr-tools)
 */

import {
	naddrEncode,
	decodeAddressPointer,
	type AddressPointer
} from 'applesauce-core/helpers/pointers';

// Re-export the type
export type { AddressPointer };

/**
 * Encode an address pointer to naddr string
 */
export function encodeNaddr(pointer: AddressPointer): string {
	return naddrEncode(pointer);
}

/**
 * Decode an naddr string to address pointer
 */
export function decodeNaddr(naddr: string): AddressPointer | null {
	try {
		return decodeAddressPointer(naddr);
	} catch {
		// Invalid naddr
		return null;
	}
}
