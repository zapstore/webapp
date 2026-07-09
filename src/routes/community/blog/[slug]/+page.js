import { error } from '@sveltejs/kit';
import { blogPostEntries, loadBlogPost } from '$lib/blog/posts.js';

/** SSR so article HTML and meta are prerendered (parent community layout is client-only). */
export const ssr = true;
export const prerender = true;

export function entries() {
	return blogPostEntries();
}

/** @param {import('./$types').PageLoadEvent} event */
export function load({ params }) {
	const slug = params.slug;
	const post = loadBlogPost(slug);

	if (!post) {
		throw error(404, `Blog post not found: ${slug}`);
	}

	return post;
}
