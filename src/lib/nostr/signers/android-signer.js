/**
 * AndroidSigner - NIP-55 implementation for Android signer apps (Amber, etc.)
 * 
 * Uses nostrsigner: URL scheme with callback URLs for web-based signing.
 * The signer app (Amber) handles the actual key management and signing.
 */

import { isAndroidDevice } from '$lib/utils/device.js';

export class AndroidSigner {
	constructor() {
		this.pubkey = null;
		this.signerPackage = null;
		this.callbackHandlers = new Map();
		
		// Set up callback listener
		if (typeof window !== 'undefined') {
			window.addEventListener('nip55-callback', (event) => {
				const { callbackId, result } = event.detail;
				this.handleCallback(callbackId, result);
			});
		}
	}

	/**
	 * Check if Android signer is available (must be on Android)
	 */
	static isAvailable() {
		return isAndroidDevice();
	}

	/**
	 * Get public key (initiates connection with signer app)
	 * Opens the signer app and waits for callback with pubkey
	 */
	async getPublicKey() {
		return new Promise((resolve, reject) => {
			const callbackId = this._generateCallbackId();
			const callbackUrl = this._buildCallbackUrl(callbackId);
			
			// Register callback handler
			this.callbackHandlers.set(callbackId, (result) => {
				if (result.pubkey) {
					this.pubkey = result.pubkey;
					this.signerPackage = result.package;
					resolve(result.pubkey);
				} else {
					reject(new Error('Failed to get public key from signer'));
				}
			});

			// Store return URL for after callback
			if (typeof sessionStorage !== 'undefined') {
				sessionStorage.setItem('nip55_return_url', window.location.pathname);
			}

			// Build nostrsigner URL
			const params = new URLSearchParams({
				compressionType: 'none',
				returnType: 'signature',
				type: 'get_public_key',
				callbackUrl: callbackUrl
			});

			// Redirect to signer app
			window.location.href = `nostrsigner:?${params.toString()}`;

			// Timeout after 60 seconds
			setTimeout(() => {
				if (this.callbackHandlers.has(callbackId)) {
					this.callbackHandlers.delete(callbackId);
					reject(new Error('Signer request timeout'));
				}
			}, 60000);
		});
	}

	/**
	 * Sign an event using the Android signer
	 */
	async signEvent(event) {
		if (!this.pubkey) {
			throw new Error('Not connected to signer. Call getPublicKey() first.');
		}

		return new Promise((resolve, reject) => {
			const callbackId = this._generateCallbackId();
			const callbackUrl = this._buildCallbackUrl(callbackId);
			
			// Register callback handler
			this.callbackHandlers.set(callbackId, (result) => {
				if (result.event) {
					// Full signed event returned
					resolve(result.event);
				} else if (result.signature) {
					// Just signature returned, add to event
					resolve({ ...event, sig: result.signature });
				} else {
					reject(new Error('Failed to sign event'));
				}
			});

			// Store return URL
			if (typeof sessionStorage !== 'undefined') {
				sessionStorage.setItem('nip55_return_url', window.location.pathname);
			}

			// Encode event JSON
			const eventJson = encodeURIComponent(JSON.stringify(event));

			// Build nostrsigner URL
			const params = new URLSearchParams({
				compressionType: 'none',
				returnType: 'event',
				type: 'sign_event',
				callbackUrl: callbackUrl
			});

			// Redirect to signer app
			window.location.href = `nostrsigner:${eventJson}?${params.toString()}`;

			// Timeout after 60 seconds
			setTimeout(() => {
				if (this.callbackHandlers.has(callbackId)) {
					this.callbackHandlers.delete(callbackId);
					reject(new Error('Signer request timeout'));
				}
			}, 60000);
		});
	}

	/**
	 * NIP-04 encryption support
	 */
	get nip04() {
		const self = this;
		return {
			async encrypt(recipientPubkey, plaintext) {
				if (!self.pubkey) {
					throw new Error('Not connected to signer');
				}

				return new Promise((resolve, reject) => {
					const callbackId = self._generateCallbackId();
					const callbackUrl = self._buildCallbackUrl(callbackId);
					
					self.callbackHandlers.set(callbackId, (result) => {
						if (result.result) {
							resolve(result.result);
						} else {
							reject(new Error('Encryption failed'));
						}
					});

					if (typeof sessionStorage !== 'undefined') {
						sessionStorage.setItem('nip55_return_url', window.location.pathname);
					}

					const params = new URLSearchParams({
						pubkey: recipientPubkey,
						compressionType: 'none',
						returnType: 'signature',
						type: 'nip04_encrypt',
						callbackUrl: callbackUrl
					});

					const encoded = encodeURIComponent(plaintext);
					window.location.href = `nostrsigner:${encoded}?${params.toString()}`;

					setTimeout(() => {
						if (self.callbackHandlers.has(callbackId)) {
							self.callbackHandlers.delete(callbackId);
							reject(new Error('Encryption timeout'));
						}
					}, 60000);
				});
			},

			async decrypt(senderPubkey, ciphertext) {
				if (!self.pubkey) {
					throw new Error('Not connected to signer');
				}

				return new Promise((resolve, reject) => {
					const callbackId = self._generateCallbackId();
					const callbackUrl = self._buildCallbackUrl(callbackId);
					
					self.callbackHandlers.set(callbackId, (result) => {
						if (result.result) {
							resolve(result.result);
						} else {
							reject(new Error('Decryption failed'));
						}
					});

					if (typeof sessionStorage !== 'undefined') {
						sessionStorage.setItem('nip55_return_url', window.location.pathname);
					}

					const params = new URLSearchParams({
						pubkey: senderPubkey,
						compressionType: 'none',
						returnType: 'signature',
						type: 'nip04_decrypt',
						callbackUrl: callbackUrl
					});

					const encoded = encodeURIComponent(ciphertext);
					window.location.href = `nostrsigner:${encoded}?${params.toString()}`;

					setTimeout(() => {
						if (self.callbackHandlers.has(callbackId)) {
							self.callbackHandlers.delete(callbackId);
							reject(new Error('Decryption timeout'));
						}
					}, 60000);
				});
			}
		};
	}

	/**
	 * Generate unique callback ID
	 */
	_generateCallbackId() {
		return `nip55_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Build callback URL for this app
	 */
	_buildCallbackUrl(callbackId) {
		if (typeof window === 'undefined') return '';
		const baseUrl = window.location.origin;
		return `${baseUrl}/auth/callback?id=${callbackId}`;
	}

	/**
	 * Handle callback from signer app
	 * Called by the global event listener when signer returns
	 */
	handleCallback(callbackId, data) {
		const handler = this.callbackHandlers.get(callbackId);
		if (handler) {
			this.callbackHandlers.delete(callbackId);
			handler(data);
		}
	}
}

/**
 * Error thrown when Android signer is not available
 */
export class AndroidSignerMissingError extends Error {
	constructor(message = 'Android signer not available on this device') {
		super(message);
		this.name = 'AndroidSignerMissingError';
	}
}
