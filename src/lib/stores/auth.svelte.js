/**
 * Authentication store
 *
 * Manages user's Nostr identity via NIP-07 extension (desktop) or NIP-55 Android signer (mobile).
 * Persists pubkey and signer type across sessions.
 */
import { ExtensionSigner, ExtensionMissingError } from 'applesauce-signers/signers/extension-signer';
import { AndroidSigner, AndroidSignerMissingError } from '$lib/nostr/signers/android-signer.js';
import { isDesktopDevice, isAndroidDevice } from '$lib/utils/device.js';

const STORAGE_KEY = 'zapstore:pubkey';
const SIGNER_TYPE_KEY = 'zapstore:signer_type';

// Reactive state
let pubkey = $state(null);
let signerType = $state(null); // 'extension' | 'android'
let connecting = $state(false);
let initialized = $state(false);

// Singleton signer instances
let extensionSigner = null;
let androidSigner = null;

/**
 * Get the appropriate signer instance based on current signer type
 */
function getSigner() {
	if (signerType === 'android') {
		if (!androidSigner) {
			androidSigner = new AndroidSigner();
		}
		return androidSigner;
	} else {
		// Default to extension signer
		if (!extensionSigner) {
			extensionSigner = new ExtensionSigner();
		}
		return extensionSigner;
	}
}
/**
 * Detect which signer types are available on this device
 */
export function getAvailableSigners() {
	const available = [];
	
	// Desktop: check for NIP-07 extension
	if (isDesktopDevice() && typeof window !== 'undefined' && window.nostr) {
		available.push('extension');
	}
	
	// Mobile: check for Android (NIP-55 via Amber)
	if (isAndroidDevice()) {
		available.push('android');
	}
	
	return available;
}

/**
 * Get current user's pubkey (null if not signed in)
 */
export function getCurrentPubkey() {
	return pubkey;
}

/**
 * Get current signer type
 */
export function getSignerType() {
	return signerType;
}

/**
 * Check if a connection attempt is in progress
 */
export function getIsConnecting() {
	return connecting;
}

/**
 * Check if user is signed in
 */
export function getIsSignedIn() {
	return pubkey !== null;
}

/**
 * Initialize auth from localStorage
 */
export function initAuth() {
	if (initialized) return;
	
	if (typeof localStorage !== 'undefined') {
		pubkey = localStorage.getItem(STORAGE_KEY);
		signerType = localStorage.getItem(SIGNER_TYPE_KEY) || 'extension';
	}
	
	initialized = true;
}
/**
 * Connect using NIP-07 extension (desktop)
 */
export async function connectWithExtension() {
	if (typeof window === 'undefined') {
		console.warn('[Auth] Window not available');
		return false;
	}
	
	connecting = true;
	signerType = 'extension';
	
	try {
		extensionSigner = new ExtensionSigner();
		const userPubkey = await extensionSigner.getPublicKey();
		
		pubkey = userPubkey;
		
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, userPubkey);
			localStorage.setItem(SIGNER_TYPE_KEY, 'extension');
		}
		
		return true;
	} catch (err) {
		if (err instanceof ExtensionMissingError) throw err;
		console.error('[Auth] Failed to connect with extension:', err);
		return false;
	} finally {
		connecting = false;
	}
}

/**
 * Connect using NIP-55 Android signer (Amber)
 */
export async function connectWithAndroid() {
	if (typeof window === 'undefined') {
		console.warn('[Auth] Window not available');
		return false;
	}
	
	if (!AndroidSigner.isAvailable()) {
		throw new AndroidSignerMissingError();
	}
	
	connecting = true;
	signerType = 'android';
	
	try {
		androidSigner = new AndroidSigner();
		const userPubkey = await androidSigner.getPublicKey();
		
		pubkey = userPubkey;
		
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, userPubkey);
			localStorage.setItem(SIGNER_TYPE_KEY, 'android');
		}
		
		return true;
	} catch (err) {
		console.error('[Auth] Failed to connect with Android signer:', err);
		throw err;
	} finally {
		connecting = false;
	}
}

/**
 * Legacy connect method - auto-detects appropriate signer
 * Desktop: tries NIP-07 extension
 * Android: tries NIP-55 signer
 */
export async function connect() {
	const available = getAvailableSigners();
	
	if (available.includes('extension')) {
		return await connectWithExtension();
	} else if (available.includes('android')) {
		return await connectWithAndroid();
	} else {
		throw new Error('No signer available on this device');
	}
}
/**
 * Sign out (clear stored pubkey and signer)
 */
export function signOut() {
	pubkey = null;
	signerType = null;
	extensionSigner = null;
	androidSigner = null;
	
	if (typeof localStorage !== 'undefined') {
		localStorage.removeItem(STORAGE_KEY);
		localStorage.removeItem(SIGNER_TYPE_KEY);
	}
}

/**
 * Sign an event using the active signer
 */
export async function signEvent(event) {
	const s = getSigner();
	return await s.signEvent(event);
}

/**
 * Encrypt a message using NIP-04
 */
export async function encrypt(recipientPubkey, plaintext) {
	const s = getSigner();
	if (!s.nip04) {
		throw new Error('NIP-04 encryption not supported by this signer');
	}
	return await s.nip04.encrypt(recipientPubkey, plaintext);
}

/**
 * Decrypt a message using NIP-04
 */
export async function decrypt(senderPubkey, ciphertext) {
	const s = getSigner();
	if (!s.nip04) {
		throw new Error('NIP-04 decryption not supported by this signer');
	}
	return await s.nip04.decrypt(senderPubkey, ciphertext);
}

// Export error classes for consumers
export { ExtensionMissingError, AndroidSignerMissingError };
