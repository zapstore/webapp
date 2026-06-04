import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { parseDocMarkdown } from '$lib/docs/parse-doc-markdown.js';

export const prerender = true;

const rawModules = import.meta.glob('/src/content/blog/**/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
});

export function entries() {
	const slugs = [];
	for (const path of Object.keys(rawModules)) {
		const rel = path.replace('/src/content/blog/', '');
		const parts = rel.split('/');
		if (parts.length === 1) {
			slugs.push({ slug: rel.replace(/\.md$/, '') });
		} else if (parts.length === 2 && parts[1] === '_index.md') {
			slugs.push({ slug: parts[0] ?? '' });
		}
	}
	return slugs;
}

/** @param {import('./$types').PageLoadEvent} event */
export function load({ params }) {
	const slug = params.slug;
	const targetTopLevel = `/src/content/blog/${slug}.md`;
	const targetFolderIndex = `/src/content/blog/${slug}/_index.md`;
	const raw = rawModules[targetTopLevel] || rawModules[targetFolderIndex];

	if (!raw) {
		throw error(404, `Blog post not found: ${slug}`);
	}

	const { metadata, body } = parseDocMarkdown(raw);

	if (!dev && metadata?.draft) {
		throw error(404, `Blog post not found: ${slug}`);
	}

	return { metadata, body };
}
