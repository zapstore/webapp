import { describe, expect, it } from 'vitest';
import { htmlToPlainText, buildCommunityFaqJsonLd } from './community-faq-seo.js';

describe('community-faq-seo', () => {
	it('strips HTML for schema text', () => {
		const plain = htmlToPlainText(
			'<p>Hello <strong>world</strong>.</p><p>Second <a href="/x">link</a>.</p>'
		);
		expect(plain).toContain('Hello world.');
		expect(plain).toContain('Second link.');
		expect(plain).not.toContain('<');
	});

	it('builds FAQPage JSON-LD', () => {
		const sections = [
			{
				id: 'test',
				label: 'Test',
				items: [{ id: 'one', question: 'Q1?', answer: '<p>A1</p>' }]
			}
		];
		const json = buildCommunityFaqJsonLd(sections, 'https://zapstore.dev/community/faq');
		expect(json['@type']).toBe('FAQPage');
		expect(json.mainEntity).toHaveLength(1);
		expect(json.mainEntity[0].name).toBe('Q1?');
		expect(json.mainEntity[0].acceptedAnswer.text).toBe('A1');
	});
});
