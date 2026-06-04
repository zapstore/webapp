import { dev } from '$app/environment';
import { parseDocMarkdown } from '$lib/docs/parse-doc-markdown.js';

const rawModules = import.meta.glob('/src/content/blog/**/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
});

/**
 * Flat blog sidebar nav (newest first), same node shape as docs navigation.
 * @returns {{ id: string, title: string, href: string, children: [], weight: number }[]}
 */
export function buildBlogNavigation() {
	/** @type {{ id: string, title: string, href: string, children: [], weight: number, date: number }[]} */
	const posts = [];

	for (const [path, raw] of Object.entries(rawModules)) {
		const rel = path.replace('/src/content/blog/', '');
		const parts = rel.split('/');
		let slug = '';
		if (parts.length === 1) {
			slug = rel.replace(/\.md$/, '');
		} else if (parts.length === 2 && parts[1] === '_index.md') {
			slug = parts[0] ?? '';
		} else {
			continue;
		}

		const { metadata } = parseDocMarkdown(raw);
		if (!dev && metadata?.draft) continue;

		const title = metadata?.title || slug;
		const date = metadata?.date ? new Date(String(metadata.date)).getTime() : 0;

		posts.push({
			id: `/blog/${slug}`,
			title,
			href: `/blog/${slug}`,
			children: [],
			weight: -date,
			date
		});
	}

	posts.sort((a, b) => b.date - a.date || a.title.localeCompare(b.title));
	return posts.map(({ id, title, href, children, weight }) => ({
		id,
		title,
		href,
		children,
		weight
	}));
}
