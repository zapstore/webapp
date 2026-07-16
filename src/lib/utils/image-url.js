const CDN_HOST = 'cdn.zapstore.dev';
const HEX_PUBKEY_RE = /^[0-9a-fA-F]{64}$/;

/**
 * Add a CDN image variant only for Zapstore's CDN.
 *
 * @param {string|null|undefined} imageUrl
 * @param {'icon'|'iconsm'|'thumbsm'|'thumblg'} variant
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

/**
 * Zapstore CDN profile picture for a hex pubkey (256px by default).
 *
 * @param {string|null|undefined} pubkey - Hex pubkey
 * @param {{ tiny?: boolean }} [options]
 * @returns {string|null}
 */
export function getProfileCdnUrl(pubkey, { tiny = false } = {}) {
	if (!pubkey || typeof pubkey !== 'string') return null;
	const hex = pubkey.trim();
	if (!HEX_PUBKEY_RE.test(hex)) return null;

	const url = `https://${CDN_HOST}/p/${hex.toLowerCase()}.webp`;
	if (!tiny) return url;
	return getCdnImageUrl(url, 'iconsm') ?? url;
}
