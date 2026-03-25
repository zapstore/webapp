/**
 * Studio dashboard — Zapstore relay analytics HTTP API (v1).
 * All requests go through /api/studio/analytics-http/* (SvelteKit proxy → STUDIO_ANALYTICS_HTTP_URL, no trailing slash).
 *
 * Contract (relay): GET only. Success: `Content-Type: application/json`, body is a **top-level JSON array** (not `{ data: … }`).
 * - `v1/impressions`: `pubkey` = 64-char hex (lowercase), `from` / `to` = inclusive `YYYY-MM-DD`, `group_by` e.g. `app_id,day`.
 *   Rows: `app_id`, `pubkey`, `day`, `source`, `type`, `country`, `count`. Invalid pubkey / bad `group_by` → 400 + `{ "error": "…" }`.
 * - `v1/downloads`: `hash` **or** `sha256` (aliases; lowercase SHA-256 as Blossom / kind 1063 `x`). We send **`hash` only**.
 *   `from` / `to` inclusive; `group_by=day`. No `/v1/downloads/{sha256}` path. 400 + `{ "error": "…" }` for invalid blob id / bad `group_by`.
 * Empty hash on the relay may mean “all blobs” (admin); Studio always sends a per-blob hash.
 */
import { nip19 } from 'nostr-tools';

/** @typedef {{ app_id?: string, pubkey?: string, day?: string, source?: string, type?: string, country?: string, count: number }} ImpressionRow */
/** @typedef {{ hash?: string, day?: string, source?: string, country?: string, count: number }} DownloadRow */
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
 * @param {unknown} data
 * @returns {unknown[]}
 */
function jsonArrayFromWrapper(data) {
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
	return { hash, day: typeof day === 'string' ? day : undefined, count };
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
	return {
		app_id: app_id != null ? String(app_id) : undefined,
		pubkey: r.pubkey != null ? String(r.pubkey) : undefined,
		day: typeof day === 'string' ? day : undefined,
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
	return /** @type {Promise<RelayMetricRow[]>} */ (res.json());
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
	return /** @type {Promise<BlossomMetricRow[]>} */ (res.json());
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
