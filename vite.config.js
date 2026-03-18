import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	define: {
		'import.meta.env.APP_VERSION': JSON.stringify(`web/${version}`)
	},

	// Optimize dependencies
	optimizeDeps: {
		include: ['rxjs', 'nostr-tools']
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
