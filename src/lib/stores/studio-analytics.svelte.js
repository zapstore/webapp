/**
 * Studio analytics cache (per-publisher).
 *
 * Centralises the precomputed impressions/downloads series and the country/platform
 * breakdowns so Insights and the per-app detail page share a single set of HTTP
 * requests. Series are fetched once per publisher for the **maximum** timeframe
 * (`MAX_TIMEFRAME_DAYS` = 365 days); shorter timeframes simply slice the tail.
 *
 * Two cache scopes:
 *
 *  - **Signer's own catalog** — `loadIfNeeded(signerPk, ownApps)` fetches the wide
 *    publisher-level series once. Insights and per-app pages (for the signer's apps)
 *    read from this with zero extra requests.
 *
 *  - **Indexer-access apps** — when an allowlisted signer opens an arbitrary app
 *    via URL, that app is published by a different pubkey (the indexer catalog).
 *    `loadAppSeriesIfNeeded(pubkey, dTag)` fetches just that app's series and caches
 *    by `(pubkey, dTag)`. No effect on the signer's own series cache.
 *
 * Not responsible for: fetching apps (the layout still resolves `userApps`) or
 * Nostr zap reads; `loadZapAppData` lives behind the purpleweb boundary and this
 * store just memoises the result.
 */
import {
	MAX_TIMEFRAME_DAYS,
	buildIsoDateRange,
	fetchDownloads,
	fetchImpressions,
	loadCountryBreakdown,
	loadDownloadAppData,
	loadImpressionAppData,
	loadPlatformBreakdown
} from '$lib/studio/analytics-http.js';
import { loadZapAppData } from '$lib/purpleweb';

/** @typedef {{ id: string, name: string, icon: string }} StudioApp */
/** @typedef {{ id: string, name: string, icon: string, counts: number[] }} AppSeries */
/** @typedef {{ impressions: number[] | null, downloads: number[] | null, loading: boolean }} SingleAppSeries */

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

/** Per-app series for indexer-access lookups, keyed by `${pubkey}|${dTag}`. */
let appSeries = $state(/** @type {Record<string, SingleAppSeries>} */ ({}));

/** Bumped on every `loadIfNeeded` call; stale async loads must not overwrite UI. */
let loadGen = 0;

// Plain Maps — these are memo caches read via async `getCountryBreakdown` /
// `getPlatformBreakdown`, never inside a `$derived` or `$effect` change tracker,
// so reactivity isn't needed. SvelteMap would be wasted overhead here.
/* eslint-disable-next-line svelte/prefer-svelte-reactivity */
const countryByKey = new Map();
/* eslint-disable-next-line svelte/prefer-svelte-reactivity */
const platformByKey = new Map();
/** Keys of in-flight per-app series fetches — prevents duplicate work on rapid revisits. */
/* eslint-disable-next-line svelte/prefer-svelte-reactivity */
const appSeriesInFlight = new Set();

/**
 * Build the key used by `countryByKey` / `platformByKey` / `appSeries`.
 * @param {string} pubkeyHex
 * @param {{ from: string, to: string }} range
 * @param {string} [appDTag]
 */
function breakdownKey(pubkeyHex, range, appDTag) {
	return `${pubkeyHex}|${range.from}|${range.to}|${appDTag ?? ''}`;
}

/** @param {string} pubkeyHex @param {string} dTag */
function appKey(pubkeyHex, dTag) {
	return `${pubkeyHex.toLowerCase()}|${dTag.toLowerCase()}`;
}

