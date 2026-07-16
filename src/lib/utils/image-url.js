const CDN_HOST = 'cdn.zapstore.dev';

/**
 * Add a CDN image variant only for Zapstore's CDN.
 *
 * @param {string|null|undefined} imageUrl
 * @param {'icon'|'thumbsm'|'thumblg'} variant
 * @returns {string|null|undefined}
 */
export function getCdnImageUrl(imageUrl, variant) {
	if (!imageUrl) return imageUrl;

	try {
		const url = new URL(imageUrl);
		if (url.hostname !== CDN_HOST) return imageUrl;
		url.searchParams.set('class', variant);
		return url.toString();
	} catch {
		return imageUrl;
	}
}
