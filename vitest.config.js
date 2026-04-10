import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
	plugins: [svelte({ hot: !process.env.VITEST })],
	test: {
		globals: true,
		environment: 'node',
		include: ['src/**/*.test.js'],
	},
	resolve: {
		alias: {
			$lib: '/src/lib',
		},
	},
});
