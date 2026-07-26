/**
 * Download a file from the Blossom CDN with Zapstore analytics headers.
 *
 * Goes through the same-origin `/api/download` proxy so:
 * - analytics headers are attached server-side
 * - the browser saves a human filename (never the CDN content hash)
 *
 * Uses fetch → blob → object URL (not a navigation). Navigating to the proxy
 * is broken while a service worker handles the request as a document load
 * (Accept: text/html): Chrome drops Content-Disposition: attachment with no UI.
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
 * @param {string} url
 * @param {string} filename
 * @returns {Promise<void>}
 */
export async function downloadFromBlossomCdn(url, filename) {
	const safeName = sanitizeApkFilename(filename);
	const proxyUrl = blossomDownloadProxyUrl(url, safeName);

	const response = await fetch(proxyUrl);
	if (!response.ok) {
		throw new Error(`Download failed (${response.status})`);
	}

	const blob = await response.blob();
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = objectUrl;
	anchor.download = safeName;
	anchor.rel = 'noopener';
	document.body.appendChild(anchor);
	anchor.click();

	// Keep the node/URL alive until the browser has started the save.
	setTimeout(() => {
		URL.revokeObjectURL(objectUrl);
		anchor.remove();
	}, 2000);
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
