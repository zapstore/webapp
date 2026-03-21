import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import svelteConfig from './svelte.config.js';

/** @type {import('eslint').Linter.Config[]} */
export default [
	js.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		},
		rules: {
			// App does not use onNavigate/resolve() view-transition pattern; rule is a false positive here
			'svelte/no-navigation-without-resolve': 'off',
			// Allow intentionally-unused variables/args/caught-errors when prefixed with _
			'no-unused-vars': ['error', {
				varsIgnorePattern: '^_',
				argsIgnorePattern: '^_',
				caughtErrorsIgnorePattern: '^_'
			}]
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
		files: ['src/service-worker.js'],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.serviceworker
			}
		}
	},
	{
		ignores: ['.svelte-kit/**', 'build/**', 'node_modules/**', 'static/**']
	}
];