/** Stable identity for the app list — layout passes a new array ref on every liveQuery tick. */
/** @param {StudioApp[]} appList */
function appListSignature(appList) {
	return appList
		.map((a) => String(a.id ?? '').toLowerCase())
		.sort()
		.join('\n');
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
	appSeries = {};
	countryByKey.clear();
	platformByKey.clear();
	appSeriesInFlight.clear();
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
	const appsChanged = appListSignature(nextApps) !== appListSignature(apps);

	if (!pubkeyChanged && !appsChanged) return;

	if (pubkeyChanged) {
		// New developer — drop everything from the previous account.
		impressionsSeries = null;
		downloadsSeries = null;
		zapsSeries = null;
		appSeries = {};
		countryByKey.clear();
		platformByKey.clear();
		appSeriesInFlight.clear();
	}

	pubkey = nextPubkey;
	apps = nextApps;

	loadGen += 1;
	const gen = loadGen;
	const range = buildIsoDateRange(MAX_TIMEFRAME_DAYS);

	// Only show chart loading overlays on first load or account switch — not when
	// liveQuery re-emits the same apps with a new array reference (relay/Dexie writes).
	const showLoadingOverlays = pubkeyChanged || impressionsSeries === null;
	if (showLoadingOverlays) {
		impressionsLoading = true;
		downloadsLoading = true;
		zapsLoading = true;
	}

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
 * Slice the trailing `2*days` of a counts array — the per-app detail page needs
 * two windows back-to-back to compute the prior-period % ticker.
 * @param {number[] | null | undefined} counts
 * @param {number} days
 */
export function slice2x(counts, days) {
	if (!counts || counts.length === 0) return [];
	const span = Math.max(1, 2 * days);
	return counts.length >= span ? counts.slice(-span) : counts;
}

/**
 * Slice the trailing `2*days` from a per-app entry inside a publisher series
 * (the signer's own catalog cache).
 * @param {AppSeries[] | null} series
 * @param {string} appDTag
 * @param {number} days
 */
export function counts2xForApp(series, appDTag, days) {
	if (!series) return [];
	const target = appDTag.toLowerCase();
	const row = series.find((a) => a.id.toLowerCase() === target);
	return row ? slice2x(row.counts ?? [], days) : [];
}

/**
 * Memoised country breakdown. First call for `(pubkey, range, appDTag)` issues the two
 * underlying HTTP requests (impressions + downloads); later calls return the cached rows.
 *
 * @param {string} pubkeyHex
 * @param {{ from: string, to: string }} range
 * @param {string} [appDTag]
 */
export async function getCountryBreakdown(pubkeyHex, range, appDTag) {
	if (!pubkeyHex) return [];
	const key = breakdownKey(pubkeyHex, range, appDTag);
	const cached = countryByKey.get(key);
	if (cached) return cached;
	const promise = loadCountryBreakdown(pubkeyHex, range, 10, appDTag).catch((err) => {
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
 * @param {string} pubkeyHex
 * @param {{ from: string, to: string }} range
 * @param {string} [appDTag]
 */
export async function getPlatformBreakdown(pubkeyHex, range, appDTag) {
	if (!pubkeyHex) return [];
	const key = breakdownKey(pubkeyHex, range, appDTag);
	const cached = platformByKey.get(key);
	if (cached) return cached;
	const promise = loadPlatformBreakdown(pubkeyHex, range, appDTag).catch((err) => {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg !== 'ANALYTICS_HTTP_DISABLED') console.warn('[Studio] platform breakdown failed:', err);
		platformByKey.delete(key);
		return [];
	});
	platformByKey.set(key, promise);
	return promise;
}

/**
 * Reactive accessor for a per-app series entry — used by indexer-access detail pages
 * to read impressions/downloads for an app outside the signer's own catalog.
 *
 * @param {string} pubkeyHex
 * @param {string} dTag
 * @returns {SingleAppSeries | undefined}
 */
export function appSeriesFor(pubkeyHex, dTag) {
	return appSeries[appKey(pubkeyHex, dTag)];
}

/**
 * Fetch the impressions + downloads series for a single app outside the signer's catalog.
 * Idempotent — repeat calls with the same `(pubkey, dTag)` are no-ops once data is cached
 * or a fetch is in flight.
 *
 * @param {string} pubkeyHex
 * @param {string} dTag
 */
export function loadAppSeriesIfNeeded(pubkeyHex, dTag) {
	if (!pubkeyHex || !dTag) return;
	const key = appKey(pubkeyHex, dTag);
	if (appSeries[key] || appSeriesInFlight.has(key)) return;

	appSeriesInFlight.add(key);
	appSeries = { ...appSeries, [key]: { impressions: null, downloads: null, loading: true } };
	const range = buildIsoDateRange(MAX_TIMEFRAME_DAYS);

	void (async () => {
		try {
			const [impRows, dlRows] = await Promise.all([
				fetchImpressions(pubkeyHex, { ...range, groupBy: 'day', appId: dTag }).catch((err) => {
					const msg = err instanceof Error ? err.message : String(err);
					if (msg !== 'ANALYTICS_HTTP_DISABLED') console.warn('[Studio] app impressions failed:', err);
					return [];
				}),
				fetchDownloads(pubkeyHex, { ...range, groupBy: 'day', appId: dTag }).catch((err) => {
					const msg = err instanceof Error ? err.message : String(err);
					if (msg !== 'ANALYTICS_HTTP_DISABLED') console.warn('[Studio] app downloads failed:', err);
					return [];
				})
			]);

			const impressions = pivotDailyCounts(impRows, MAX_TIMEFRAME_DAYS);
			const downloads = pivotDailyCounts(dlRows, MAX_TIMEFRAME_DAYS);

			appSeries = {
				...appSeries,
				[key]: { impressions, downloads, loading: false }
			};
		} finally {
			appSeriesInFlight.delete(key);
			// If the entry was wiped by reset() mid-flight, leave it gone.
			if (appSeries[key]?.loading) {
				appSeries = {
					...appSeries,
					[key]: { ...appSeries[key], loading: false }
				};
			}
		}
	})();
}

/**
 * Pivot rows of `{ day, count }` into a dense `days`-length counts array
 * aligned with the chart X axis (oldest → newest).
 * @param {Array<{ day?: string, count: number }>} rows
 * @param {number} days
 */
function pivotDailyCounts(rows, days) {
	const n = Math.max(1, days);
	const today = new Date();
	const isoDates = Array.from({ length: n }, (_, i) => {
		/* eslint-disable-next-line svelte/prefer-svelte-reactivity */
		const d = new Date(today);
		d.setUTCDate(d.getUTCDate() - (n - 1 - i));
		return d.toISOString().slice(0, 10);
	});
	/** @type {Map<string, number>} */
	/* eslint-disable-next-line svelte/prefer-svelte-reactivity */
	const byDay = new Map();
	for (const row of rows) {
		const day = row.day;
		if (!day) continue;
		const key = day.length > 10 ? day.slice(0, 10) : day;
		byDay.set(key, (byDay.get(key) ?? 0) + (Number(row.count) || 0));
	}
	return isoDates.map((iso) => byDay.get(iso) ?? 0);
}
