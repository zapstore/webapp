/**
 * Studio dashboard — Zapstore relay analytics HTTP API (v1, stock relay).
 * All requests go through /api/studio/analytics-http/* (SvelteKit proxy → STUDIO_ANALYTICS_HTTP_URL, no trailing slash).
 *
 * Paths: GET `v1/app/impressions`, `v1/app/downloads`, `v1/metrics/relay`, `v1/metrics/blossom`.
 * `from` / `to` inclusive `YYYY-MM-DD`.
 *
 * Impressions and downloads are precomputed per `app_pubkey` + `app_id`: a single
 * publisher-level request returns all rows for the dashboard. Per-app filtering is
 * server-side via `app_id`. Country / platform breakdowns request `group_by=country_code`
 * or `group_by=source` directly — no blob-hash enumeration on the client.
 *
 * Success: `Content-Type: application/json`. Row fields:
 *   impressions — `app_id`, `app_pubkey`, `app_version`, `day`, `source`, `type`, `country_code`, `count`
 *   downloads   — `hash`, `app_id`, `app_pubkey`, `app_version`, `day`, `source`, `type`, `country_code`, `count`
 *
 * Notes:
 * - Empty results: Go may encode a nil slice as JSON `null` instead of `[]` — normalised in `jsonArrayFromWrapper`.
 * - Errors: invalid `group_by` → 400 with **plain text** body (not JSON); `readAnalyticsHttpError` handles both.
 */
import { nip19 } from 'nostr-tools';

/** @typedef {{ app_id?: string, pubkey?: string, app_version?: string, day?: string, source?: string, type?: string, country?: string, count: number }} ImpressionRow */
/** @typedef {{ hash?: string, app_id?: string, pubkey?: string, app_version?: string, day?: string, source?: string, type?: string, country?: string, count: number }} DownloadRow */
/** @typedef {{ countryKey: string, label: string, impressions: number, downloads: number }} CountryBreakdownRow */
/** @typedef {{ source: string, label: string, impressions: number, downloads: number }} PlatformBreakdownRow */
/** @typedef {{ day: string, reqs?: number, filters?: number, events?: number }} RelayMetricRow */
/** @typedef {{ day: string, checks?: number, downloads?: number, uploads?: number }} BlossomMetricRow */

const PROXY_PREFIX = '/api/studio/analytics-http';

/**
 * @param {Response} res
 */
async function readAnalyticsHttpError(res) {
	const raw = await res.text().catch(() => '');
	try {
		const j = JSON.parse(raw);
		if (j && typeof j === 'object' && typeof j.error === 'string' && j.error.trim()) return j.error.trim();
	} catch {
		/* not JSON */
	}
	return raw.trim() || res.statusText;
}

/**
 * Decode npub to hex pubkey, or pass through 64-char hex (lowercased).
 * @param {string} pubkeyOrNpub
 * @returns {string}
 */
export function npubToHex(pubkeyOrNpub) {
	const s = String(pubkeyOrNpub).trim();
	if (/^[a-f0-9]{64}$/i.test(s)) return s.toLowerCase();
	if (s.startsWith('npub1')) {
		const decoded = nip19.decode(s);
		if (decoded.type !== 'npub') throw new Error('Expected npub');
		return /** @type {string} */ (decoded.data).toLowerCase();
	}
	throw new Error('Invalid pubkey or npub');
}

/** @param {string} label */
export function timeframeToDays(label) {
	switch (label) {
		case '7 Days':
			return 7;
		case '30 Days':
			return 30;
		case '90 Days':
			return 90;
		case '1 Year':
			return 365;
		default:
			return 30;
	}
}

/** Maximum supported timeframe — used as the cache range for per-publisher series. */
export const MAX_TIMEFRAME_DAYS = 365;

/**
 * Inclusive ISO date range ending today (UTC calendar days).
 * @param {number} days
 * @returns {{ from: string, to: string }}
 */
export function buildIsoDateRange(days) {
	const today = new Date();
	const to = today.toISOString().slice(0, 10);
	const start = new Date(today);
	start.setUTCDate(start.getUTCDate() - (days - 1));
	const from = start.toISOString().slice(0, 10);
	return { from, to };
}

