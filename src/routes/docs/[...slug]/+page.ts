import { error } from '@sveltejs/kit';
import type { Component } from 'svelte';

interface DocModule {
	default: Component;
	metadata?: {
		title?: string;
		description?: string;
	};
}

// Eager load all docs at build time - instant lookups
const modules = import.meta.glob<DocModule>('/src/content/docs/**/*.md', { eager: true });

export function load({ params }: { params: { slug: string } }) {
	const slug = params.slug ? (Array.isArray(params.slug) ? params.slug.join('/') : params.slug) : '';

	let targetPath: string | undefined;
	if (!slug) {
		// Root docs page - try _index.md first, then fallback to other files
		const indexPath = '/src/content/docs/_index.md';
		if (modules[indexPath]) {
			targetPath = indexPath;
		} else {
			// Fallback to first available file
			const availablePaths = Object.keys(modules);
			targetPath = availablePaths.find((path) => path.includes('_index.md')) || availablePaths[0];
		}
	} else {
		// Try different possible paths
		const possiblePaths = [`/src/content/docs/${slug}.md`, `/src/content/docs/${slug}/_index.md`];

		// Find the first existing path
		targetPath = possiblePaths.find((path) => modules[path]);
	}

	const post = targetPath ? modules[targetPath] : undefined;
	if (!post) {
		throw error(404, `Documentation page not found: ${slug}`);
	}

	return {
		content: post.default,
		metadata: post.metadata || {}
	};
}
