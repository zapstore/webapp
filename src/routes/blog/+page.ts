import { dev } from '$app/environment';

export const prerender = true;

interface PostModule {
	metadata?: {
		title?: string;
		date?: string;
		draft?: boolean;
		description?: string;
		category?: string;
	};
}

interface Post {
	meta: PostModule['metadata'];
	path: string;
}

// Eager load all blog posts at build time - instant lookups
const modules = import.meta.glob<PostModule>('/src/content/blog/**/*.md', { eager: true });

export function load(): { posts: Post[] } {
	const posts: Post[] = [];

	for (const [path, mod] of Object.entries(modules)) {
		// Keep: /src/content/blog/<name>.md
		// Keep: /src/content/blog/<folder>/_index.md
		const rel = path.replace('/src/content/blog/', '');
		const parts = rel.split('/');

		if (parts.length === 1) {
			// top-level file
			posts.push({
				meta: mod.metadata || {},
				path: rel.replace(/\.md$/, '')
			});
		} else if (parts.length === 2 && parts[1] === '_index.md') {
			// folder index
			posts.push({
				meta: mod.metadata || {},
				path: parts[0] ?? ''
			});
		}
	}

	// Filter out draft posts in production
	const filteredPosts = dev ? posts : posts.filter((post) => !post.meta?.draft);

	// Sort by date (newest first)
	const sortedPosts = filteredPosts.sort((a, b) => {
		const ad = a.meta?.date ? new Date(a.meta.date).getTime() : 0;
		const bd = b.meta?.date ? new Date(b.meta.date).getTime() : 0;
		return bd - ad;
	});

	return { posts: sortedPosts };
}
