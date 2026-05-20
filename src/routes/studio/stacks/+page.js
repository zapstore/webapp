import { redirect } from '@sveltejs/kit';

/** Stacks are listed in the sidebar — no standalone page. */
export function load() {
	throw redirect(303, '/studio/insights');
}
