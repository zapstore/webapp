/**
 * Blossom CDN download helpers.
 *
 * Zapstore's own APK uses CDN `/download-latest` directly — the CDN resolves
 * the latest release, sets Content-Disposition (`zapstore-$v.apk`), exposes
 * version/hash via HEAD headers, and stamps analytics headers server-side.
 *
 * Other apps still use `/api/download` so the browser saves a human filename
 * (never the content hash) with analytics headers attached server-side.
 *
 * Callers should use a real `<a href>` (or location.assign) so the browser
 * starts the download immediately — no fetch→blob wait.
 *
 * The service worker must not intercept `/api/*` (see service-worker.js);
 * Chrome silently drops attachment downloads when a SW handles them as navigations.
 */
import { ZAPSTORE_LATEST_APK_URL } from '$lib/config.js';

/**
 * @typedef {{ version: string, sha256: string, filename: string, bytes: number | null, url: string }} ZapstoreLatestApk
 */

/**
 * Parse CDN `/download-latest` HEAD/GET response headers.
 *
 * @param {Headers} headers
 * @returns {Omit<ZapstoreLatestApk, 'url'>}
 */
export function parseZapstoreLatestHeaders(headers) {
	const version = (headers.get('x-zapstore-version') || '').trim();
	const sha256 = (headers.get('x-zapstore-sha256') || '').trim().toLowerCase();
	const disposition = headers.get('content-disposition') || '';
	const fromDisposition =
		disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)"?/i)?.[1]?.trim() || '';
	const filename = decodeURIComponent(fromDisposition) || (version ? `zapstore-${version}.apk` : '');
	const len = Number(headers.get('content-length'));
	const bytes = Number.isFinite(len) && len > 0 ? len : null;

	if (!version || !/^[a-f0-9]{64}$/.test(sha256) || !filename) {
		throw new Error('Incomplete latest APK metadata');
	}

	return { version, sha256, filename, bytes };
}

/**
 * Resolve latest Zapstore APK version / hash / size via CDN HEAD.
 * Requires Access-Control-Expose-Headers for the X-Zapstore-* fields.
 *
 * @param {AbortSignal} [signal]
 * @returns {Promise<ZapstoreLatestApk>}
 */
export async function fetchZapstoreLatestApk(signal) {
	const response = await fetch(ZAPSTORE_LATEST_APK_URL, { method: 'HEAD', signal });
	if (!response.ok) {
		throw new Error(`Latest APK metadata failed (${response.status})`);
	}
	return { ...parseZapstoreLatestHeaders(response.headers), url: ZAPSTORE_LATEST_APK_URL };
}

/**
 * @param {string} url
 * @param {string} filename
 * @returns {string}
 */
export function blossomDownloadProxyUrl(url, filename) {
	const safeName = sanitizeApkFilename(filename);
	return (
		`/api/download?url=${encodeURIComponent(url)}` +
		`&filename=${encodeURIComponent(safeName)}`
	);
}

/**
 * Trigger an immediate browser download via the proxy URL.
 *
 * @param {string} url
 * @param {string} filename
 */
export function downloadFromBlossomCdn(url, filename) {
	window.location.assign(blossomDownloadProxyUrl(url, filename));
}

/**
 * Build a safe APK filename from an app display name.
 * Never returns a content-hash name.
 *
 * @param {string | null | undefined} name
 * @param {string} [fallback='app']
 * @returns {string}
 */
export function apkFilenameFromName(name, fallback = 'app') {
	return sanitizeApkFilename(name?.trim() || fallback);
}

/**
 * @param {string} name
 * @returns {string}
 */
function sanitizeApkFilename(name) {
	const cleaned = String(name || '')
		.replace(/[/\\?%*:|"<>]/g, '-')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^\.+/, '');
	const base = cleaned.split(/[/\\]/).pop() || '';
	const withoutApk = base.replace(/\.apk$/i, '');
	// Reject content-addressed hashes (64 hex chars).
	if (!withoutApk || /^[a-f0-9]{64}$/i.test(withoutApk)) {
		return 'app.apk';
	}
	return `${withoutApk}.apk`;
}
