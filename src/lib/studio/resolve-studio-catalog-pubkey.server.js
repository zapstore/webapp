/**
 * Selected signers → Zapstore indexer catalog mapping. Server-only — not bundled for the client.
 */
import { nip19 } from 'nostr-tools';
import { ZAPSTORE_NPUB } from '$lib/config.js';

/** Studio identities that load the indexer catalog (all Zapstore apps) instead of personal apps. */
const STUDIO_INDEXER_VIEW_SIGNER_NPUBS = [
	'npub1wf4pufsucer5va8g9p0rj5dnhvfeh6d8w0g6eayaep5dhps6rsgs43dgh9', // Franzaps
	'npub176p7sup477k5738qhxx0hk2n0cty2k5je5uvalzvkvwmw4tltmeqw7vgup' // Pip
];

/** @param {string} npub */
function decodeNpubToHexLower(npub) {
	try {
		const d = nip19.decode(npub);
		return d.type === 'npub' ? String(/** @type {string} */ (d.data)).toLowerCase() : null;
	} catch {
		return null;
	}
}

const STUDIO_INDEXER_VIEW_SIGNER_HEX = new Set(
	STUDIO_INDEXER_VIEW_SIGNER_NPUBS.map((n) => decodeNpubToHexLower(n)).filter(Boolean)
);
const STUDIO_INDEXER_CATALOG_HEX = decodeNpubToHexLower(ZAPSTORE_NPUB);

/**
 * @param {string} signerPubkeyHex — lowercase 64-char hex
 * @returns {string} catalog author pubkey hex (indexer when signer is in STUDIO_INDEXER_VIEW_SIGNER_NPUBS)
 */
export function resolveStudioCatalogPubkeyServer(signerPubkeyHex) {
	const s = String(signerPubkeyHex ?? '').toLowerCase();
	if (!STUDIO_INDEXER_CATALOG_HEX) return s;
	if (STUDIO_INDEXER_VIEW_SIGNER_HEX.has(s)) return STUDIO_INDEXER_CATALOG_HEX;
	return s;
}
