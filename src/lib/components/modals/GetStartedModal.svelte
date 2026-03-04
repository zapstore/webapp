<script lang="js">
	import Modal from '$lib/components/common/Modal.svelte';
	import { Nostr } from '$lib/components/icons';
	import { connect } from '$lib/stores/auth.svelte.js';
	import { ExtensionMissingError } from 'applesauce-signers/signers/extension-signer';

	const PRIMAL_APP_URL = 'https://zapstore.dev/apps/net.primal.android';

	let { open = $bindable(false), onconnected } = $props();
	let isConnecting = $state(false);
	let error = $state(null);
	let hasExtension = $state(true);

	$effect(() => {
		if (open) {
			hasExtension = typeof window.nostr !== 'undefined';
		} else {
			error = null;
		}
	});

	async function handleExistingKey() {
		isConnecting = true;
		error = null;
		try {
			const success = await connect();
			if (success) {
				open = false;
				onconnected?.();
			} else {
				error = 'Failed to connect to Nostr extension';
			}
		} catch (err) {
			if (err instanceof ExtensionMissingError) {
				hasExtension = false;
			} else {
				error = err instanceof Error ? err.message : 'Failed to connect to Nostr extension';
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
				<defs>
					<linearGradient id="start-logo-gradient" x1="100%" y1="0%" x2="0%" y2="100%">
						<stop offset="0%" stop-color="#5C5FFF" />
						<stop offset="100%" stop-color="#4542FF" />
					</linearGradient>
				</defs>
				<path
					d="M18.8379 13.9711L8.84956 0.356086C8.30464 -0.386684 7.10438 0.128479 7.30103 1.02073L9.04686 8.94232C9.16268 9.46783 8.74887 9.96266 8.19641 9.9593L0.871032 9.91477C0.194934 9.91066 -0.223975 10.6293 0.126748 11.1916L7.69743 23.3297C7.99957 23.8141 7.73264 24.4447 7.16744 24.5816L5.40958 25.0076C4.70199 25.179 4.51727 26.0734 5.10186 26.4974L12.4572 31.8326C12.9554 32.194 13.6711 31.9411 13.8147 31.3529L15.8505 23.0152C16.0137 22.3465 15.3281 21.7801 14.6762 22.0452L13.0661 22.7001C12.5619 22.9052 11.991 22.6092 11.8849 22.0877L10.7521 16.5224C10.6486 16.014 11.038 15.5365 11.5704 15.5188L18.1639 15.2998C18.8529 15.2769 19.2383 14.517 18.8379 13.9711Z"
					fill="url(#start-logo-gradient)"
				/>
			</svg>
		</div>

		{#if !hasExtension}
			<!-- No Nostr identity -->
			<h2 class="text-display text-4xl text-foreground text-center mb-3">No extension found</h2>
			<p class="description">
				You'll need a Nostr account and a browser extension like <a
					href="https://getalby.com/alby-extension"
					target="_blank"
					rel="noopener noreferrer"
					class="link-text">Alby</a
				> to sign in. Get a free account on Primal, then load your key into the extension. Sign-up coming soon.
			</p>

			<a
				href={PRIMAL_APP_URL}
				target="_blank"
				rel="noopener noreferrer"
				class="btn-primary-large w-full flex items-center justify-center gap-2 no-underline"
			>
				<Nostr variant="fill" color="hsl(var(--white66))" size={14} />
				Get Primal on Zapstore
			</a>
		{:else}
			<!-- Has extension -->
			<h2 class="text-display text-4xl text-foreground text-center mb-4">Sign in</h2>
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
				onclick={handleExistingKey}
			>
				<Nostr variant="fill" color="hsl(var(--white66))" size={16} />
				<span>{isConnecting ? 'Connecting...' : 'Sign in with extension'}</span>
			</button>

			{#if error}
				<p class="error-message">{error}</p>
			{/if}
		{/if}
	</div>
</Modal>

<style>
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
</style>
