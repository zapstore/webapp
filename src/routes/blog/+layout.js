export const prerender = true;

import { buildBlogNavigation } from '$lib/blog/build-navigation.js';

export function load() {
	return { navigation: buildBlogNavigation() };
}
