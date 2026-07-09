import { describe, expect, it } from 'vitest';
import { parseDocMarkdown } from './parse-doc-markdown.js';

describe('parseDocMarkdown', () => {
	it('parses frontmatter and body', () => {
		const raw = `---
title: Test Doc
weight: 2
---
Hello **world**.`;
		const { metadata, body } = parseDocMarkdown(raw);
		expect(metadata.title).toBe('Test Doc');
		expect(metadata.weight).toBe(2);
		expect(body).toBe('Hello **world**.');
	});
});