/**
 * Top-level JSON body from the relay may be `[]`, `{ rows: … }`, or **`null`** (Go nil slice).
 * @param {unknown} data
 * @returns {unknown[]}
 */
function jsonArrayFromWrapper(data) {
	if (data == null) return [];
	if (Array.isArray(data)) return data;
	if (data && typeof data === 'object') {
		const o = /** @type {Record<string, unknown>} */ (data);
		if (Array.isArray(o.rows)) return o.rows;
		if (Array.isArray(o.data)) return o.data;
		if (Array.isArray(o.results)) return o.results;
	}
	return [];
}

/**
 * @param {unknown} row
 * @returns {DownloadRow | null}
 */
function normalizeDownloadRow(row) {
	if (!row || typeof row !== 'object') return null;
	const r = /** @type {Record<string, unknown>} */ (row);
	const hash = typeof r.hash === 'string' ? r.hash : undefined;
	const app_id = r.app_id ?? r.appId ?? r.appID;
	let day = r.day ?? r.date;
	if (typeof day === 'string' && day.length > 10) day = day.slice(0, 10);
	const count = Number(r.count ?? r.total ?? r.downloads ?? r.cnt) || 0;
	const countryRaw = r.country ?? r.country_code ?? r.countryCode;
	const country =
		countryRaw != null && String(countryRaw).trim() !== '' ? String(countryRaw).trim() : undefined;
	const sourceRaw = r.source;
	const source =
		sourceRaw != null && String(sourceRaw).trim() !== '' ? String(sourceRaw).trim() : undefined;
	const typeRaw = r.type;
	const type =
		typeRaw != null && String(typeRaw).trim() !== '' ? String(typeRaw).trim() : undefined;
	return {
		hash,
		app_id: app_id != null ? String(app_id) : undefined,
		pubkey: r.app_pubkey != null ? String(r.app_pubkey) : (r.pubkey != null ? String(r.pubkey) : undefined),
		app_version: r.app_version != null ? String(r.app_version) : undefined,
		day: typeof day === 'string' ? day : undefined,
		source,
		type,
		country,
		count
	};
}

async function parseDownloadsResponse(res) {
	const data = await res.json();
	const raw = jsonArrayFromWrapper(data);
	if (raw.length > 0) {
		return /** @type {DownloadRow[]} */ (raw.map(normalizeDownloadRow).filter(Boolean));
	}
	if (data && typeof data === 'object' && data.count != null && !Array.isArray(data)) {
		const d = /** @type {Record<string, unknown>} */ (data);
		const one = normalizeDownloadRow(d);
		return one ? [one] : [];
	}
	return [];
}

/**
 * @param {unknown} row
 * @returns {ImpressionRow | null}
 */
function normalizeImpressionRow(row) {
	if (!row || typeof row !== 'object') return null;
	const r = /** @type {Record<string, unknown>} */ (row);
	const app_id = r.app_id ?? r.appId ?? r.appID;
	let day = r.day ?? r.date;
	if (typeof day === 'string' && day.length > 10) day = day.slice(0, 10);
	const count = Number(r.count ?? r.total ?? r.impressions ?? r.cnt) || 0;
	const countryRaw = r.country ?? r.country_code ?? r.countryCode;
	const country =
		countryRaw != null && String(countryRaw).trim() !== '' ? String(countryRaw).trim() : undefined;
	const sourceRaw = r.source;
	const source =
		sourceRaw != null && String(sourceRaw).trim() !== '' ? String(sourceRaw).trim() : undefined;
	const typeRaw = r.type;
	const type =
		typeRaw != null && String(typeRaw).trim() !== '' ? String(typeRaw).trim() : undefined;
	return {
		app_id: app_id != null ? String(app_id) : undefined,
		pubkey: r.app_pubkey != null ? String(r.app_pubkey) : (r.pubkey != null ? String(r.pubkey) : undefined),
		app_version: r.app_version != null ? String(r.app_version) : undefined,
		day: typeof day === 'string' ? day : undefined,
		source,
		type,
		country,
		count
	};
}

