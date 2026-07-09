import { error, redirect } from '@sveltejs/kit';
import { blogPostEntries, loadBlogPost } from '$lib/blog/posts.js';

export const prerender = true;

export function entries() {
	return blogPostEntries();
}

/** @param {import('./$types').PageLoadEvent} event */
export function load({ params }) {
	const slug = params.slug;
	if (!loadBlogPost(slug)) {
		throw error(404, `Blog post not found: ${slug}`);
	}
	throw redirect(308, `/community/blog/${slug}`);
}
