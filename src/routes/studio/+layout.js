import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { getIsSignedIn, isAuthInitialized } from '$lib/stores/auth.svelte.js';
import { SHOW_STUDIO_SIGNED_IN_DASHBOARD } from '$lib/constants.js';

export const ssr = false;

/** @type {import('./$types').LayoutLoad} */
export async function load() {
	if (browser) {
		// On a direct URL visit or hard refresh, initAuth() (called in the app shell
		// onMount) hasn't run yet — auth state is not yet read from localStorage.
		// Skip the redirect and let the +layout.svelte component guard handle it;
		// that guard correctly waits for isAuthInitialized() before redirecting.
		// On client-side navigation, auth is already initialized so we can redirect immediately.
		if (!isAuthInitialized()) return {};
		if (!getIsSignedIn() || !SHOW_STUDIO_SIGNED_IN_DASHBOARD) {
			throw redirect(302, '/developers');
		}
	}
	return {};
}
