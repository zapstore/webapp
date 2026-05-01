import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { getIsSignedIn } from '$lib/stores/auth.svelte.js';
import { SHOW_STUDIO_SIGNED_IN_DASHBOARD } from '$lib/constants.js';

export const ssr = false;

/** @type {import('./$types').LayoutLoad} */
export async function load() {
	if (browser) {
		// Only redirect on client-side navigation (server-side is handled by component onMount)
		const signedIn = getIsSignedIn();
		if (!signedIn || !SHOW_STUDIO_SIGNED_IN_DASHBOARD) {
			throw redirect(302, '/developers');
		}
	}
	return {};
}
