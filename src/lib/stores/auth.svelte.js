/**
 * Authentication store
 *
 * Supports:
 * - NIP-07 browser extension (`ExtensionSigner`)
 * - Nostr Connect / bunker (`NostrConnectSigner` + relay pool)
 *
 * Persists pubkey; for Nostr Connect also persists the bunker URI (contains secrets — same tradeoff as other NC clients).
 */
import { SimplePool } from 'nostr-tools';
import { Observable } from 'rxjs';
import { ExtensionSigner, ExtensionMissingError } from 'applesauce-signers/signers/extension-signer';
import { NostrConnectSigner } from 'applesauce-signers/signers/nostr-connect-signer';
import { EVENT_KINDS } from '$lib/config.js';

const STORAGE_KEY = 'zapstore:pubkey';
const STORAGE_AUTH_MODE = 'zapstore:auth-mode';
const STORAGE_NC_URI = 'zapstore:nostr-connect-uri';

const AUTH_MODE_EXTENSION = 'extension';
const AUTH_MODE_NC = 'nostr-connect';

const NC_HANDSHAKE_TIMEOUT_MS = 30_000;

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, label) {
	let id;
	const timeout = new Promise((_, reject) => {
		id = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(id));
}

/** Kinds the webapp may sign; passed to bunker `connect` permissions. */
const NC_SIGN_KINDS = [
	...new Set([
		...Object.values(EVENT_KINDS),
		3,
		7,
		27235,
		24242
	])
];

// Reactive state
let pubkey = $state(null);
let connecting = $state(false);
let initialized = $state(false);

/** @type {'extension' | 'nostr-connect' | null} */
let currentAuthMode = $state(null);

let extensionSigner = null;
/** @type {import('applesauce-signers/signers/nostr-connect-signer').NostrConnectSigner | null} */
let nostrConnectSigner = null;
/** @type {SimplePool | null} */
let ncPool = null;

/**
 * @param {SimplePool} pool
 * @returns {(relays: string[], filters: import('nostr-tools').Filter[]) => Observable<import('nostr-tools').Event>}
 */
function createSubscriptionMethod(pool) {
	return (relays, filters) => {
		const filter = filters.length === 1 ? filters[0] : filters[0];
		return new Observable((subscriber) => {
			const sub = pool.subscribeMany(relays, filter, {
				onevent: (ev) => subscriber.next(ev),
				onclose: () => subscriber.complete()
			});
			return () => {
				try {
					sub.close();
				} catch {
					/* ignore */
				}
			};
		});
	};
}

/**
 * @param {SimplePool} pool
 * @returns {(relays: string[], event: import('nostr-tools').Event) => Promise<unknown[]>}
 */
function createPublishMethod(pool) {
	return (relays, event) => Promise.all(pool.publish(relays, event));
}

function disposeNostrConnectResources() {
	if (nostrConnectSigner) {
		void nostrConnectSigner.close().catch(() => {});
		nostrConnectSigner = null;
	}
	if (ncPool) {
		try {
			ncPool.destroy();
		} catch {
			/* ignore */
		}
		ncPool = null;
	}
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizeNostrConnectUri(raw) {
	const s = raw.trim();
	if (s.startsWith('nostr+walletconnect://')) {
		return `bunker://${s.slice('nostr+walletconnect://'.length)}`;
	}
	return s;
}

/**
 * @param {string} uri
 */
async function establishNostrConnectSigner(uri) {
	disposeNostrConnectResources();
	const pool = new SimplePool();
	ncPool = pool;
	const permissions = NostrConnectSigner.buildSigningPermissions(NC_SIGN_KINDS);
	try {
		nostrConnectSigner = await withTimeout(
			NostrConnectSigner.fromBunkerURI(uri, {
				subscriptionMethod: createSubscriptionMethod(pool),
				publishMethod: createPublishMethod(pool),
				permissions
			}),
			NC_HANDSHAKE_TIMEOUT_MS,
			'Nostr Connect'
		);
	} catch (err) {
		disposeNostrConnectResources();
		throw err;
	}
	extensionSigner = null;
}

function getSigner() {
	if (currentAuthMode === AUTH_MODE_NC) {
		if (!nostrConnectSigner) {
			throw new Error(
				'Nostr Connect session is not ready yet. Wait a moment after load, or sign in again.'
			);
		}
		return nostrConnectSigner;
	}
	if (!extensionSigner) {
		extensionSigner = new ExtensionSigner();
	}
	return extensionSigner;
}

export function hasExtension() {
	return typeof window !== 'undefined' && !!window.nostr;
}

export function getCurrentPubkey() {
	return pubkey;
}

export function getIsConnecting() {
	return connecting;
}

export function getIsSignedIn() {
	return pubkey !== null;
}

/**
 * @returns {'extension' | 'nostr-connect' | null}
 */
export function getAuthMode() {
	return currentAuthMode;
}

export function initAuth() {
	if (initialized) return;

	if (typeof localStorage !== 'undefined') {
		pubkey = localStorage.getItem(STORAGE_KEY);
		currentAuthMode = localStorage.getItem(STORAGE_AUTH_MODE);
		if (pubkey && !currentAuthMode) {
			currentAuthMode = AUTH_MODE_EXTENSION;
		}
	}

	initialized = true;
}

/**
 * Re-open relay + bunker session after reload when `nostr-connect` was persisted.
 * Call from app shell `onMount` after `initAuth()`.
 */
export async function restoreNostrConnectSession() {
	if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
	if (localStorage.getItem(STORAGE_AUTH_MODE) !== AUTH_MODE_NC) return;
	const uri = localStorage.getItem(STORAGE_NC_URI);
	const storedPk = localStorage.getItem(STORAGE_KEY);
	if (!uri || !storedPk) return;

	connecting = true;
	try {
		const normalized = normalizeNostrConnectUri(uri);
		await establishNostrConnectSigner(normalized);
		const pk = await withTimeout(
			nostrConnectSigner.getPublicKey(),
			NC_HANDSHAKE_TIMEOUT_MS,
			'Nostr Connect pubkey'
		);
		pubkey = pk;
		currentAuthMode = AUTH_MODE_NC;
		if (pk !== storedPk) {
			localStorage.setItem(STORAGE_KEY, pk);
		}
	} catch (err) {
		console.error('[Auth] Nostr Connect restore failed:', err);
		disposeNostrConnectResources();
		pubkey = null;
		currentAuthMode = null;
		localStorage.removeItem(STORAGE_KEY);
		localStorage.removeItem(STORAGE_AUTH_MODE);
		localStorage.removeItem(STORAGE_NC_URI);
	} finally {
		connecting = false;
	}
}

/**
 * Connect using NIP-07 extension
 */
export async function connect() {
	if (typeof window === 'undefined') {
		console.warn('[Auth] Window not available');
		return false;
	}

	connecting = true;

	try {
		disposeNostrConnectResources();
		extensionSigner = new ExtensionSigner();
		const userPubkey = await extensionSigner.getPublicKey();

		pubkey = userPubkey;
		currentAuthMode = AUTH_MODE_EXTENSION;

		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, userPubkey);
			localStorage.setItem(STORAGE_AUTH_MODE, AUTH_MODE_EXTENSION);
			localStorage.removeItem(STORAGE_NC_URI);
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
 * Connect using a bunker:// or nostr+walletconnect:// URI (NIP-46).
 * @param {string} uri
 * @returns {Promise<boolean>}
 */
export async function connectWithNostrConnectUri(uri) {
	if (typeof window === 'undefined') {
		console.warn('[Auth] Window not available');
		return false;
	}

	const normalized = normalizeNostrConnectUri(uri);
	NostrConnectSigner.parseBunkerURI(normalized);

	connecting = true;
	try {
		await establishNostrConnectSigner(normalized);
		const userPubkey = await withTimeout(
			nostrConnectSigner.getPublicKey(),
			NC_HANDSHAKE_TIMEOUT_MS,
			'Nostr Connect pubkey'
		);

		pubkey = userPubkey;
		currentAuthMode = AUTH_MODE_NC;

		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, userPubkey);
			localStorage.setItem(STORAGE_AUTH_MODE, AUTH_MODE_NC);
			localStorage.setItem(STORAGE_NC_URI, normalized);
		}

		return true;
	} catch (err) {
		console.error('[Auth] Nostr Connect failed:', err);
		disposeNostrConnectResources();
		pubkey = null;
		currentAuthMode = null;
		throw err instanceof Error ? err : new Error(String(err));
	} finally {
		connecting = false;
	}
}

export function signOut() {
	disposeNostrConnectResources();
	extensionSigner = null;
	pubkey = null;
	currentAuthMode = null;

	if (typeof localStorage !== 'undefined') {
		localStorage.removeItem(STORAGE_KEY);
		localStorage.removeItem(STORAGE_AUTH_MODE);
		localStorage.removeItem(STORAGE_NC_URI);
	}
}

export async function signEvent(event) {
	const s = getSigner();
	const plain =
		event !== null && typeof event === 'object'
			? /** @type {typeof event} */ (JSON.parse(JSON.stringify(event)))
			: event;
	return await s.signEvent(plain);
}

export async function encrypt(recipientPubkey, plaintext) {
	const s = getSigner();
	if (!s.nip04) {
		throw new Error('NIP-04 encryption not supported by this signer');
	}
	return await s.nip04.encrypt(recipientPubkey, plaintext);
}

export async function decrypt(senderPubkey, ciphertext) {
	const s = getSigner();
	if (!s.nip04) {
		throw new Error('NIP-04 decryption not supported by this signer');
	}
	return await s.nip04.decrypt(senderPubkey, ciphertext);
}

export { ExtensionMissingError };
