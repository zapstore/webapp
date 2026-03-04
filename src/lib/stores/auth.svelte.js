/**
 * Authentication store
 *
 * Manages user's Nostr identity via NIP-07 extension using applesauce-signers.
 * Persists pubkey across sessions.
 */
import { ExtensionSigner, ExtensionMissingError } from 'applesauce-signers/signers/extension-signer';
const STORAGE_KEY = 'zapstore:pubkey';
// Reactive state
let pubkey = $state(null);
let connecting = $state(false);
let initialized = $state(false);
// Singleton signer instance
let signer = null;
/**
 * Get the ExtensionSigner instance
 */
function getSigner() {
    if (!signer) {
        signer = new ExtensionSigner();
    }
    return signer;
}
/**
 * Get current user's pubkey (null if not signed in)
 */
export function getCurrentPubkey() {
    return pubkey;
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
    if (initialized)
        return;
    if (typeof localStorage !== 'undefined') {
        pubkey = localStorage.getItem(STORAGE_KEY);
    }
    initialized = true;
}
/**
 * Connect using NIP-07 extension via applesauce-signers
 */
export async function connect() {
    if (typeof window === 'undefined') {
        console.warn('[Auth] Window not available');
        return false;
    }
    connecting = true;
    try {
        const s = getSigner();
        const userPubkey = await s.getPublicKey();
        pubkey = userPubkey;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, userPubkey);
        }
        return true;
    }
    catch (err) {
        if (err instanceof ExtensionMissingError) throw err;
        console.error('[Auth] Failed to connect:', err);
        return false;
    }
    finally {
        connecting = false;
    }
}
/**
 * Sign out (clear stored pubkey)
 */
export function signOut() {
    pubkey = null;
    signer = null;
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
    }
}
/**
 * Sign an event using NIP-07 extension
 */
export async function signEvent(event) {
    const s = getSigner();
    return await s.signEvent(event);
}
/**
 * Encrypt a message using NIP-04
 */
export async function encrypt(pubkey, plaintext) {
    const s = getSigner();
    if (!s.nip04) {
        throw new Error('NIP-04 encryption not supported by this signer');
    }
    return await s.nip04.encrypt(pubkey, plaintext);
}
/**
 * Decrypt a message using NIP-04
 */
export async function decrypt(pubkey, ciphertext) {
    const s = getSigner();
    if (!s.nip04) {
        throw new Error('NIP-04 decryption not supported by this signer');
    }
    return await s.nip04.decrypt(pubkey, ciphertext);
}
