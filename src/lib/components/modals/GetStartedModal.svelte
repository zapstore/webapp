<script lang="js">
	import Modal from '$lib/components/common/Modal.svelte';
	import { Nostr } from '$lib/components/icons';
	import { connect, getAvailableSigners, ExtensionMissingError, AndroidSignerMissingError } from '$lib/stores/auth.svelte.js';
	import { isDesktopDevice, isAndroidDevice } from '$lib/utils/device.js';
	import { SITE_URL } from '$lib/config';

	const PRIMAL_APP_URL = `${SITE_URL}/apps/net.primal.android`;
	const AMBER_DOWNLOAD_URL = 'https://github.com/greenart7c3/Amber/releases';

	let { open = $bindable(false), onconnected } = $props();
	let isConnecting = $state(false);
	let error = $state(null);
	
	// Device and signer availability
	const isDesktop = $derived(isDesktopDevice());
	const isAndroid = $derived(isAndroidDevice());
	const availableSigners = $derived(getAvailableSigners());
	const hasAnySigner = $derived(availableSigners.length > 0);
	const hasExtension = $derived(availableSigners.includes('extension'));
	const canUseAndroid = $derived(availableSigners.includes('android'));

	$effect(() => {
		if (!open) {
			error = null;
		}
	});

	async function handleConnect() {
		isConnecting = true;
		error = null;
		try {
			const success = await connect();
			if (success) {
				open = false;
				onconnected?.();
			} else {
				error = 'Failed to connect to signer';
			}
		} catch (err) {
			if (err instanceof ExtensionMissingError) {
				error = 'Browser extension not found';
			} else if (err instanceof AndroidSignerMissingError) {
				error = 'Android signer not available';
			} else {
				error = err instanceof Error ? err.message : 'Failed to connect to signer';
			}
		} finally {
			isConnecting = false;
		}
	}
</script>

