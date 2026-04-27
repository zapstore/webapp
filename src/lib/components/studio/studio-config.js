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

/** Official Zapstore app d-tag on the indexer (kind 32267); pinned first in “Your Apps” for indexer view. */
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

// ═══════════════════════════════════════════════════════════════════════════
//  STUDIO DUMMY MODE
//
//  true  → wave-generated fake data — no relay, no API, no published apps needed
//  false → real data (v1 analytics via STUDIO_ANALYTICS_HTTP_URL proxy, else legacy NIP-98 /api/studio/analytics)
//
//  Flip this when your own keypair has no published apps yet.
// ═══════════════════════════════════════════════════════════════════════════
export const DUMMY_MODE = false;

// ── Test pubkey override ─────────────────────────────────────────────────────
// Pretend to be any developer for Studio (apps list + analytics). Accepts 64-char hex or npub1….
// When set, NIP-07 is not required for loading Studio data.
// Set to null to use the browser’s NIP-07 pubkey (if available).
//
// Example: export const TEST_PUBKEY = 'npub1…';
export const TEST_PUBKEY = null;

// ── Chart window ─────────────────────────────────────────────────────────────
export const STUDIO_DAYS = 30;

// ── Dummy apps ───────────────────────────────────────────────────────────────
// Shown in the sidebar + chart legend when DUMMY_MODE is true.
export const DUMMY_APPS = [
	{
		id: 'app-a',
		name: 'NewPipe',
		icon: '/images/parallax-apps/newpipe.png',
		description: 'A libre streaming client for Android with no ads or tracking.'
	},
	{
		id: 'app-b',
		name: 'Primal',
		icon: '/images/parallax-apps/primal.png',
		description: 'A fast Nostr client with a social feed, built-in wallet, and marketplace.'
	}
];

// Wave seeds for each chart — (seed, base, amp) per app.
// Tweak to get different curve shapes for testing.
export const DL_SEEDS = [
	{ seed: 1.2, base: 68, amp: 42 },
	{ seed: 3.1, base: 36, amp: 24 }
];

export const ZAP_SEEDS = [
	{ seed: 2.4, base: 28, amp: 18 },
	{ seed: 5.7, base: 14, amp: 10 }
];

export const IMP_SEEDS = [
	{ seed: 4.1, base: 220, amp: 140 },
	{ seed: 7.3, base: 110, amp: 80 }
];

/** Demo rows for the platform breakdown chart (DUMMY_MODE only). */
export const DUMMY_PLATFORM_ROWS = [
	{ source: 'app', label: 'App', impressions: 18_200, downloads: 1_420 },
	{ source: 'web', label: 'Web', impressions: 3_400, downloads: 160 }
];

/** Demo rows for the country breakdown chart (DUMMY_MODE only). */
export const DUMMY_COUNTRY_ROWS = [
	{ countryKey: 'US', label: 'United States', impressions: 12_400, downloads: 920 },
	{ countryKey: 'DE', label: 'Germany', impressions: 5100, downloads: 310 },
	{ countryKey: 'GB', label: 'United Kingdom', impressions: 4200, downloads: 240 },
	{ countryKey: 'NL', label: 'Netherlands', impressions: 2800, downloads: 180 },
	{ countryKey: 'BR', label: 'Brazil', impressions: 1900, downloads: 95 }
];

// ── Wave generator ────────────────────────────────────────────────────────────
export function wave(i, seed, base, amp, days = STUDIO_DAYS) {
	const trend = (i / (days - 1)) * amp * 1.5;
	const s1 = Math.sin(i * 0.9 + seed) * amp * 0.3;
	const s2 = Math.sin(i * 2.5 + seed * 1.4) * amp * 0.18;
	const s3 = Math.sin(i * 0.4 + seed * 2.1) * amp * 0.22;
	return Math.max(2, Math.round(base * 0.4 + trend + s1 + s2 + s3));
}

// Build an appData array compatible with DownloadChart's appData prop.
// seeds: array of { seed, base, amp } — one per app. Defaults to DL_SEEDS.
// `days` = visible chart window; we emit 2× points (prior window + current) for % tickers.
export function buildDummyAppData(seeds = DL_SEEDS, days = STUDIO_DAYS) {
	const span = Math.max(1, days) * 2;
	return DUMMY_APPS.map((app, i) => {
		const s = seeds[i] ?? seeds[0];
		return {
			...app,
			counts: Array.from({ length: span }, (_, j) => wave(j, s.seed, s.base, s.amp, span))
		};
	});
}

// Sum all counts across all apps and all days in an appData array.
export function totalCount(appData) {
	return appData.reduce((total, app) => total + app.counts.reduce((s, v) => s + v, 0), 0);
}

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
