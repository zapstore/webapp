import { nip19 } from 'nostr-tools';
import { ZAPSTORE_NPUB } from '$lib/config.js';

/** @param {string} npub */
function decodeNpubToHexLower(npub) {
	try {
		const d = nip19.decode(npub);
		return d.type === 'npub' ? String(/** @type {string} */ (d.data)).toLowerCase() : null;
	} catch {
		return null;
	}
}

const STUDIO_INDEXER_CATALOG_HEX = decodeNpubToHexLower(ZAPSTORE_NPUB);

/** True when Studio is showing the Zapstore indexer catalog (sidebar ordering, etc.). */
export function isStudioIndexerCatalogPubkey(pubkeyHex) {
	return (
		STUDIO_INDEXER_CATALOG_HEX != null &&
		String(pubkeyHex ?? '').toLowerCase() === STUDIO_INDEXER_CATALOG_HEX
	);
}

/** Official Zapstore app d-tag on the indexer (kind 32267); pinned first in "Your Apps" for indexer view. */
export const STUDIO_ZAPSTORE_APP_DTAG = 'dev.zapstore.app';

/**
 * Move the Zapstore app to the front of the sidebar list when viewing the indexer catalog.
 * @template {{ id: string }}
 * @param {readonly { id: string }[]} apps
 */
export function sortStudioIndexerAppsZapstoreFirst(apps) {
	if (!apps?.length) return [...apps];
	const key = STUDIO_ZAPSTORE_APP_DTAG.toLowerCase();
	const idx = apps.findIndex((a) => a.id.toLowerCase() === key);
	if (idx <= 0) return [...apps];
	const next = [...apps];
	const [z] = next.splice(idx, 1);
	next.unshift(z);
	return next;
}

// ── Test pubkey override ─────────────────────────────────────────────────────
// Pretend to be any developer for Studio (apps list + analytics). Accepts 64-char hex or npub1….
// When set, NIP-07 is not required for loading Studio data.
// Set to null to use the browser's NIP-07 pubkey (if available).
//
// Example: export const TEST_PUBKEY = 'npub1…';
export const TEST_PUBKEY = null;

// ── Dev toggle: force the "no apps published" empty state ────────────────────
// Set to true to see the Insights empty state regardless of actual app data.
export const FORCE_EMPTY_INSIGHTS = false;

// ── Chart window ─────────────────────────────────────────────────────────────
export const STUDIO_DAYS = 30;

/**
 * Sum counts in the last `n` days per app (charts / headers use the visible window only).
 * @param {{ counts: number[] }[]} appData
 * @param {number} n
 */
export function totalCountInLastNDays(appData, n) {
	const window = Math.max(1, n);
	return appData.reduce((total, app) => {
		const c = app.counts ?? [];
		const slice = c.length >= window ? c.slice(-window) : c;
		return total + slice.reduce((s, v) => s + v, 0);
	}, 0);
}
