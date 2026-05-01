/**
 * Studio analytics cache (per-publisher).
 *
 * Centralises the precomputed impressions/downloads series and the country/platform
 * breakdowns so Insights and the per-app detail page share a single set of HTTP
 * requests. Series are fetched once per publisher for the **maximum** timeframe
 * (`MAX_TIMEFRAME_DAYS` = 365 days); shorter timeframes simply slice the tail.
 *
 * Responsibilities:
 * - Track current `pubkey` + `apps` for the dashboard.
 * - Hold the wide impressions/downloads/zaps series and per-series loading flags.
 * - Memoise country/platform breakdowns by `(rangeKey, appDTag)` so timeframe
 *   changes and per-app drilldowns each cost at most one round-trip.
 *
 * Not responsible for: fetching apps (the layout still resolves `userApps`),
 * mutating Dexie (analytics live entirely in the relay), or zaps relay reads —
 * `loadZapAppData` continues to talk to relays, this store just memoises the result.
 */
import {
	MAX_TIMEFRAME_DAYS,
	buildIsoDateRange,
	loadCountryBreakdown,
	loadDownloadAppData,
	loadImpressionAppData,
	loadPlatformBreakdown
} from '$lib/studio/analytics-http.js';
import { loadZapAppData } from '$lib/studio/zap-series.js';

/** @typedef {{ id: string, name: string, icon: string }} StudioApp */
/** @typedef {{ id: string, name: string, icon: string, counts: number[] }} AppSeries */

let pubkey = $state(/** @type {string | null} */ (null));
/** @type {StudioApp[]} */
let apps = $state([]);

/** @type {AppSeries[] | null} */
let impressionsSeries = $state(null);
/** @type {AppSeries[] | null} */
let downloadsSeries = $state(null);
/** @type {AppSeries[] | null} */
let zapsSeries = $state(null);

let impressionsLoading = $state(false);
let downloadsLoading = $state(false);
let zapsLoading = $state(false);

/** Bumped on every `loadIfNeeded` call; stale async loads must not overwrite UI. */
let loadGen = 0;

// Plain Maps — these are memo caches read via async `getCountryBreakdown` /
// `getPlatformBreakdown`, never inside a `$derived` or `$effect` change tracker,
// so reactivity isn't needed. SvelteMap would be wasted overhead here.
/* eslint-disable-next-line svelte/prefer-svelte-reactivity */
const countryByKey = new Map();
/* eslint-disable-next-line svelte/prefer-svelte-reactivity */
const platformByKey = new Map();

/**
 * Build the key used by `countryByKey` / `platformByKey`.
 * @param {{ from: string, to: string }} range
 * @param {string} [appDTag]
 */
function breakdownKey(range, appDTag) {
	return `${range.from}|${range.to}|${appDTag ?? ''}`;
}

export const studioAnalytics = {
	get pubkey() { return pubkey; },
	get apps() { return apps; },
	get impressionsSeries() { return impressionsSeries; },
	get downloadsSeries() { return downloadsSeries; },
	get zapsSeries() { return zapsSeries; },
	get impressionsLoading() { return impressionsLoading; },
	get downloadsLoading() { return downloadsLoading; },
	get zapsLoading() { return zapsLoading; }
};

/**
 * Reset everything — used when the user signs out or switches accounts.
 */
export function resetStudioAnalytics() {
	loadGen += 1;
	pubkey = null;
	apps = [];
	impressionsSeries = null;
	downloadsSeries = null;
	zapsSeries = null;
	impressionsLoading = false;
	downloadsLoading = false;
	zapsLoading = false;
	countryByKey.clear();
	platformByKey.clear();
}

/**
 * Load the per-publisher series. Idempotent — repeat calls with the same `(pubkey, apps)`
 * are no-ops while a load is already in flight or complete.
 *
 * @param {string} nextPubkey
 * @param {StudioApp[]} nextApps
 */
