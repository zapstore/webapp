/**
 * Online status store
 *
 * Reactive online/offline detection for graceful degradation.
 */

let online = $state(true);
let initialized = false;

/**
 * Initialize online status detection
 * Call once on app start (browser only)
 */
export function initOnlineStatus(): void {
	if (initialized || typeof window === 'undefined') return;

	online = navigator.onLine;

	window.addEventListener('online', () => {
		online = true;
		console.log('[Online] Connection restored');
	});

	window.addEventListener('offline', () => {
		online = false;
		console.log('[Online] Connection lost');
	});

	initialized = true;
}

/**
 * Get current online status
 */
export function isOnline(): boolean {
	return online;
}
