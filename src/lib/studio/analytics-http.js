/**
 * Studio dashboard — Zapstore relay analytics HTTP API (v1, stock relay).
 * All requests go through /api/studio/analytics-http/* (SvelteKit proxy → STUDIO_ANALYTICS_HTTP_URL, no trailing slash).
 *
 * Paths: GET `v1/impressions`, `v1/downloads`, `v1/metrics/relay`, `v1/metrics/blossom`. `from` / `to` inclusive `YYYY-MM-DD`.
 * Studio “By country” chart uses `group_by=country` on impressions (per publisher) and downloads (per blob hash), with its own date range in the UI.
 * Success: `Content-Type: application/json`. Row fields: impressions — `app_id`, `pubkey`, `day`, `source`, `type`, `country`, `count`;
 * downloads — `hash`, `day`, `source`, `country`, `count`.
 *
 * - Impressions: send `pubkey` in the same hex form the relay DB uses (typically 64-char lowercase hex); relay does not normalize.
 * - Downloads: relay reads **`hash` only**; a duplicate `sha256=` query param is ignored — never rely on `sha256` with an empty `hash`.
 * - Empty results: Go may encode a nil slice as JSON `null` instead of `[]` — normalize in `jsonArrayFromWrapper`.
 * - Errors: invalid `group_by` → 400 with **plain text** body (not JSON); `readAnalyticsHttpError` handles both.
 */
import { nip19 } from 'nostr-tools';

/** @typedef {{ app_id?: string, pubkey?: string, day?: string, source?: string, type?: string, country?: string, count: number }} ImpressionRow */
/** @typedef {{ hash?: string, day?: string, source?: string, country?: string, count: number }} DownloadRow */
/** @typedef {{ countryKey: string, label: string, impressions: number, downloads: number }} CountryBreakdownRow */
/** @typedef {{ source: string, label: string, impressions: number, downloads: number }} PlatformBreakdownRow */
/** @typedef {{ day: string, reqs?: number, filters?: number, events?: number }} RelayMetricRow */
/** @typedef {{ day: string, checks?: number, downloads?: number, uploads?: number }} BlossomMetricRow */

const PROXY_PREFIX = '/api/studio/analytics-http';

/** Dedupe dev warning when load re-runs (HMR, strict effects). */
const downloadNoRowsWarned = new Set();

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

/** 64-char hex in URL path */
const SHA256_IN_PATH = /[a-f0-9]{64}/i;

/**
 * @param {string | undefined} urlStr
 * @returns {string | null}
 */
export function extractHashFromUrl(urlStr) {
	if (!urlStr) return null;
	const scan = (/** @type {string} */ s) => {
		const m = s.match(SHA256_IN_PATH);
		return m ? m[0].toLowerCase() : null;
	};
	try {
		const u = new URL(urlStr);
		for (const v of u.searchParams.values()) {
			if (/^[a-f0-9]{64}$/i.test(v)) return v.toLowerCase();
		}
		const fromPath = scan(u.pathname);
		if (fromPath) return fromPath;
	} catch {
		/* fall through */
	}
	return scan(urlStr);
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
	let day = r.day ?? r.date;
	if (typeof day === 'string' && day.length > 10) day = day.slice(0, 10);
	const count = Number(r.count ?? r.total ?? r.downloads ?? r.cnt) || 0;
	const countryRaw = r.country ?? r.country_code ?? r.countryCode;
	const country =
		countryRaw != null && String(countryRaw).trim() !== '' ? String(countryRaw).trim() : undefined;
	const sourceRaw = r.source;
	const source =
		sourceRaw != null && String(sourceRaw).trim() !== '' ? String(sourceRaw).trim() : undefined;
	return { hash, day: typeof day === 'string' ? day : undefined, source, country, count };
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
	const sourceRaw = r.source ?? r.type;
	const source =
		sourceRaw != null && String(sourceRaw).trim() !== '' ? String(sourceRaw).trim() : undefined;
	return {
		app_id: app_id != null ? String(app_id) : undefined,
		pubkey: r.pubkey != null ? String(r.pubkey) : undefined,
		day: typeof day === 'string' ? day : undefined,
		source,
		country,
		count
	};
}

/**
 * Map relay `app_id` to Studio app d-tag (lowercase), e.g. "32267:hex:com.foo" → "com.foo".
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
 * @param {string} subpath e.g. 'v1/impressions'
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
 * @param {string} pubkeyHex
 * @param {{ from: string, to: string, groupBy?: string }} range
 * @returns {Promise<ImpressionRow[]>}
 */
