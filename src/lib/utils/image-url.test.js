import { describe, expect, it } from 'vitest';
import { getCdnImageUrl, getProfileCdnUrl } from './image-url.js';

describe('getCdnImageUrl', () => {
	it('adds the requested class to Zapstore CDN URLs', () => {
		expect(getCdnImageUrl('https://cdn.zapstore.dev/file.png', 'icon')).toBe(
			'https://cdn.zapstore.dev/file.png?class=icon'
		);
		expect(getCdnImageUrl('https://cdn.zapstore.dev/file.png', 'iconsm')).toBe(
			'https://cdn.zapstore.dev/file.png?class=iconsm'
		);
	});

	it('preserves existing query parameters', () => {
		expect(getCdnImageUrl('https://cdn.zapstore.dev/file.png?x=1', 'thumbsm')).toBe(
			'https://cdn.zapstore.dev/file.png?x=1&class=thumbsm'
		);
	});

	it('does not transform other hosts or invalid URLs', () => {
		expect(getCdnImageUrl('https://example.com/file.png', 'icon')).toBe(
			'https://example.com/file.png'
		);
		expect(getCdnImageUrl('/file.png', 'icon')).toBe('/file.png');
	});
});

describe('getProfileCdnUrl', () => {
	const pubkey = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c1eb8ce57016d6d';

	it('builds the 256px CDN profile URL', () => {
		expect(getProfileCdnUrl(pubkey)).toBe(`https://cdn.zapstore.dev/p/${pubkey}.webp`);
	});

	it('adds iconsm for tiny avatars', () => {
		expect(getProfileCdnUrl(pubkey, { tiny: true })).toBe(
			`https://cdn.zapstore.dev/p/${pubkey}.webp?class=iconsm`
		);
	});

	it('rejects non-hex and empty pubkeys', () => {
		expect(getProfileCdnUrl(null)).toBeNull();
		expect(getProfileCdnUrl('')).toBeNull();
		expect(getProfileCdnUrl('npub1abc')).toBeNull();
		expect(getProfileCdnUrl('not-a-key')).toBeNull();
	});
});
