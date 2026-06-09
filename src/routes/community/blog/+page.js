/** SSR so feed cards are in prerendered HTML (parent community layout is client-only). */
export const ssr = true;
export const prerender = true;

import { listBlogPosts } from '$lib/blog/posts.js';

export function load() {
	return { posts: listBlogPosts() };
}
