/**
 * Back navigation for Zapstore webapp.
 * When the user landed from outside (external referrer or direct), "back" goes to landing (/) instead of history.back().
 */
import { goto } from '$app/navigation';

const BACK_GOES_HOME_KEY = 'zapstore_back_goes_home';

/**
 * Call once on app load (e.g. layout onMount). Sets a flag so the next back goes to / when the user landed from another origin or with no referrer.
 */
export function setBackGoesHomeIfLandedFromOutside() {
	if (typeof document === 'undefined') return;
	const ref = document.referrer;
	if (!ref) {
		sessionStorage.setItem(BACK_GOES_HOME_KEY, '1');
		return;
	}
	try {
		const refOrigin = new URL(ref).origin;
		if (refOrigin !== window.location.origin) {
			sessionStorage.setItem(BACK_GOES_HOME_KEY, '1');
		}
	} catch {
		sessionStorage.setItem(BACK_GOES_HOME_KEY, '1');
	}
}

/**
 * Call when the user has navigated within the app (client-side). Clears the flag so back uses history again.
 */
export function clearBackGoesHome() {
	try {
		sessionStorage.removeItem(BACK_GOES_HOME_KEY);
	} catch {}
}

/**
 * Run when the back button is clicked. Goes to / if the user landed from outside, otherwise history.back().
 */
export function handleBack() {
	try {
		if (sessionStorage.getItem(BACK_GOES_HOME_KEY)) {
			sessionStorage.removeItem(BACK_GOES_HOME_KEY);
			goto('/');
			return;
		}
	} catch {}
	history.back();
}
