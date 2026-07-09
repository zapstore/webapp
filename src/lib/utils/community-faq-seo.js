/**
 * SEO helpers for /community/faq (FAQPage JSON-LD, plain-text answers).
 */

/** @typedef {import('$lib/data/community-faq-content.js').COMMUNITY_FAQ_SECTIONS extends infer T ? T : never} FaqSections */

/**
 * Strip HTML to plain text for schema.org Answer.text (no markup).
 * @param {string} html
 */
export function htmlToPlainText(html) {
	return html
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>/gi, '\n\n')
		.replace(/<\/li>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/**
 * @param {FaqSections} sections
 * @param {string} pageUrl
 */
export function buildCommunityFaqJsonLd(sections, pageUrl) {
	/** @type {Array<{ '@type': 'Question', name: string, acceptedAnswer: { '@type': 'Answer', text: string } }>} */
	const mainEntity = [];

	for (const section of sections) {
		for (const item of section.items) {
			mainEntity.push({
				'@type': 'Question',
				name: item.question,
				acceptedAnswer: {
					'@type': 'Answer',
					text: htmlToPlainText(item.answer)
				}
			});
		}
	}

	return {
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		url: pageUrl,
		mainEntity
	};
}