/**
 * Map relay `app_id` to Studio app d-tag (lowercase), e.g. "32267:hex:com.foo" → "com.foo".
 * The new API returns the bare d-tag, but the suffix-stripping path is kept defensively.
 * @param {string} rowAppId
 * @param {Array<{ id: string }>} apps
 * @returns {string | null}
 */
function resolveRowAppIdToDTag(rowAppId, apps) {
	const raw = String(rowAppId ?? '').trim();
	if (!raw) return null;
	const lower = raw.toLowerCase();
	const dtags = new Set(apps.map((a) => a.id.toLowerCase()));
	if (dtags.has(lower)) return lower;
	const colon = lower.lastIndexOf(':');
	if (colon >= 0) {
		const suffix = lower.slice(colon + 1);
		if (dtags.has(suffix)) return suffix;
	}
	return null;
}

async function parseImpressionsResponse(res) {
	const data = await res.json();
	return /** @type {ImpressionRow[]} */ (
		jsonArrayFromWrapper(data).map(normalizeImpressionRow).filter(Boolean)
	);
}

/**
 * @param {string} subpath e.g. 'v1/app/impressions'
 * @param {Record<string, string | undefined>} query
 */
function buildProxyUrl(subpath, query) {
	const q = new URLSearchParams();
	for (const [k, v] of Object.entries(query)) {
		if (v !== undefined && v !== '') q.set(k, v);
	}
	const qs = q.toString();
	return `${PROXY_PREFIX}/${subpath}${qs ? `?${qs}` : ''}`;
}

/**
 * Fetch impressions. Server-side filters via `appId`, `appPubkey`, `type`; aggregation via `groupBy`.
 *
 * @param {string} pubkeyHex
 * @param {{ from: string, to: string, groupBy?: string, appId?: string, type?: string }} opts
 * @returns {Promise<ImpressionRow[]>}
 */
export async function fetchImpressions(pubkeyHex, opts) {
	const url = buildProxyUrl('v1/app/impressions', {
		// Always restrict to detail-page impressions; other types exist (search, list) but
		// the dashboard only graphs detail views.
		type: opts.type ?? 'detail',
		app_pubkey: pubkeyHex,
		app_id: opts.appId,
		from: opts.from,
		to: opts.to,
		group_by: opts.groupBy
	});
	const res = await fetch(url);
	if (res.status === 503) throw new Error('ANALYTICS_HTTP_DISABLED');
	if (!res.ok) {
		const errMsg = await readAnalyticsHttpError(res);
		throw new Error(`impressions ${res.status}: ${errMsg}`);
	}
	return parseImpressionsResponse(res);
}

/**
 * Fetch downloads. Server-side filters via `appId`, `appPubkey`, `type` (`install` / `update`);
 * aggregation via `groupBy`. Replaces the per-hash request fan-out used previously.
 *
 * @param {string} pubkeyHex
 * @param {{ from: string, to: string, groupBy?: string, appId?: string, type?: string }} opts
 * @returns {Promise<DownloadRow[]>}
 */
export async function fetchDownloads(pubkeyHex, opts) {
	const url = buildProxyUrl('v1/app/downloads', {
		app_pubkey: pubkeyHex,
		app_id: opts.appId,
		type: opts.type,
		from: opts.from,
		to: opts.to,
		group_by: opts.groupBy
	});
	const res = await fetch(url);
	if (res.status === 503) throw new Error('ANALYTICS_HTTP_DISABLED');
	if (!res.ok) {
		const errMsg = await readAnalyticsHttpError(res);
		throw new Error(`downloads ${res.status}: ${errMsg}`);
	}
	return parseDownloadsResponse(res);
}

/**
 * @param {{ from: string, to: string }} range
 * @returns {Promise<RelayMetricRow[]>}
 */
export async function fetchRelayMetrics(range) {
	const url = buildProxyUrl('v1/metrics/relay', { from: range.from, to: range.to });
	const res = await fetch(url);
	if (res.status === 503) throw new Error('ANALYTICS_HTTP_DISABLED');
	if (!res.ok) {
		const errMsg = await readAnalyticsHttpError(res);
		throw new Error(`relay metrics ${res.status}: ${errMsg}`);
	}
	const data = await res.json();
	return /** @type {RelayMetricRow[]} */ (jsonArrayFromWrapper(data));
}

