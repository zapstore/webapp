/**
 * Shared helpers for GET/HEAD /download-latest.
 * Server-only — do not import from client code.
 */
import {
	ZAPSTORE_BLOSSOM_DOWNLOAD_HEADERS,
	ZAPSTORE_BLOSSOM_URL
} from '$lib/config.js';

/**
 * Allowed: https://zapstore.dev, https://*.zapstore.dev, localhost / 127.0.0.1.
 *
 * @param {string} origin
 * @returns {boolean}
 */
export function allowedCORSOrigin(origin) {
	let u;
	try {
		u = new URL(origin);
	} catch {
		return false;
	}
	if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.host) {
		return false;
	}
	const host = u.hostname;
	if (host === 'localhost' || host === '127.0.0.1') {
		return true;
	}
	if (u.protocol !== 'https:') {
		return false;
	}
	return host === 'zapstore.dev' || host.endsWith('.zapstore.dev');
}

/**
 * @param {string} version
 * @param {string} hash
 * @returns {Headers}
 */
export function latestApkHeaders(version, hash) {
	const headers = new Headers();
	headers.set('Content-Disposition', `attachment; filename="zapstore-${version}.apk"`);
	headers.set('X-Zapstore-Version', version);
	headers.set('X-Zapstore-Sha256', hash);
	headers.set(
		'Access-Control-Expose-Headers',
		'Content-Disposition, Content-Length, X-Zapstore-Version, X-Zapstore-Sha256'
	);
	headers.set('Content-Type', 'application/vnd.android.package-archive');
	headers.set('Cache-Control', 'no-store');
	return headers;
}

/**
 * @param {Headers} headers
 * @param {string | null} origin
 */
export function applyDownloadLatestCORS(headers, origin) {
	if (origin && allowedCORSOrigin(origin)) {
		headers.set('Access-Control-Allow-Origin', origin);
		headers.set('Vary', 'Origin');
	} else {
		headers.delete('Access-Control-Allow-Origin');
	}
}

/**
 * @param {string} hash
 * @returns {string}
 */
export function blossomBlobUrl(hash) {
	return `${ZAPSTORE_BLOSSOM_URL}/${hash}`;
}

/**
 * Upstream fetch headers for the actual APK bytes (analytics attribution).
 * @returns {Record<string, string>}
 */
export function blossomInstallHeaders() {
	return { ...ZAPSTORE_BLOSSOM_DOWNLOAD_HEADERS };
}
