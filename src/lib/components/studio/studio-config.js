// ═══════════════════════════════════════════════════════════════════════════
//  STUDIO DUMMY MODE
//
//  true  → wave-generated fake data — no relay, no API, no published apps needed
//  false → real data (impressions/downloads from /api/studio/analytics, zaps via Nostr)
//
//  Flip this when your own keypair has no published apps yet.
// ═══════════════════════════════════════════════════════════════════════════
export const DUMMY_MODE = false;

// ── Test pubkey override ─────────────────────────────────────────────────────
// When DUMMY_MODE is false and your own keypair has no published apps, set this
// to any developer's hex pubkey or npub to see their real data instead.
// Set to null to use the signed-in NIP-07 pubkey.
//
// Example: export const TEST_PUBKEY = 'npub1zapsto...';
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
export function buildDummyAppData(seeds = DL_SEEDS, days = STUDIO_DAYS) {
	return DUMMY_APPS.map((app, i) => {
		const s = seeds[i] ?? seeds[0];
		return {
			...app,
			counts: Array.from({ length: days }, (_, j) => wave(j, s.seed, s.base, s.amp, days))
		};
	});
}

// Sum all counts across all apps and all days in an appData array.
export function totalCount(appData) {
	return appData.reduce((total, app) => total + app.counts.reduce((s, v) => s + v, 0), 0);
}
