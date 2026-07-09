import { headingAnchorId } from '$lib/utils/markdown.js';

export { headingAnchorId };

/** @param {import('marked').Token[]} tokens */
export function collectMarkdownImageUrls(tokens) {
	/** @type {string[]} */
	const urls = [];
	walkTokens(tokens, urls);
	return urls;
}

/** @param {import('marked').Token[]} tokens @param {string[]} urls */
function walkTokens(tokens, urls) {
	for (const token of tokens) {
		if (token.type === 'image' && token.href) {
			urls.push(token.href);
		}
		if (token.tokens?.length) walkTokens(token.tokens, urls);
		if (token.type === 'list' && token.items) {
			for (const item of token.items) {
				if (item.tokens?.length) walkTokens(item.tokens, urls);
			}
		}
		if (token.type === 'table') {
			for (const cell of token.header ?? []) {
				if (cell.tokens?.length) walkTokens(cell.tokens, urls);
			}
			for (const row of token.rows ?? []) {
				for (const cell of row) {
					if (cell.tokens?.length) walkTokens(cell.tokens, urls);
				}
			}
		}
	}
}
