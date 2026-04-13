/**
 * Amber Signer for web apps - NIP-55 implementation
 * 
 * Uses nostrsigner: URL scheme. Amber copies result to clipboard on return.
 * @see https://github.com/nostr-protocol/nips/blob/master/55.md
 */

export class AmberSigner {
	constructor() {
		this.pubkey = null;
		this._pendingResolve = null;
		this._pendingReject = null;
		
		if (typeof document !== 'undefined') {
			this._onVisibilityChange = this._onVisibilityChange.bind(this);
			document.addEventListener('visibilitychange', this._onVisibilityChange);
		}
	}

	static get SUPPORTED() {
		if (typeof navigator === 'undefined') return false;
		return navigator.userAgent.includes('Android') && 
			navigator.clipboard && 
			typeof navigator.clipboard.readText === 'function';
	}

	_onVisibilityChange() {
		if (document.visibilityState === 'visible' && this._pendingResolve) {
			// Small delay to ensure clipboard is ready
			setTimeout(async () => {
				if (!this._pendingResolve) return;
				
				try {
					const result = await navigator.clipboard.readText();
					if (result && result.length > 0) {
						this._pendingResolve(result);
					} else {
						this._pendingReject?.(new Error('Empty clipboard'));
					}
				} catch (err) {
					this._pendingReject?.(err);
				} finally {
					this._pendingResolve = null;
					this._pendingReject = null;
				}
			}, 300);
		}
	}

	async getPublicKey() {
		if (this.pubkey) return this.pubkey;
		
		const result = await this._request('get_public_key');
		
		// Result could be hex pubkey or npub
		if (result.startsWith('npub')) {
			// Decode npub to hex
			const { decode } = await import('nostr-tools/nip19');
			const decoded = decode(result);
			this.pubkey = decoded.data;
		} else {
			this.pubkey = result;
		}
		
		return this.pubkey;
	}

	async signEvent(event) {
		const eventJson = JSON.stringify(event);
		const sig = await this._request('sign_event', eventJson);
		return { ...event, sig };
	}

	get nip04() {
		return {
			encrypt: async (pubkey, plaintext) => {
				return this._request('nip04_encrypt', plaintext, pubkey);
			},
			decrypt: async (pubkey, ciphertext) => {
				return this._request('nip04_decrypt', ciphertext, pubkey);
			}
		};
	}

	get nip44() {
		return {
			encrypt: async (pubkey, plaintext) => {
				return this._request('nip44_encrypt', plaintext, pubkey);
			},
			decrypt: async (pubkey, ciphertext) => {
				return this._request('nip44_decrypt', ciphertext, pubkey);
			}
		};
	}

	async _request(type, content = '', pubkey = '') {
		return new Promise((resolve, reject) => {
			// Clear any pending request
			if (this._pendingReject) {
				this._pendingReject(new Error('Cancelled'));
			}
			
			this._pendingResolve = resolve;
			this._pendingReject = reject;
			
			// Build nostrsigner URL per NIP-55 spec for web apps
			const encoded = content ? encodeURIComponent(content) : '';
			let url = `nostrsigner:${encoded}?compressionType=none&returnType=signature&type=${type}`;
			
			if (pubkey) {
				url += `&pubkey=${pubkey}`;
			}
			
			// No callbackUrl = Amber copies result to clipboard
			
			// Timeout after 60 seconds
			setTimeout(() => {
				if (this._pendingReject) {
					this._pendingReject(new Error('Signer request timeout'));
					this._pendingResolve = null;
					this._pendingReject = null;
				}
			}, 60000);
			
			// Navigate to Amber
			window.location.href = url;
		});
	}

	destroy() {
		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', this._onVisibilityChange);
		}
		this._pendingResolve = null;
		this._pendingReject = null;
	}
}
