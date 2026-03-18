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
	build: {
		target: 'esnext',
		minify: 'esbuild'
	},

	// Dev server options
	server: {
		watch: {
			ignored: ['**/build/**']
		}
	}
});
