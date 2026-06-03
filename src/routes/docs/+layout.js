export const prerender = true;

import { parseDocMarkdown } from '$lib/docs/parse-doc-markdown.js';

const rawModules = import.meta.glob('/src/content/docs/**/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
});

function buildNavigation() {
	const nav = [];
	const folders = {};

	for (const [path, raw] of Object.entries(rawModules)) {
		const rel = path.replace('/src/content/docs/', '').replace('.md', '');
		const parts = rel.split('/');
		const isIndex = parts[parts.length - 1] === '_index';
		const { metadata } = parseDocMarkdown(raw);
		const title = metadata?.title || formatTitle(parts[parts.length - 1] || '');
		const weight = metadata?.weight ?? 999;

		if (parts.length === 1 && !isIndex) {
			nav.push({
				id: `/docs/${rel}`,
				title,
				href: `/docs/${rel}`,
				children: [],
				weight
			});
		} else if (parts.length === 2 && isIndex) {
			const folder = parts[0];
			if (!folder) continue;
			if (!folders[folder]) {
				folders[folder] = {
					id: `/docs/${folder}`,
					title,
					href: `/docs/${folder}`,
					children: [],
					weight
				};
			} else {
				folders[folder].title = title;
				folders[folder].href = `/docs/${folder}`;
				folders[folder].weight = weight;
			}
		} else if (parts.length === 2 && !isIndex) {
			const folder = parts[0];
			if (!folder) continue;
			if (!folders[folder]) {
				folders[folder] = {
					id: `/docs/${folder}`,
					title: formatTitle(folder),
					href: null,
					children: [],
					weight: 999
				};
			}
			folders[folder].children.push({
				id: `/docs/${rel}`,
				title,
				href: `/docs/${rel}`,
				children: [],
				weight
			});
		}
	}

	for (const folder of Object.values(folders)) {
		folder.children.sort(
			(a, b) => (a.weight ?? 999) - (b.weight ?? 999) || a.title.localeCompare(b.title)
		);
		nav.push(folder);
	}

	nav.sort((a, b) => (a.weight ?? 999) - (b.weight ?? 999) || a.title.localeCompare(b.title));
	return nav;
}

function formatTitle(name) {
	if (name === '_index') return 'Overview';
	return name
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

const navigation = buildNavigation();

export function load() {
	return { navigation };
}
