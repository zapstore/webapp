import { describe, expect, it } from 'vitest';
import { getCdnImageUrl } from './image-url.js';

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
