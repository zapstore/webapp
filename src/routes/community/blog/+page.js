import { dev } from '$app/environment';
export const prerender = true;
// Same as /blog — eager load all blog posts from content
const modules = import.meta.glob('/src/content/blog/**/*.md', { eager: true });
export function load() {
	const posts = [];
	for (const [path, mod] of Object.entries(modules)) {
		const rel = path.replace('/src/content/blog/', '');
		const parts = rel.split('/');
		if (parts.length === 1) {
			posts.push({
				meta: mod.metadata || {},
				path: rel.replace(/\.md$/, '')
			});
		} else if (parts.length === 2 && parts[1] === '_index.md') {
			posts.push({
				meta: mod.metadata || {},
				path: parts[0] ?? ''
			});
		}
	}
	const filteredPosts = dev ? posts : posts.filter((post) => !post.meta?.draft);
	const sortedPosts = filteredPosts.sort((a, b) => {
		const ad = a.meta?.date ? new Date(a.meta.date).getTime() : 0;
		const bd = b.meta?.date ? new Date(b.meta.date).getTime() : 0;
		return bd - ad;
	});
	return { posts: sortedPosts };
}