export async function fetchImpressions(pubkeyHex, range) {
	const url = buildProxyUrl('v1/impressions', {
		pubkey: pubkeyHex,
		from: range.from,
		to: range.to,
		group_by: range.groupBy
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
 * @param {string} hash
 * @param {{ from: string, to: string, groupBy?: string }} range
 * @returns {Promise<DownloadRow[]>}
 */
export async function fetchDownloadsForHash(hash, range) {
	const h = hash.toLowerCase();
	// Stock relay: only `hash` is read; do not send sha256= without hash (duplicate sha256 is ignored).
	const url = buildProxyUrl('v1/downloads', {
		hash: h,
		from: range.from,
		to: range.to,
		group_by: range.groupBy
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
 * Map relay impression rows to DownloadChart appData (per-app daily series).
 * Accepts `day` (v1 API) or legacy `date`.
 * @param {Array<{ id: string, name: string, icon: string }>} apps
 * @param {ImpressionRow[]} rows
 * @param {number} days
 */
export function mapImpressionRowsToAppData(apps, rows, days) {
	const n = Math.max(1, days);
	const isoDates = buildIsoDateList(n);
	/** @type {Map<string, Map<string, number>>} */
	const byApp = new Map();
	for (const row of rows) {
		const norm = normalizeImpressionRow(row) ?? row;
		const dtag = norm.app_id ? resolveRowAppIdToDTag(norm.app_id, apps) : null;
		if (!dtag) continue;
		const day = norm.day;
		if (!day) continue;
		const dayKey = day.length > 10 ? day.slice(0, 10) : day;
		if (!byApp.has(dtag)) byApp.set(dtag, new Map());
		const m = byApp.get(dtag);
		m.set(dayKey, (m.get(dayKey) ?? 0) + (Number(norm.count) || 0));
	}

	if (import.meta.env.DEV && rows.length > 0) {
		let sum = 0;
		for (const m of byApp.values()) {
			for (const v of m.values()) sum += v;
		}
		if (sum === 0) {
			const sample = rows[0];
			console.warn(
				'[Studio] Impressions API returned rows but none matched your apps. Check app_id shape vs d-tags. Sample row:',
				sample
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
 * @param {Map<string, string>} hashToAppDTag — lower-case hex hash → app d tag
 * @param {{ from: string, to: string }} range
 * @param {number} days
 */
export async function loadDownloadAppData(apps, hashToAppDTag, range, days) {
	const n = Math.max(1, days);
	const isoDates = buildIsoDateList(n);
	/** @type {Map<string, Map<string, number>>} */
	const byAppDay = new Map();
	const hashes = [...hashToAppDTag.keys()];

	const warnOnce = { analyticsDisabled: false };
	/** @type {{ totalRows: number }} */
	const dlStats = { totalRows: 0 };
	await Promise.all(
		hashes.map(async (hash) => {
			const appDtag = hashToAppDTag.get(hash);
			if (!appDtag) return;
			try {
				const rows = await fetchDownloadsForHash(hash, { ...range, groupBy: 'day' });
				dlStats.totalRows += rows.length;
				let orphan = 0;
				for (const row of rows) {
					const norm = normalizeDownloadRow(row) ?? row;
					let day = norm.day;
					if (typeof day === 'string' && day.length > 10) day = day.slice(0, 10);
					const c = Number(norm.count) || 0;
					if (!day) {
						orphan += c;
						continue;
					}
					const dtagKey = appDtag.toLowerCase();
					if (!byAppDay.has(dtagKey)) byAppDay.set(dtagKey, new Map());
					const m = byAppDay.get(dtagKey);
					m.set(day, (m.get(day) ?? 0) + c);
				}
				if (orphan > 0 && isoDates.length > 0) {
					const last = isoDates[isoDates.length - 1];
					const dtagKey = appDtag.toLowerCase();
					if (!byAppDay.has(dtagKey)) byAppDay.set(dtagKey, new Map());
					const m = byAppDay.get(dtagKey);
					m.set(last, (m.get(last) ?? 0) + orphan);
				}
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				if (msg === 'ANALYTICS_HTTP_DISABLED') {
					if (!warnOnce.analyticsDisabled) {
						warnOnce.analyticsDisabled = true;
						console.warn(
							'[Studio] Analytics HTTP proxy disabled (503). Set STUDIO_ANALYTICS_HTTP_URL in .env for production. Local dev uses http://127.0.0.1:3336 when unset — start the relay analytics server or set the URL explicitly.'
						);
					}
					return;
				}
				console.warn(
					`[Studio] downloads for hash failed (${hash}): ${e instanceof Error ? e.message : String(e)}`
				);
			}
		})
	);

	if (import.meta.env.DEV && hashes.length > 0 && dlStats.totalRows === 0) {
		const dedupeKey = `${hashes.length}:${range.from}:${range.to}`;
		if (!downloadNoRowsWarned.has(dedupeKey)) {
			downloadNoRowsWarned.add(dedupeKey);
			console.warn(
				`[Studio] Download API returned no rows for ${hashes.length} blob hash(es) in range ${range.from} to ${range.to}. Relay keys downloads by the same lowercase SHA-256 as Blossom ingest / kind 1063 x tag; curl one hash from your DB to compare.`
			);
		}
	}

	return apps.map((app) => {
		const dayMap = byAppDay.get(app.id.toLowerCase()) ?? new Map();
		return {
			id: app.id,
			name: app.name,
			icon: app.icon,
			counts: isoDates.map((iso) => dayMap.get(iso) ?? 0)
		};
	});
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
 * Platform breakdown (web / app / unknown) across all apps for the publisher.
 * Impressions: `group_by=source`. Downloads: `group_by=source` per blob hash.
 *
 * @param {string} pubkeyHex
 * @param {{ from: string, to: string }} range
 * @param {Map<string, string>} hashToAppDTag
 * @returns {Promise<PlatformBreakdownRow[]>}
 */
export async function loadPlatformBreakdown(pubkeyHex, range, hashToAppDTag) {
	/** @type {Map<string, number>} */
	const impressionsBy = new Map();
	/** @type {Map<string, number>} */
	const downloadsBy = new Map();

	try {
		const impRows = await fetchImpressions(pubkeyHex, { ...range, groupBy: 'source' });
		for (const row of impRows) {
			const norm = normalizeImpressionRow(row);
			if (!norm) continue;
			const k = sourceBucketKey(norm.source);
			impressionsBy.set(k, (impressionsBy.get(k) ?? 0) + (Number(norm.count) || 0));
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (msg !== 'ANALYTICS_HTTP_DISABLED') console.warn('[Studio] impressions by source failed:', e);
	}

	const hashes = [...hashToAppDTag.keys()];
	await Promise.all(
		hashes.map(async (hash) => {
			if (!hashToAppDTag.get(hash)) return;
			try {
				const rows = await fetchDownloadsForHash(hash, { ...range, groupBy: 'source' });
				for (const row of rows) {
					const norm = normalizeDownloadRow(row);
					if (!norm) continue;
					const k = sourceBucketKey(norm.source);
					downloadsBy.set(k, (downloadsBy.get(k) ?? 0) + (Number(norm.count) || 0));
				}
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				if (msg !== 'ANALYTICS_HTTP_DISABLED')
					console.warn(`[Studio] downloads by source failed (${hash}):`, e);
			}
		})
	);

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
 * Platform breakdown for a single app (d-tag).
 * Impressions: `group_by=app_id,source`. Downloads: only hashes mapped to that app.
 *
 * @param {string} pubkeyHex
 * @param {{ from: string, to: string }} range
 * @param {{ id: string }} app
 * @param {Map<string, string>} hashToAppDTag
 * @returns {Promise<PlatformBreakdownRow[]>}
 */
export async function loadPlatformBreakdownForApp(pubkeyHex, range, app, hashToAppDTag) {
	const apps = [{ id: app.id }];
	const dtagLower = app.id.toLowerCase();

	/** @type {Map<string, number>} */
	const impressionsBy = new Map();
	try {
		const impRows = await fetchImpressions(pubkeyHex, { ...range, groupBy: 'app_id,source' });
		for (const row of impRows) {
			const norm = normalizeImpressionRow(row);
			if (!norm) continue;
			const rowDtag = norm.app_id ? resolveRowAppIdToDTag(norm.app_id, apps) : null;
			if (!rowDtag || rowDtag !== dtagLower) continue;
			const k = sourceBucketKey(norm.source);
			impressionsBy.set(k, (impressionsBy.get(k) ?? 0) + (Number(norm.count) || 0));
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (msg !== 'ANALYTICS_HTTP_DISABLED')
			console.warn('[Studio] impressions by app+source failed:', e);
	}

	/** @type {Map<string, number>} */
	const downloadsBy = new Map();
	const hashes = [...hashToAppDTag.entries()]
		.filter(([, dtag]) => String(dtag).toLowerCase() === dtagLower)
		.map(([h]) => h);

	await Promise.all(
		hashes.map(async (hash) => {
			try {
				const rows = await fetchDownloadsForHash(hash, { ...range, groupBy: 'source' });
				for (const row of rows) {
					const norm = normalizeDownloadRow(row);
					if (!norm) continue;
					const k = sourceBucketKey(norm.source);
					downloadsBy.set(k, (downloadsBy.get(k) ?? 0) + (Number(norm.count) || 0));
				}
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				if (msg !== 'ANALYTICS_HTTP_DISABLED')
					console.warn(`[Studio] downloads by source failed (${hash}):`, e);
			}
		})
	);

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
 * Top countries by impressions + downloads for the publisher in `range`.
 * Requires relay geo; empty rows are normal when country is never set.
 *
 * @param {string} pubkeyHex
 * @param {{ from: string, to: string }} range
 * @param {Map<string, string>} hashToAppDTag
 * @param {number} [topN]
 * @returns {Promise<CountryBreakdownRow[]>}
 */
export async function loadCountryBreakdown(pubkeyHex, range, hashToAppDTag, topN = 10) {
	/** @type {Map<string, number>} */
	const impressionsBy = new Map();
	/** @type {Map<string, number>} */
	const downloadsBy = new Map();

	try {
		const impRows = await fetchImpressions(pubkeyHex, { ...range, groupBy: 'country' });
		for (const row of impRows) {
			const norm = normalizeImpressionRow(row);
			if (!norm) continue;
			const k = countryBucketKey(norm.country);
			impressionsBy.set(k, (impressionsBy.get(k) ?? 0) + (Number(norm.count) || 0));
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (msg !== 'ANALYTICS_HTTP_DISABLED') {
			console.warn('[Studio] v1 impressions by country failed:', e);
		}
	}

	const hashes = [...hashToAppDTag.keys()];
	await Promise.all(
		hashes.map(async (hash) => {
			if (!hashToAppDTag.get(hash)) return;
			try {
				const rows = await fetchDownloadsForHash(hash, { ...range, groupBy: 'country' });
				for (const row of rows) {
					const norm = normalizeDownloadRow(row);
					if (!norm) continue;
					const k = countryBucketKey(norm.country);
					downloadsBy.set(k, (downloadsBy.get(k) ?? 0) + (Number(norm.count) || 0));
				}
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				if (msg !== 'ANALYTICS_HTTP_DISABLED') {
					console.warn(
						`[Studio] downloads by country failed (${hash}): ${e instanceof Error ? e.message : String(e)}`
					);
				}
			}
		})
	);

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
 * Country breakdown for a single app (d-tag): impressions via `group_by=app_id,country`,
 * downloads only for blob hashes mapped to that app.
 *
 * @param {string} pubkeyHex
 * @param {{ from: string, to: string }} range
 * @param {{ id: string }} app
 * @param {Map<string, string>} hashToAppDTag
 * @param {number} [topN]
 * @returns {Promise<CountryBreakdownRow[]>}
 */
export async function loadCountryBreakdownForApp(pubkeyHex, range, app, hashToAppDTag, topN = 10) {
	const apps = [{ id: app.id }];
	const dtagLower = app.id.toLowerCase();

	/** @type {Map<string, number>} */
	const impressionsBy = new Map();
	try {
		const impRows = await fetchImpressions(pubkeyHex, { ...range, groupBy: 'app_id,country' });
		for (const row of impRows) {
			const norm = normalizeImpressionRow(row);
			if (!norm) continue;
			const rowDtag = norm.app_id ? resolveRowAppIdToDTag(norm.app_id, apps) : null;
			if (!rowDtag || rowDtag !== dtagLower) continue;
			const k = countryBucketKey(norm.country);
			impressionsBy.set(k, (impressionsBy.get(k) ?? 0) + (Number(norm.count) || 0));
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (msg !== 'ANALYTICS_HTTP_DISABLED') {
			console.warn('[Studio] v1 impressions by app+country failed:', e);
		}
	}

	/** @type {Map<string, number>} */
	const downloadsBy = new Map();
	const hashes = [...hashToAppDTag.entries()]
		.filter(([, dtag]) => String(dtag).toLowerCase() === dtagLower)
		.map(([h]) => h);

	await Promise.all(
		hashes.map(async (hash) => {
			try {
				const rows = await fetchDownloadsForHash(hash, { ...range, groupBy: 'country' });
				for (const row of rows) {
					const norm = normalizeDownloadRow(row);
					if (!norm) continue;
					const k = countryBucketKey(norm.country);
					downloadsBy.set(k, (downloadsBy.get(k) ?? 0) + (Number(norm.count) || 0));
				}
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				if (msg !== 'ANALYTICS_HTTP_DISABLED') {
					console.warn(
						`[Studio] downloads by country failed (${hash}): ${e instanceof Error ? e.message : String(e)}`
					);
				}
			}
		})
	);

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
