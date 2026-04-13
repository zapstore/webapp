/**
 * Device detection utilities
 */

/**
 * Check if the current device is mobile (phone or tablet)
 */
export function isMobileDevice() {
	if (typeof navigator === 'undefined') return false;
	return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(navigator.userAgent);
}

/**
 * Check if the current device is desktop
 */
export function isDesktopDevice() {
	return !isMobileDevice();
}
