import { describe, expect, it } from 'vitest';
import { parseRelease } from './models.js';
import { renderMarkdown } from '../utils/markdown.js';

/**
 * Kind 30063 release event as published by BTC Map for 1.2.0
 * (id f929b7ff…52d2c5 on relay.zapstore.dev). The event `content` is markdown.
 */
const BTC_MAP_RELEASE_1_2_0 = {
	id: 'f929b7ff5497d8338ae5653c9831337797dc142f85814272bc85ba450352d2c5',
	pubkey: '3eab247c63bb35dfa38e07ca102f6da28ba9b9d4687197743bde3a2b1d80aeed',
	kind: 30063,
	created_at: 1759296000,
	content:
		'See the [changelog](https://github.com/teambtcmap/btcmap-android/blob/master/CHANGELOG.md) for details.',
	tags: [
		['d', 'org.btcmap@1.2.0'],
		['i', 'org.btcmap'],
		['a', '32267:3eab247c63bb35dfa38e07ca102f6da28ba9b9d4687197743bde3a2b1d80aeed:org.btcmap'],
		['version', '1.2.0']
	]
};

/** @param {string} content */
function releaseWithContent(content) {
	return { ...BTC_MAP_RELEASE_1_2_0, content };
}

describe('parseRelease notesHtml', () => {
	it('renders a markdown link as an anchor that opens in a new tab', () => {
		const { notesHtml } = parseRelease(BTC_MAP_RELEASE_1_2_0);
		expect(notesHtml).toContain('<a ');
		expect(notesHtml).toContain(
			'href="https://github.com/teambtcmap/btcmap-android/blob/master/CHANGELOG.md"'
		);
		expect(notesHtml).toContain('>changelog</a>');
		expect(notesHtml).toContain('target="_blank"');
		expect(notesHtml).toContain('rel="noopener noreferrer"');
		// The raw markdown must not survive as literal text.
		expect(notesHtml).not.toContain('](http');
	});

	it('goes through the shared markdown renderer', () => {
		const { notesHtml } = parseRelease(BTC_MAP_RELEASE_1_2_0);
		expect(notesHtml).toBe(renderMarkdown(BTC_MAP_RELEASE_1_2_0.content));
	});

	it('escapes plain text instead of passing remote HTML through', () => {
		const { notesHtml } = parseRelease(releaseWithContent('a < b and c > d'));
		expect(notesHtml).toContain('&lt;');
		expect(notesHtml).not.toContain('< b');
	});

	it('strips script tags from remote content', () => {
		const { notesHtml } = parseRelease(releaseWithContent('Try <script>alert("xss")</script> here'));
		expect(notesHtml).not.toContain('<script');
		expect(notesHtml).not.toContain('alert(');
	});

	it('strips event handler attributes from remote content', () => {
		const { notesHtml } = parseRelease(releaseWithContent('Try <img src=x onerror="alert(1)"> here'));
		expect(notesHtml).not.toMatch(/\son[a-z]+\s*=/i);
	});

	it('neutralises javascript: links', () => {
		const { notesHtml } = parseRelease(releaseWithContent('[click](javascript:alert(1))'));
		expect(notesHtml).not.toContain('javascript:');
	});

	it('keeps the raw notes for the single-line panel preview', () => {
		const parsed = parseRelease(BTC_MAP_RELEASE_1_2_0);
		expect(parsed.notes).toBe(BTC_MAP_RELEASE_1_2_0.content);
		expect(parsed.releaseNotes).toBe(BTC_MAP_RELEASE_1_2_0.content);
	});

	it('leaves notesHtml undefined when the release has no content', () => {
		const { notesHtml } = parseRelease(releaseWithContent(''));
		expect(notesHtml).toBeUndefined();
	});
});
