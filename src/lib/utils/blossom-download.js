/**
 * Same-origin Blossom CDN download links.
 *
 * `/api/download` streams the APK with Content-Disposition so the browser
 * saves a human name (e.g. zapstore-1.1.1.apk), never the content hash.
 * Analytics headers are attached server-side.
 *
 * Callers should use a real `<a href>` (or location.assign) so the browser
 * starts the download immediately — no fetch→blob wait.
 *
 * The service worker must not intercept `/api/*` (see service-worker.js);
 * Chrome silently drops attachment downloads when a SW handles them as navigations.
 */

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
