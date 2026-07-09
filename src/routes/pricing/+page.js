import { redirect } from '@sveltejs/kit';
import { PRICING_ENABLED } from '$lib/config';

export const prerender = PRICING_ENABLED;

/** @type {import('./$types').PageLoad} */
export function load() {
	if (!PRICING_ENABLED) {
		throw redirect(302, '/');
	}
}
