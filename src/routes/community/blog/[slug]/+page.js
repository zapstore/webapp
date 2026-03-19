import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
export const prerender = true;
// Same as /blog/[slug] — load article from src/content/blog
const modules = import.meta.glob('/src/content/blog/**/*.md', { eager: true });
export function load({ params }) {
	const slug = params.slug;
	const targetTopLevel = `/src/content/blog/${slug}.md`;
	const targetFolderIndex = `/src/content/blog/${slug}/_index.md`;
	const post = modules[targetTopLevel] || modules[targetFolderIndex];
	if (!post) {
		throw error(404, `Blog post not found: ${slug}`);
	}
	if (!dev && post.metadata?.draft) {
		throw error(404, `Blog post not found: ${slug}`);
	}
	return {
		content: post.default,
		metadata: post.metadata || {}
	};
}
