/**
 * Device detection utilities
 * 
 * Determines if the user is on desktop or mobile to show appropriate signer options.
 */

/**
 * Check if the current device is mobile (phone or tablet)
 * @returns {boolean} True if mobile device
 */
export function isMobileDevice() {
	if (typeof navigator === 'undefined') return false;
	
	const userAgent = navigator.userAgent.toLowerCase();
	
	// Check for mobile user agents
	const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i;
	
	return mobileRegex.test(userAgent);
}

/**
 * Check if the current device is Android specifically
 * @returns {boolean} True if Android device
 */
export function isAndroidDevice() {
	if (typeof navigator === 'undefined') return false;
	return /android/i.test(navigator.userAgent);
}

/**
 * Check if the current device is iOS
 * @returns {boolean} True if iOS device
 */
export function isIOSDevice() {
	if (typeof navigator === 'undefined') return false;
	return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Check if the current device is desktop
 * @returns {boolean} True if desktop device
 */
export function isDesktopDevice() {
	return !isMobileDevice();
}

/**
 * Get a human-readable device type
 * @returns {'desktop' | 'android' | 'ios' | 'mobile'} Device type
 */
export function getDeviceType() {
	if (isAndroidDevice()) return 'android';
	if (isIOSDevice()) return 'ios';
	if (isMobileDevice()) return 'mobile';
	return 'desktop';
}
