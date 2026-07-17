/**
 * Download a file from the Blossom CDN with Zapstore analytics headers.
 *
 * Uses a same-origin proxy so the browser starts the download immediately and
 * saves a human filename (never the content-addressed hash from the CDN URL).
 *
 * @param {string} url
 * @param {string} filename
 */
export function downloadFromBlossomCdn(url, filename) {
	const safeName = sanitizeApkFilename(filename);
	const proxyUrl =
		`/api/download?url=${encodeURIComponent(url)}` +
		`&filename=${encodeURIComponent(safeName)}`;

	const anchor = document.createElement('a');
	anchor.href = proxyUrl;
	anchor.download = safeName;
	anchor.rel = 'noopener';
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
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
