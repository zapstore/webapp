import { redirect } from '@sveltejs/kit';

/** Permanent redirect — /community/migration has moved to /studio/migration. */
export const prerender = false;

export function load() {
	throw redirect(301, '/studio/migration');
}