export function loadIfNeeded(nextPubkey, nextApps) {
	if (!nextPubkey || nextApps.length === 0) return;

	// Pubkey switch invalidates the cache entirely.
	const pubkeyChanged = nextPubkey !== pubkey;
	const appsChanged = nextApps !== apps;

	if (!pubkeyChanged && !appsChanged) return;

	if (pubkeyChanged) {
		// New developer — drop everything from the previous account.
		impressionsSeries = null;
		downloadsSeries = null;
		zapsSeries = null;
		countryByKey.clear();
		platformByKey.clear();
	}

	pubkey = nextPubkey;
	apps = nextApps;

	loadGen += 1;
	const gen = loadGen;
	const range = buildIsoDateRange(MAX_TIMEFRAME_DAYS);

	impressionsLoading = true;
	downloadsLoading = true;
	zapsLoading = true;

	void (async () => {
		try {
			const data = await loadImpressionAppData(nextPubkey, nextApps, range, MAX_TIMEFRAME_DAYS);
			if (gen !== loadGen) return;
			impressionsSeries = data;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg !== 'ANALYTICS_HTTP_DISABLED') console.warn('[Studio] impressions series load failed:', err);
			if (gen === loadGen) impressionsSeries = null;
		} finally {
			if (gen === loadGen) impressionsLoading = false;
		}
	})();

	void (async () => {
		try {
			const data = await loadDownloadAppData(nextPubkey, nextApps, range, MAX_TIMEFRAME_DAYS);
			if (gen !== loadGen) return;
			downloadsSeries = data;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg !== 'ANALYTICS_HTTP_DISABLED') console.warn('[Studio] downloads series load failed:', err);
			if (gen === loadGen) downloadsSeries = null;
		} finally {
			if (gen === loadGen) downloadsLoading = false;
		}
	})();

	void (async () => {
		try {
			const data = await loadZapAppData(nextPubkey, nextApps, MAX_TIMEFRAME_DAYS);
			if (gen !== loadGen) return;
			zapsSeries = data;
		} catch (err) {
			console.warn('[Studio] zaps series load failed:', err);
			if (gen === loadGen) zapsSeries = null;
		} finally {
			if (gen === loadGen) zapsLoading = false;
		}
	})();
}

/**
 * Slice the trailing `days` from a series and sum across all apps.
 * Mirrors the previous `totalCountInLastNDays` / `sumLastWindow` math.
 * @param {AppSeries[] | null} series
 * @param {number} days
 */
export function totalForWindow(series, days) {
	if (!series) return 0;
	const n = Math.max(1, days);
	let total = 0;
	for (const app of series) {
		const c = app.counts ?? [];
		const slice = c.length >= n ? c.slice(-n) : c;
		for (const v of slice) total += v;
	}
	return total;
}

/**
 * Slice the trailing `2*days` for a single app — used by the per-app detail page,
 * which needs two windows back-to-back to compute the prior-period % ticker.
 * @param {AppSeries[] | null} series
 * @param {string} appDTag
 * @param {number} days
 */
export function counts2xForApp(series, appDTag, days) {
	if (!series) return [];
	const target = appDTag.toLowerCase();
	const row = series.find((a) => a.id.toLowerCase() === target);
	if (!row) return [];
	const span = Math.max(1, 2 * days);
	const c = row.counts ?? [];
	return c.length >= span ? c.slice(-span) : c;
}

/**
 * Memoised country breakdown. First call for `(range, appDTag)` issues the two
 * underlying HTTP requests (impressions + downloads); later calls return the cached rows.
 *
 * @param {{ from: string, to: string }} range
 * @param {string} [appDTag]
 */
export async function getCountryBreakdown(range, appDTag) {
	const pk = pubkey;
	if (!pk) return [];
	const key = breakdownKey(range, appDTag);
	const cached = countryByKey.get(key);
	if (cached) return cached;
	const promise = loadCountryBreakdown(pk, range, 10, appDTag).catch((err) => {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg !== 'ANALYTICS_HTTP_DISABLED') console.warn('[Studio] country breakdown failed:', err);
		// Drop the failed promise so a later call can retry.
		countryByKey.delete(key);
		return [];
	});
	countryByKey.set(key, promise);
	return promise;
}

/**
 * Memoised platform breakdown. Same caching rules as `getCountryBreakdown`.
 *
 * @param {{ from: string, to: string }} range
 * @param {string} [appDTag]
 */
export async function getPlatformBreakdown(range, appDTag) {
	const pk = pubkey;
	if (!pk) return [];
	const key = breakdownKey(range, appDTag);
	const cached = platformByKey.get(key);
	if (cached) return cached;
	const promise = loadPlatformBreakdown(pk, range, appDTag).catch((err) => {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg !== 'ANALYTICS_HTTP_DISABLED') console.warn('[Studio] platform breakdown failed:', err);
		platformByKey.delete(key);
		return [];
	});
	platformByKey.set(key, promise);
	return promise;
}
