/**
 * Strip protocol and optional trailing slash for user-facing URL display.
 * Links keep full href; use this only for the visible text.
 * @param {string} url
 * @returns {string}
 */
export function stripUrlForDisplay(url) {
	if (!url || typeof url !== 'string') return '';
	const trimmed = url.trim();
	return trimmed
		.replace(/^https?:\/\//i, '')
		.replace(/\/+$/, '');
}