<Modal bind:open ariaLabel="Sign in to Zapstore">
	<div class="modal-content">
		<!-- Logo -->
		<div class="logo-container pt-4">
			<svg
				width="80"
				height="80"
				viewBox="0 0 19 32"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				class="logo"
			>
				<path
					d="M18.8379 13.9711L8.84956 0.356086C8.30464 -0.386684 7.10438 0.128479 7.30103 1.02073L9.04686 8.94232C9.16268 9.46783 8.74887 9.96266 8.19641 9.9593L0.871032 9.91477C0.194934 9.91066 -0.223975 10.6293 0.126748 11.1916L7.69743 23.3297C7.99957 23.8141 7.73264 24.4447 7.16744 24.5816L5.40958 25.0076C4.70199 25.179 4.51727 26.0734 5.10186 26.4974L12.4572 31.8326C12.9554 32.194 13.6711 31.9411 13.8147 31.3529L15.8505 23.0152C16.0137 22.3465 15.3281 21.7801 14.6762 22.0452L13.0661 22.7001C12.5619 22.9052 11.991 22.6092 11.8849 22.0877L10.7521 16.5224C10.6486 16.014 11.038 15.5365 11.5704 15.5188L18.1639 15.2998C18.8529 15.2769 19.2383 14.517 18.8379 13.9711Z"
					fill="hsl(var(--foreground))"
				/>
			</svg>
		</div>

	{#if !hasAnySigner}
		<!-- No signer available -->
		<h2 class="modal-title text-display text-4xl text-foreground text-center mb-3">
			{#if isDesktop}
				No extension found
			{:else if isAndroid}
				No signer found
			{:else}
				Sign in not available
			{/if}
		</h2>
		
		{#if isDesktop}
			<!-- Desktop: needs browser extension -->
			<p class="description">
				You'll need a Nostr account and a browser extension like <a
					href="https://getalby.com/alby-extension"
					target="_blank"
					rel="noopener noreferrer"
					class="link-text">Alby</a
				> to sign in. Get a free account on <a
					href={PRIMAL_APP_URL}
					target="_blank"
					rel="noopener noreferrer"
					class="link-text">Primal</a
				>, then load your key into the extension.
			</p>
			<p class="description read-only-notice">
				You can browse apps in read-only mode without signing in.
			</p>
		{:else if isAndroid}
			<!-- Android: needs Amber -->
			<p class="description">
				You'll need a Nostr signer app like <a
					href={AMBER_DOWNLOAD_URL}
					target="_blank"
					rel="noopener noreferrer"
					class="link-text">Amber</a
				> to sign in. Get a free Nostr account on <a
					href={PRIMAL_APP_URL}
					target="_blank"
					rel="noopener noreferrer"
					class="link-text">Primal</a
				>, then install Amber and import your key.
			</p>
			<p class="description read-only-notice">
				You can browse apps in read-only mode without signing in.
			</p>
			<a
				href={AMBER_DOWNLOAD_URL}
				target="_blank"
				rel="noopener noreferrer"
				class="btn-primary-large w-full flex items-center justify-center gap-2 no-underline"
			>
				Get Amber Signer
			</a>
		{:else}
			<!-- Other mobile (iOS, etc.) -->
			<p class="description">
				Sign in is currently only available on desktop (with browser extensions) and Android (with Amber signer).
			</p>
			<p class="description read-only-notice">
				You can browse apps in read-only mode without signing in.
			</p>
		{/if}
	{:else}
		<!-- Has signer available -->
		<h2 class="modal-title text-display text-4xl text-foreground text-center mb-4">Sign in</h2>
		
		{#if isDesktop && hasExtension}
			<!-- Desktop with extension -->
			<p class="description">
				Connect with your <a
					href="https://nostr.com"
					target="_blank"
					rel="noopener noreferrer"
					class="link-text">Nostr</a
				> browser extension
			</p>

			<button
				type="button"
				class="btn-primary-large w-full flex items-center justify-center gap-3"
				disabled={isConnecting}
				onclick={handleConnect}
			>
				<Nostr variant="fill" color="hsl(var(--white66))" size={16} />
				<span>{isConnecting ? 'Connecting...' : 'Sign in with extension'}</span>
			</button>
		{:else if isAndroid && canUseAndroid}
			<!-- Android with signer -->
			<p class="description">
				Connect with your Android signer app (Amber)
			</p>

			<button
				type="button"
				class="btn-primary-large w-full flex items-center justify-center gap-3"
				disabled={isConnecting}
				onclick={handleConnect}
			>
				<Nostr variant="fill" color="hsl(var(--white66))" size={16} />
				<span>{isConnecting ? 'Opening signer...' : 'Sign in with Amber'}</span>
			</button>
			
			<p class="description helper-text">
				This will open your Amber app to approve the connection.
			</p>
		{/if}

		{#if error}
			<p class="error-message">{error}</p>
		{/if}
	{/if}
	</div>
</Modal>

<style>
	.modal-title {
		font-size: 1.875rem;
	}

	.modal-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 16px 16px 16px;
	}

	@media (min-width: 768px) {
		.modal-content {
			padding: 24px 24px 20px;
		}
	}

	.logo-container {
		margin-bottom: 12px;
	}

	.logo {
		width: 80px;
		height: auto;
	}

	.description {
		font-size: 1rem;
		color: hsl(var(--white66));
		margin: 0 0 24px;
		text-align: center;
		line-height: 1.5;
	}

	.link-text {
		color: hsl(var(--white66));
		text-decoration: underline;
		text-decoration-color: hsl(var(--white33));
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		cursor: pointer;
	}

	.link-text:hover {
		color: hsl(var(--white));
		text-decoration-color: hsl(var(--white66));
	}

	.no-underline {
		text-decoration: none;
	}

	.error-message {
		margin-top: 12px;
		padding: 12px;
		background-color: hsl(0, 70%, 50%, 0.2);
		border-radius: 8px;
		color: hsl(0, 70%, 70%);
		font-size: 0.875rem;
		text-align: center;
		width: 100%;
	}

	.read-only-notice {
		font-size: 0.9375rem;
		color: hsl(var(--white66));
		font-style: italic;
		margin-top: 16px;
	}

	.helper-text {
		font-size: 0.875rem;
		color: hsl(var(--white50));
		margin-top: 8px;
		margin-bottom: 0;
	}
</style>
