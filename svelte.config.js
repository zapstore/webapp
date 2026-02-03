import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex, defineMDSveXConfig } from 'mdsvex';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';

// Remark plugin: convert relative markdown image paths to static folder URLs
// Images stored next to markdown files in src/content/ are mirrored in static/
// e.g., src/content/blog/my-post/image.png -> /blog/my-post/image.png
function remarkRelativeImagesToStatic() {
	return (tree, file) => {
		// Get the markdown file's directory relative to src/content
		// mdsvex uses file.filename for the original path
		const filePath = file?.filename || file?.history?.[0] || file?.path || '';
		const contentMatch = filePath.match(/src\/content\/(.+)\/[^/]+\.md$/);
		const contentDir = contentMatch ? contentMatch[1] : '';

		// Visit function to traverse all nodes
		function visit(node) {
			if (!node) return;
			
			// Handle image nodes
			if (node.type === 'image' && typeof node.url === 'string') {
				const url = node.url.trim();
				const isExternal = /^(https?:)?\/\//.test(url);
				const isRootAbsolute = url.startsWith('/');
				if (!isExternal && !isRootAbsolute && contentDir) {
					// Convert relative path to absolute static path
					const cleanUrl = url.replace(/^\.\//, '');
					node.url = `/${contentDir}/${cleanUrl}`;
				}
			}
			
			// Recurse into children
			if (Array.isArray(node.children)) {
				for (const child of node.children) {
					visit(child);
				}
			}
		}
		
		visit(tree);
	};
}

const mdsvexConfig = defineMDSveXConfig({
	extensions: ['.md'],
	smartypants: {
		dashes: 'oldschool'
	},
	remarkPlugins: [remarkGfm, remarkRelativeImagesToStatic],
	rehypePlugins: [rehypeSlug],
	highlight: {
		highlighter: async (code, lang = 'text') => {
			const { codeToHtml } = await import('shiki');
			const html = await codeToHtml(code, {
				lang,
				theme: 'github-dark'
			});
			return `{@html \`${html}\` }`;
		}
	}
});

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: ['.svelte', ...mdsvexConfig.extensions],
	preprocess: [vitePreprocess(), mdsvex(mdsvexConfig)],

	kit: {
		// Static adapter for platform-agnostic deployment
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html', // SPA fallback for client-side routing
			precompress: true,
			strict: true
		}),

		alias: {
			$lib: './src/lib',
			$components: './src/lib/components',
			$stores: './src/lib/stores',
			$nostr: './src/lib/nostr'
		}
	}
};

export default config;
