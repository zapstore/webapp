import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { Component } from 'svelte';

export const prerender = true;

interface PostModule {
	default: Component;
	metadata?: {
		title?: string;
		description?: string;
		author?: string;
		date?: string;
		draft?: boolean;
	};
}

// Eager load all blog posts at build time - instant lookups
const modules = import.meta.glob<PostModule>('/src/content/blog/**/*.md', { eager: true });

export function load({ params }: { params: { slug: string } }) {
	const slug = params.slug;

	// Support top-level files `slug.md` and folder `_index.md` at `slug/_index.md`
	const targetTopLevel = `/src/content/blog/${slug}.md`;
	const targetFolderIndex = `/src/content/blog/${slug}/_index.md`;

	const post = modules[targetTopLevel] || modules[targetFolderIndex];
	if (!post) {
		throw error(404, `Blog post not found: ${slug}`);
	}

	// Block access to draft posts in production
	if (!dev && post.metadata?.draft) {
		throw error(404, `Blog post not found: ${slug}`);
	}

	return {
		content: post.default,
		metadata: post.metadata || {}
	};
}
