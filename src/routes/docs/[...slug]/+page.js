import { error } from '@sveltejs/kit';
import { parseDocMarkdown, resolveDocRawPath } from '$lib/docs/parse-doc-markdown.js';

export const prerender = true;

const rawModules = import.meta.glob('/src/content/docs/**/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
});

export function entries() {
	return [{ slug: 'publish' }, { slug: 'trust-model' }];
}

function normalizeSlug(param) {
	if (param === undefined || param === null || param === '') return '';
	const raw =
		typeof param === 'string' ? param : Array.isArray(param) ? param.join('/') : String(param);
	return raw.replace(/\\/g, '/').split('/').filter((s) => s.length > 0).join('/');
}

export function load({ params }) {
	const slug = normalizeSlug(params.slug);
	const targetPath = resolveDocRawPath(slug, rawModules);
	const raw = targetPath ? rawModules[targetPath] : undefined;

	if (!raw) {
		throw error(404, `Documentation page not found: ${slug}`);
	}

	const { metadata, body } = parseDocMarkdown(raw);

	return {
		metadata,
		body
	};
}
