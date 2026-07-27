/**
 * GET /api/download — Same-origin Blossom CDN download proxy for catalog apps.
 *
 * Streams the blob with Content-Disposition so the browser saves a human
 * filename instead of the content-addressed hash. Analytics headers are
 * attached server-side. (Zapstore's own APK uses CDN `/download-latest`.)
 */
import { error } from '@sveltejs/kit';
import { ZAPSTORE_BLOSSOM_DOWNLOAD_HEADERS, ZAPSTORE_BLOSSOM_URL } from '$lib/config.js';

/**
 * @param {string} raw
 * @returns {boolean}
 */
function isAllowedBlossomUrl(raw) {
	try {
		const target = new URL(raw);
		const allowed = new URL(ZAPSTORE_BLOSSOM_URL);
		return target.protocol === 'https:' && target.hostname === allowed.hostname;
	} catch {
		return false;
	}
}

/**
 * @param {string} name
 * @returns {string}
 */
function sanitizeFilename(name) {
	const cleaned = name
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

/**
 * @param {string} filename
 * @returns {string}
 */
function contentDisposition(filename) {
	const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET({ url }) {
	const target = url.searchParams.get('url');
	const filename = sanitizeFilename(url.searchParams.get('filename') || 'download.apk');

	if (!target || !isAllowedBlossomUrl(target)) {
		throw error(400, 'Invalid download URL');
	}

	let upstream;
	try {
		upstream = await fetch(target, { headers: ZAPSTORE_BLOSSOM_DOWNLOAD_HEADERS });
	} catch {
		throw error(502, 'Download failed');
	}

	if (!upstream.ok || !upstream.body) {
		throw error(upstream.status === 404 ? 404 : 502, 'Download failed');
	}

	const headers = new Headers();
	// Force APK type — Firefox is unreliable with application/octet-stream attachments.
	headers.set('Content-Type', 'application/vnd.android.package-archive');
	headers.set('Content-Disposition', contentDisposition(filename));
	headers.set('Cache-Control', 'no-store');
	const length = upstream.headers.get('Content-Length');
	if (length) headers.set('Content-Length', length);

	return new Response(upstream.body, { status: 200, headers });
}
