<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

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

		// Dispatch custom event for AndroidSigner to pick up
		if (callbackId && typeof window !== 'undefined') {
			// Store in sessionStorage as backup
			sessionStorage.setItem(`nip55_callback_${callbackId}`, JSON.stringify(result));
			
			// Dispatch event that AndroidSigner is listening for
			window.dispatchEvent(new CustomEvent('nip55-callback', {
				detail: { callbackId, result }
			}));
		}

		// Redirect back to where user came from (or home)
		const returnTo = sessionStorage.getItem('nip55_return_url') || '/';
		sessionStorage.removeItem('nip55_return_url');
		
		// Small delay to ensure event is processed
		setTimeout(() => {
			goto(returnTo);
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
