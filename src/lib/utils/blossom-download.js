/**
 * Blossom CDN download helpers.
 *
 * Zapstore APK: direct CDN `/download-latest` (HEAD for version/hash/size; GET to save).
 * Other apps: same-origin `/api/download` for human filenames + analytics headers.
 *
 * Prefer `<a href>` / location.assign over fetch→blob. Do not let the service
 * worker intercept `/api/*` (breaks Content-Disposition downloads in Chrome).
 */
import { ZAPSTORE_LATEST_APK_URL } from '$lib/config.js';

/**
 * @typedef {{ version: string, sha256: string, bytes: number | null }} ZapstoreLatestApk
 */

/**
 * @param {Headers} headers
 * @returns {ZapstoreLatestApk}
 */
export function parseZapstoreLatestHeaders(headers) {
	const version = (headers.get('x-zapstore-version') || '').trim();
	const sha256 = (headers.get('x-zapstore-sha256') || '').trim().toLowerCase();
	const len = Number(headers.get('content-length'));
	const bytes = Number.isFinite(len) && len > 0 ? len : null;

	if (!version || !/^[a-f0-9]{64}$/.test(sha256)) {
		throw new Error('Incomplete latest APK metadata');
	}

	return { version, sha256, bytes };
}

/**
 * @param {AbortSignal} [signal]
 * @returns {Promise<ZapstoreLatestApk>}
 */
export async function fetchZapstoreLatestApk(signal) {
	const response = await fetch(ZAPSTORE_LATEST_APK_URL, { method: 'HEAD', signal });
	if (!response.ok) {
		throw new Error(`Latest APK metadata failed (${response.status})`);
	}
	return parseZapstoreLatestHeaders(response.headers);
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
 * @param {string} url
 * @param {string} filename
 */
export function downloadFromBlossomCdn(url, filename) {
	window.location.assign(blossomDownloadProxyUrl(url, filename));
}

/**
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
	if (!withoutApk || /^[a-f0-9]{64}$/i.test(withoutApk)) {
		return 'app.apk';
	}
	return `${withoutApk}.apk`;
}
