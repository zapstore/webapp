import { listBlogPosts } from '$lib/blog/posts.js';

/**
 * Flat blog nav (newest first), same node shape as docs navigation.
 * @returns {{ id: string, title: string, href: string, children: [], weight: number }[]}
 */
export function buildBlogNavigation() {
	return listBlogPosts().map((post) => ({
		id: post.href,
		title: post.title,
		href: post.href,
		children: [],
		weight: post.date ? -new Date(post.date).getTime() : 0
	}));
}
