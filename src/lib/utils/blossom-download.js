import { ZAPSTORE_BLOSSOM_DOWNLOAD_HEADERS } from '$lib/config.js';

/**
 * Download a file from the Blossom CDN with Zapstore analytics headers.
 * Falls back to navigation if fetch fails — browsers cannot attach custom headers on navigation.
 *
 * @param {string} url
 * @param {string} filename
 */
export async function downloadFromBlossomCdn(url, filename) {
	try {
		const response = await fetch(url, { headers: ZAPSTORE_BLOSSOM_DOWNLOAD_HEADERS });
		const blob = await response.blob();
		const objectUrl = window.URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = objectUrl;
		anchor.download = filename;
		document.body.appendChild(anchor);
		anchor.click();
		window.URL.revokeObjectURL(objectUrl);
		document.body.removeChild(anchor);
	} catch {
		window.location.href = url;
	}
}
