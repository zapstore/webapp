/**
 * Franzaps → Zapstore indexer catalog mapping. Server-only — not bundled for the client.
 */
import { nip19 } from 'nostr-tools';
import { ZAPSTORE_NPUB } from '$lib/config.js';

/** Studio identity that loads the indexer catalog instead of personal apps. */
const STUDIO_FRANZAPS_NPUB = 'npub1wf4pufsucer5va8g9p0rj5dnhvfeh6d8w0g6eayaep5dhps6rsgs43dgh9';

/** @param {string} npub */
function decodeNpubToHexLower(npub) {
	try {
		const d = nip19.decode(npub);
		return d.type === 'npub' ? String(/** @type {string} */ (d.data)).toLowerCase() : null;
	} catch {
		return null;
	}
}

const STUDIO_FRANZAPS_HEX = decodeNpubToHexLower(STUDIO_FRANZAPS_NPUB);
const STUDIO_INDEXER_CATALOG_HEX = decodeNpubToHexLower(ZAPSTORE_NPUB);

/**
 * @param {string} signerPubkeyHex — lowercase 64-char hex
 * @returns {string} catalog author pubkey hex (indexer when signer is Franzaps)
 */
export function resolveStudioCatalogPubkeyServer(signerPubkeyHex) {
	const s = String(signerPubkeyHex ?? '').toLowerCase();
	if (!STUDIO_FRANZAPS_HEX || !STUDIO_INDEXER_CATALOG_HEX) return s;
	if (s === STUDIO_FRANZAPS_HEX) return STUDIO_INDEXER_CATALOG_HEX;
	return s;
}
