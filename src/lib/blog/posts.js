import { SITE_URL } from '$lib/config.js';
import { parseDocMarkdown, resolveContentRelativeImages } from '$lib/docs/parse-doc-markdown.js';
import { isLikelyDirectMediaUrl } from '$lib/utils/short-text-parser.js';

/** Hidden from feed, sitemap, and routes until explicitly published. */
const HIDDEN_BLOG_SLUGS = new Set(['looking-for-a-growth-lead']);

/** @param {string} slug @returns {string[]} */
function defaultBlogCardImageCandidates(slug) {
	return [
		`/images/blog/${slug}.png`,
		`/images/blog/${slug}.webp`,
		`/images/blog/${slug}.jpg`,
		`/blog/${slug}/og-image.png`
	];
}

/**
 * @param {string} slug
 * @param {Record<string, string | number | boolean>} metadata
 * @returns {string | null}
 */
export function resolveBlogCardImage(slug, metadata) {
	const fromMeta = metadata?.image ?? metadata?.ogImage ?? metadata?.cover;
	if (typeof fromMeta === 'string' && fromMeta.trim()) {
		const trimmed = fromMeta.trim();
		return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
	}

	const [primary] = defaultBlogCardImageCandidates(slug);
	return primary ?? null;
}

const rawModules = import.meta.glob('/src/content/blog/**/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
});

/** @param {string} path */
function slugFromPath(path) {
	const rel = path.replace('/src/content/blog/', '');
	const parts = rel.split('/');
	if (parts.length === 1) return rel.replace(/\.md$/, '');
	if (parts.length === 2 && parts[1] === '_index.md') return parts[0] ?? '';
	return null;
}

/**
 * Forum posts use ShortTextContent — convert markdown body to that format.
 * @param {string} body
 * @param {string} [origin]
 */
export function prepareBlogBodyForShortText(body, origin = SITE_URL) {
	let text = body;
	text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, _alt, url) => {
		const trimmed = String(url).trim();
		const absolute = trimmed.startsWith('http://') || trimmed.startsWith('https://')
			? trimmed
			: trimmed.startsWith('/')
				? `${origin}${trimmed}`
				: trimmed;
		return `\n${absolute}\n`;
	});
	text = text.replace(/^#{1,6}\s+(.+)$/gm, '$1\n');
	return text.trim();
}

/** @param {string} body @param {string} [origin] */
export function extractBlogMediaUrls(body, origin = SITE_URL) {
	const prepared = prepareBlogBodyForShortText(body, origin);
	return prepared
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => isLikelyDirectMediaUrl(line));
}

/** @param {string} body */
export function extractBlogSummary(body) {
	const paragraph = body
		.split(/\n\n+/)
		.find((block) => {
			const trimmed = block.trim();
			return (
				trimmed &&
				!trimmed.startsWith('![') &&
				!trimmed.startsWith('#') &&
				!trimmed.startsWith('>')
			);
		});

	if (!paragraph) return '';

	return paragraph
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/[*_`>#]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 220);
}

/**
 * @param {Record<string, string | number | boolean>} metadata
 * @param {string} body
 */
function postSummary(metadata, body) {
	const description = metadata?.description;
	if (typeof description === 'string' && description.trim()) return description.trim();
	return extractBlogSummary(body);
}

/** @returns {{ slug: string, title: string, summary: string, date: string | null, href: string, cardImage: string | null }[]} */
export function listBlogPosts() {
	/** @type {{ slug: string, title: string, summary: string, date: string | null, href: string, cardImage: string | null, sortKey: number }[]} */
	const posts = [];

	for (const [path, raw] of Object.entries(rawModules)) {
		const slug = slugFromPath(path);
		if (!slug) continue;

		const { metadata, body } = parseDocMarkdown(raw);
		if (metadata?.draft || HIDDEN_BLOG_SLUGS.has(slug)) continue;

		const date = metadata?.date ? String(metadata.date) : null;
		posts.push({
			slug,
			title: String(metadata?.title || slug),
			summary: postSummary(metadata, body),
			date,
			href: `/community/blog/${slug}`,
			cardImage: resolveBlogCardImage(slug, metadata),
			sortKey: date ? new Date(date).getTime() : 0
		});
	}

	posts.sort((a, b) => b.sortKey - a.sortKey || a.title.localeCompare(b.title));
	return posts.map(({ slug, title, summary, date, href, cardImage }) => ({
		slug,
		title,
		summary,
		date,
		href,
		cardImage
	}));
}

/** @param {string} slug */
export function loadBlogPost(slug) {
	const targetTopLevel = `/src/content/blog/${slug}.md`;
	const targetFolderIndex = `/src/content/blog/${slug}/_index.md`;
	const raw = rawModules[targetTopLevel] || rawModules[targetFolderIndex];

	if (!raw) return null;

	const { metadata, body: rawBody } = parseDocMarkdown(raw);
	if (metadata?.draft || HIDDEN_BLOG_SLUGS.has(slug)) return null;

	const resolvedBody = resolveContentRelativeImages(rawBody, `blog/${slug}`);
	return {
		metadata,
		summary: postSummary(metadata, rawBody),
		body: resolvedBody,
		cardImage: resolveBlogCardImage(slug, metadata),
		shortTextBody: prepareBlogBodyForShortText(resolvedBody),
		mediaUrls: extractBlogMediaUrls(resolvedBody)
	};
}

/** @returns {{ slug: string }[]} */
export function blogPostEntries() {
	return listBlogPosts().map(({ slug }) => ({ slug }));
}
