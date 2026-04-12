<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	const STORAGE_KEY = 'zapstore:pubkey';
	const SIGNER_TYPE_KEY = 'zapstore:signer_type';

	onMount(() => {
		// Parse callback parameters from URL
		const params = $page.url.searchParams;
		const callbackId = params.get('id');
		const event = params.get('event');
		const signature = params.get('signature');
		const pubkey = params.get('pubkey');
		const packageName = params.get('package');

		// Build result object from parameters
		const result = {};
		if (event) {
			try {
				result.event = JSON.parse(decodeURIComponent(event));
			} catch (e) {
				console.error('[NIP-55] Failed to parse event:', e);
			}
		}
		if (signature) result.signature = signature;
		if (pubkey) result.pubkey = pubkey;
		if (packageName) result.package = packageName;

		// For authentication callbacks (pubkey present), save directly to localStorage.
		// The original page navigated away when we opened Amber, so saving to localStorage
		// ensures initAuth() will pick up the pubkey when the app reloads.
		if (pubkey) {
			localStorage.setItem(STORAGE_KEY, pubkey);
			localStorage.setItem(SIGNER_TYPE_KEY, 'android');
		}

		// Store callback data in sessionStorage for signing operations
		if (callbackId && typeof window !== 'undefined') {
			sessionStorage.setItem(`nip55_callback_${callbackId}`, JSON.stringify(result));
			
			// Dispatch event for any listeners (signing operations use this)
			window.dispatchEvent(new CustomEvent('nip55-callback', {
				detail: { callbackId, result }
			}));
		}

		// Redirect back to where user came from (or home).
		// Use full page reload (not SvelteKit goto) so initAuth() runs fresh
		// and picks up the pubkey we just saved to localStorage.
		const returnTo = sessionStorage.getItem('nip55_return_url') || '/';
		sessionStorage.removeItem('nip55_return_url');
		
		// Small delay to ensure localStorage is written
		setTimeout(() => {
			window.location.href = returnTo;
		}, 100);
	});
</script>

<div class="callback-container">
	<div class="callback-content">
		<div class="spinner"></div>
		<p class="callback-text">Processing authentication...</p>
	</div>
</div>

<style>
	.callback-container {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background-color: hsl(var(--background));
	}

	.callback-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 32px;
	}

	.callback-text {
		font-size: 1.125rem;
		color: hsl(var(--foreground));
		margin: 0;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid hsl(var(--white16));
		border-top-color: hsl(var(--blurpleColor));
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
