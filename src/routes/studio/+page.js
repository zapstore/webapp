import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { getIsSignedIn, isAuthInitialized } from '$lib/stores/auth.svelte.js';
import { SHOW_STUDIO_SIGNED_IN_DASHBOARD } from '$lib/constants.js';

/** @type {import('./$types').PageLoad} */
export function load() {
	if (browser && isAuthInitialized()) {
		if (getIsSignedIn() && SHOW_STUDIO_SIGNED_IN_DASHBOARD) {
			throw redirect(302, '/studio/insights');
		}
		throw redirect(302, '/developers');
	}
	return {};
}
