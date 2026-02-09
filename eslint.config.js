import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import svelteConfig from './svelte.config.js';

/** @type {import('eslint').Linter.Config[]} */
export default [
	js.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			globals: {
				// Browser and Node (SvelteKit) globals – install "globals" and spread globals.browser/node for full set
				window: 'readonly',
				document: 'readonly',
				navigator: 'readonly',
				console: 'readonly',
				Promise: 'readonly',
				Set: 'readonly',
				Map: 'readonly',
				URL: 'readonly',
				URLSearchParams: 'readonly',
				fetch: 'readonly',
				FormData: 'readonly',
				AbortController: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				module: 'readonly',
				require: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
				exports: 'readonly',
				global: 'readonly'
			}
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				extraFileExtensions: ['.svelte'],
				svelteConfig
			}
		}
	},
	{
		ignores: ['.svelte-kit/**', 'build/**', 'node_modules/**', 'static/**']
	}
];
