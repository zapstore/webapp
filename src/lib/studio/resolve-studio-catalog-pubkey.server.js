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

/**
 * Per-signer overrides: maps a signer npub to a different catalog pubkey npub.
 * When a signer logs in, Studio loads apps published by the mapped catalog pubkey instead.
 * Format: [signerNpub, catalogNpub]
 */
const STUDIO_SIGNER_CATALOG_OVERRIDES = /** @type {[string, string][]} */ ([
	// ['npub149p5act9a5qm9p47elp8w8h3wpwn2d7s2xecw2ygnrxqp4wgsklq9g722q', 'npub1utx00neqgqln72j22kej3ux7803c2k986henvvha4thuwfkper4s7r50e8']
]);

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

/** Map<signerHex, catalogHex> for explicit per-signer overrides. */
const STUDIO_SIGNER_CATALOG_MAP = new Map(
	STUDIO_SIGNER_CATALOG_OVERRIDES.flatMap(([signerNpub, catalogNpub]) => {
		const signerHex = decodeNpubToHexLower(signerNpub);
		const catalogHex = decodeNpubToHexLower(catalogNpub);
		return signerHex && catalogHex ? [[signerHex, catalogHex]] : [];
	})
);

/**
 * @param {string} signerPubkeyHex — lowercase 64-char hex
 * @returns {string} catalog author pubkey hex
 */
export function resolveStudioCatalogPubkeyServer(signerPubkeyHex) {
	const s = String(signerPubkeyHex ?? '').toLowerCase();
	const override = STUDIO_SIGNER_CATALOG_MAP.get(s);
	if (override) return override;
	if (!STUDIO_INDEXER_CATALOG_HEX) return s;
	if (STUDIO_INDEXER_VIEW_SIGNER_HEX.has(s)) return STUDIO_INDEXER_CATALOG_HEX;
	return s;
}