/**
 * @param {{ from: string, to: string }} range
 * @returns {Promise<BlossomMetricRow[]>}
 */
export async function fetchBlossomMetrics(range) {
	const url = buildProxyUrl('v1/metrics/blossom', { from: range.from, to: range.to });
	const res = await fetch(url);
	if (res.status === 503) throw new Error('ANALYTICS_HTTP_DISABLED');
	if (!res.ok) {
		const errMsg = await readAnalyticsHttpError(res);
		throw new Error(`blossom metrics ${res.status}: ${errMsg}`);
	}
	const data = await res.json();
	return /** @type {BlossomMetricRow[]} */ (jsonArrayFromWrapper(data));
}

/**
 * Last N UTC calendar days as YYYY-MM-DD (same order as chart X axis).
 * @param {number} days
 * @returns {string[]}
 */
export function buildIsoDateList(days) {
	const n = Math.max(1, days);
	const today = new Date();
	return Array.from({ length: n }, (_, i) => {
		const d = new Date(today);
		d.setUTCDate(d.getUTCDate() - (n - 1 - i));
		return d.toISOString().slice(0, 10);
	});
}

/**
 * Pivot impression rows (`group_by=app_id,day`) into per-app daily series.
 * @param {Array<{ id: string, name: string, icon: string }>} apps
 * @param {ImpressionRow[]} rows
 * @param {number} days
 */
export function mapImpressionRowsToAppData(apps, rows, days) {
	return mapRowsToAppData(apps, rows, days);
}

/**
 * Pivot download rows (`group_by=app_id,day`) into per-app daily series.
 * @param {Array<{ id: string, name: string, icon: string }>} apps
 * @param {DownloadRow[]} rows
 * @param {number} days
 */
export function mapDownloadRowsToAppData(apps, rows, days) {
	return mapRowsToAppData(apps, rows, days);
}

/**
 * Shared pivot used by both impressions and downloads — both row shapes carry `app_id`,
 * `day`, and `count` after normalisation, so a single implementation suffices.
 * @param {Array<{ id: string, name: string, icon: string }>} apps
 * @param {Array<{ app_id?: string, day?: string, count: number }>} rows
 * @param {number} days
 */
function mapRowsToAppData(apps, rows, days) {
	const n = Math.max(1, days);
	const isoDates = buildIsoDateList(n);
	/** @type {Map<string, Map<string, number>>} */
	const byApp = new Map();
	for (const row of rows) {
		const dtag = row.app_id ? resolveRowAppIdToDTag(row.app_id, apps) : null;
		if (!dtag) continue;
		const day = row.day;
		if (!day) continue;
		const dayKey = day.length > 10 ? day.slice(0, 10) : day;
		if (!byApp.has(dtag)) byApp.set(dtag, new Map());
		const m = byApp.get(dtag);
		m.set(dayKey, (m.get(dayKey) ?? 0) + (Number(row.count) || 0));
	}

	if (import.meta.env.DEV && rows.length > 0) {
		let sum = 0;
		for (const m of byApp.values()) {
			for (const v of m.values()) sum += v;
		}
		if (sum === 0) {
			console.warn(
				'[Studio] Analytics API returned rows but none matched your apps. Check app_id shape vs d-tags. Sample row:',
				rows[0]
			);
		}
	}

	return apps.map((app) => {
		const dayMap = byApp.get(app.id.toLowerCase()) ?? new Map();
		return {
			id: app.id,
			name: app.name,
			icon: app.icon,
			counts: isoDates.map((iso) => dayMap.get(iso) ?? 0)
		};
	});
}

/**
 * Per-publisher impressions series: one HTTP request, pivoted into Studio's chart shape.
 *
 * @param {string} pubkeyHex
 * @param {Array<{ id: string, name: string, icon: string }>} apps
 * @param {{ from: string, to: string }} range
 * @param {number} days
 */
