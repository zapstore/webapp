import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],

	// Optimize dependencies
	optimizeDeps: {
		include: ['rxjs', 'nostr-tools', 'highlight.js']
	},

	// Build options
	// Do not mark highlight.js as rollup external: browser dynamic imports must become
	// emitted chunks; bare import("highlight.js/...") fails in prod (Vite dev resolves it).
	build: {
		target: 'esnext',
		minify: 'esbuild'
	},

	// SSR options
	ssr: {
		external: ['highlight.js']
	},

	// Dev server options
	server: {
		watch: {
			ignored: ['**/build/**']
		}
	}
});
