/**
 * Studio signer policy. Server-only — not bundled for the client.
 *
 * Two responsibilities:
 *
 *  - **Catalog pubkey**: which author's kind 32267 events power the signer's sidebar.
 *    Today this is always the signer's own pubkey — every developer sees their own
 *    apps. The slot exists for future per-signer overrides (e.g. an agency account
 *    publishing on behalf of a brand) via `STUDIO_SIGNER_CATALOG_OVERRIDES`.
 *
 *  - **Indexer access**: a small allowlist of signers permitted to view *any* app
 *    in the Zapstore indexer catalog by typing `/studio/apps/<id>` directly. They
 *    don't see those apps in their sidebar — URL-only access for spot-checks.
 */
import { nip19 } from 'nostr-tools';
import { ZAPSTORE_NPUB } from '$lib/config.js';

/**
 * Signers permitted to URL-access apps from the Zapstore indexer catalog.
 * Their own sidebar still lists only the apps they personally publish.
 */
const STUDIO_INDEXER_ACCESS_SIGNER_NPUBS = [
	'npub1wf4pufsucer5va8g9p0rj5dnhvfeh6d8w0g6eayaep5dhps6rsgs43dgh9', // Franzaps
	'npub176p7sup477k5738qhxx0hk2n0cty2k5je5uvalzvkvwmw4tltmeqw7vgup' // Pip
];

/**
 * Per-signer catalog overrides. When a signer logs in, Studio loads apps published
 * by the mapped catalog pubkey instead of the signer's own. Format: [signerNpub, catalogNpub].
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

const STUDIO_INDEXER_ACCESS_SIGNER_HEX = new Set(
	STUDIO_INDEXER_ACCESS_SIGNER_NPUBS.map((n) => decodeNpubToHexLower(n)).filter(Boolean)
);

/** Hex pubkey of the Zapstore indexer catalog — used as the fallback author for indexer-access lookups. */
export const STUDIO_INDEXER_CATALOG_HEX = decodeNpubToHexLower(ZAPSTORE_NPUB);

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
 * @returns {{ catalogPubkey: string, indexerAccess: boolean }}
 */
export function resolveStudioCatalogPubkeyServer(signerPubkeyHex) {
	const s = String(signerPubkeyHex ?? '').toLowerCase();
	const catalogPubkey = STUDIO_SIGNER_CATALOG_MAP.get(s) ?? s;
	const indexerAccess =
		STUDIO_INDEXER_CATALOG_HEX != null && STUDIO_INDEXER_ACCESS_SIGNER_HEX.has(s);
	return { catalogPubkey, indexerAccess };
}