export async function loadImpressionAppData(pubkeyHex, apps, range, days) {
	const rows = await fetchImpressions(pubkeyHex, { ...range, groupBy: 'app_id,day' });
	return mapImpressionRowsToAppData(apps, rows, days);
}

/**
 * Per-publisher downloads series: one HTTP request, pivoted into Studio's chart shape.
 * Replaces the previous per-blob-hash fan-out + collect-blob-hashes machinery entirely.
 *
 * @param {string} pubkeyHex
 * @param {Array<{ id: string, name: string, icon: string }>} apps
 * @param {{ from: string, to: string }} range
 * @param {number} days
 */
export async function loadDownloadAppData(pubkeyHex, apps, range, days) {
	const rows = await fetchDownloads(pubkeyHex, { ...range, groupBy: 'app_id,day' });
	return mapDownloadRowsToAppData(apps, rows, days);
}

// ============================================================================
// Platform breakdown helpers
// ============================================================================

const KNOWN_SOURCES = ['web', 'app'];

/** @param {string} source */
function platformLabel(source) {
	switch (String(source ?? '').toLowerCase()) {
		case 'web': return 'Web';
		case 'app': return 'App';
		default: return 'Unknown';
	}
}

/** Lower = earlier in sorted list. */
function platformOrder(source) {
	switch (String(source ?? '').toLowerCase()) {
		case 'app': return 0;
		case 'web': return 1;
		default: return 2;
	}
}

/** Normalise any raw source value to a canonical bucket key. */
function sourceBucketKey(raw) {
	const s = String(raw ?? '').trim().toLowerCase();
	return KNOWN_SOURCES.includes(s) ? s : 'unknown';
}

/**
 * Platform breakdown (web / app / unknown) across all apps for the publisher,
 * or scoped to a single app when `appDTag` is provided. Two HTTP requests total.
 *
 * @param {string} pubkeyHex
 * @param {{ from: string, to: string }} range
 * @param {string} [appDTag] — when set, restricts both requests to a single app via `app_id`.
 * @returns {Promise<PlatformBreakdownRow[]>}
 */
export async function loadPlatformBreakdown(pubkeyHex, range, appDTag) {
	/** @type {Map<string, number>} */
	const impressionsBy = new Map();
	/** @type {Map<string, number>} */
	const downloadsBy = new Map();

	const [impRows, dlRows] = await Promise.all([
		fetchImpressions(pubkeyHex, { ...range, groupBy: 'source', appId: appDTag }).catch((e) => {
			const msg = e instanceof Error ? e.message : String(e);
			if (msg !== 'ANALYTICS_HTTP_DISABLED') console.warn('[Studio] impressions by source failed:', e);
			return /** @type {ImpressionRow[]} */ ([]);
		}),
		fetchDownloads(pubkeyHex, { ...range, groupBy: 'source', appId: appDTag }).catch((e) => {
			const msg = e instanceof Error ? e.message : String(e);
			if (msg !== 'ANALYTICS_HTTP_DISABLED') console.warn('[Studio] downloads by source failed:', e);
			return /** @type {DownloadRow[]} */ ([]);
		})
	]);

	for (const row of impRows) {
		const k = sourceBucketKey(row.source);
		impressionsBy.set(k, (impressionsBy.get(k) ?? 0) + (Number(row.count) || 0));
	}
	for (const row of dlRows) {
		const k = sourceBucketKey(row.source);
		downloadsBy.set(k, (downloadsBy.get(k) ?? 0) + (Number(row.count) || 0));
	}

	const keys = new Set([...impressionsBy.keys(), ...downloadsBy.keys()]);
	/** @type {PlatformBreakdownRow[]} */
	const combined = [...keys]
		.map((source) => ({
			source,
			label: platformLabel(source),
			impressions: impressionsBy.get(source) ?? 0,
			downloads: downloadsBy.get(source) ?? 0
		}))
		.filter((r) => r.impressions > 0 || r.downloads > 0);
	combined.sort(
		(a, b) =>
			b.downloads - a.downloads ||
			b.impressions - a.impressions ||
			platformOrder(a.source) - platformOrder(b.source)
	);
	return combined;
}

