import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { SHOW_STUDIO_SIGNED_IN_DASHBOARD } from '$lib/constants.js';

export const POST_SIGN_IN_HREF = '/studio/insights';

/**
 * Run only after an explicit sign-in action succeeds (modal connect / Sign In button).
 * Do not call from auth hydration, route guards, or $effect on signed-in state.
 *
 * @param {string} [currentPathname] — omit to skip the “already in studio” check
 */
export async function redirectAfterSignInAction(currentPathname) {
	if (!browser || !SHOW_STUDIO_SIGNED_IN_DASHBOARD) return;
	if (currentPathname?.startsWith('/studio')) return;
	await goto(POST_SIGN_IN_HREF, { replaceState: true });
}