/**
 * Platform breakdown for a single app — thin wrapper for clarity at call sites.
 * @param {string} pubkeyHex
 * @param {{ from: string, to: string }} range
 * @param {string} appDTag
 */
export function loadPlatformBreakdownForApp(pubkeyHex, range, appDTag) {
	return loadPlatformBreakdown(pubkeyHex, range, appDTag);
}

// ============================================================================
// Country breakdown helpers
// ============================================================================

const UNKNOWN_COUNTRY = '__unknown__';

/** @param {string | undefined} raw */
function countryBucketKey(raw) {
	const s = String(raw ?? '').trim();
	return s || UNKNOWN_COUNTRY;
}

/** @param {string} key */
function countryLabel(key) {
	if (key === UNKNOWN_COUNTRY) return 'Unknown';
	if (typeof Intl !== 'undefined' && /^[A-Za-z]{2}$/.test(key)) {
		try {
			const dn = new Intl.DisplayNames(['en'], { type: 'region' });
			return dn.of(key.toUpperCase()) ?? key;
		} catch {
			return key;
		}
	}
	return key;
}

/**
 * Top countries by impressions + downloads for the publisher in `range`,
 * or scoped to a single app when `appDTag` is provided. Two HTTP requests total.
 *
 * @param {string} pubkeyHex
 * @param {{ from: string, to: string }} range
 * @param {number} [topN]
 * @param {string} [appDTag] — when set, restricts both requests to a single app via `app_id`.
 * @returns {Promise<CountryBreakdownRow[]>}
 */
export async function loadCountryBreakdown(pubkeyHex, range, topN = 10, appDTag) {
	/** @type {Map<string, number>} */
	const impressionsBy = new Map();
	/** @type {Map<string, number>} */
	const downloadsBy = new Map();

	const [impRows, dlRows] = await Promise.all([
		fetchImpressions(pubkeyHex, { ...range, groupBy: 'country_code', appId: appDTag }).catch((e) => {
			const msg = e instanceof Error ? e.message : String(e);
			if (msg !== 'ANALYTICS_HTTP_DISABLED') {
				console.warn('[Studio] impressions by country failed:', e);
			}
			return /** @type {ImpressionRow[]} */ ([]);
		}),
		fetchDownloads(pubkeyHex, { ...range, groupBy: 'country_code', appId: appDTag }).catch((e) => {
			const msg = e instanceof Error ? e.message : String(e);
			if (msg !== 'ANALYTICS_HTTP_DISABLED') {
				console.warn('[Studio] downloads by country failed:', e);
			}
			return /** @type {DownloadRow[]} */ ([]);
		})
	]);

	for (const row of impRows) {
		const k = countryBucketKey(row.country);
		impressionsBy.set(k, (impressionsBy.get(k) ?? 0) + (Number(row.count) || 0));
	}
	for (const row of dlRows) {
		const k = countryBucketKey(row.country);
		downloadsBy.set(k, (downloadsBy.get(k) ?? 0) + (Number(row.count) || 0));
	}

	const keys = new Set([...impressionsBy.keys(), ...downloadsBy.keys()]);
	/** @type {CountryBreakdownRow[]} */
	const combined = [...keys]
		.map((countryKey) => ({
			countryKey,
			label: countryLabel(countryKey),
			impressions: impressionsBy.get(countryKey) ?? 0,
			downloads: downloadsBy.get(countryKey) ?? 0
		}))
		.filter((r) => r.impressions > 0 || r.downloads > 0);
	combined.sort((a, b) => b.downloads - a.downloads || b.impressions - a.impressions);
	return combined.slice(0, topN);
}

/**
 * Country breakdown for a single app — thin wrapper for clarity at call sites.
 * @param {string} pubkeyHex
 * @param {{ from: string, to: string }} range
 * @param {string} appDTag
 * @param {number} [topN]
 */
export function loadCountryBreakdownForApp(pubkeyHex, range, appDTag, topN = 10) {
	return loadCountryBreakdown(pubkeyHex, range, topN, appDTag);
}
