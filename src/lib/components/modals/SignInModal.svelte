<script lang="js">
	import Modal from '$lib/components/common/Modal.svelte';
	import InputTextField from '$lib/components/common/InputTextField.svelte';
	import { Extension, Nostr } from '$lib/components/icons';
	import { connect, connectWithNostrConnectUri, ExtensionMissingError } from '$lib/stores/auth.svelte.js';

	let { open = $bindable(false), onOpenGetStarted } = $props();

	const PANEL_ICON_SIZE = 32;

	/** @type {'choose' | 'nostr-connect'} */
	let step = $state('choose');
	let extensionConnecting = $state(false);
	let extensionError = $state(/** @type {string | null} */ (null));
	let nostrConnectUri = $state('');
	let nostrFieldWarning = $state(/** @type {string | null} */ (null));
	let nostrConnectError = $state(/** @type {string | null} */ (null));
	let nostrConnectConnecting = $state(false);

	$effect(() => {
		if (!open) {
			step = 'choose';
			extensionConnecting = false;
			extensionError = null;
			nostrConnectUri = '';
			nostrFieldWarning = null;
			nostrConnectError = null;
			nostrConnectConnecting = false;
		}
	});

	async function handleExtensionSignIn() {
		extensionError = null;
		extensionConnecting = true;
		try {
			const success = await connect();
			if (success) {
				open = false;
			} else {
				extensionError = 'Failed to connect to signer';
			}
		} catch (err) {
			open = false;
			if (err instanceof ExtensionMissingError || err instanceof Error) {
				onOpenGetStarted?.();
			}
		} finally {
			extensionConnecting = false;
		}
	}

	function chooseNostrConnect() {
		step = 'nostr-connect';
		nostrFieldWarning = null;
		nostrConnectError = null;
	}

	function backToChoices() {
		step = 'choose';
		nostrFieldWarning = null;
		nostrConnectError = null;
	}

	const BUNKER_PREFIX = 'bunker://';
	const NWC_PREFIX = 'nostr+walletconnect://';

	/**
	 * @param {string} raw
	 * @returns {string | null} warning message or null if shape looks OK
	 */
	function validateConnectUri(raw) {
		const s = raw.trim();
		if (!s) return 'Enter a connection string from your signer.';
		if (s.startsWith(BUNKER_PREFIX) || s.startsWith(NWC_PREFIX)) return null;
		return 'Use a bunker:// or nostr+walletconnect:// URL from your signer app.';
	}

	async function handleNostrConnectSubmit() {
		nostrConnectError = null;
		const w = validateConnectUri(nostrConnectUri);
		nostrFieldWarning = w;
		if (w) return;
		nostrConnectConnecting = true;
		try {
			await connectWithNostrConnectUri(nostrConnectUri.trim());
			open = false;
		} catch (err) {
			nostrConnectError = err instanceof Error ? err.message : 'Could not connect. Check the string and try again.';
		} finally {
			nostrConnectConnecting = false;
		}
	}
</script>

<Modal
	bind:open
	title="Sign In"
	description="Connect your Nostr profile"
	ariaLabel="Sign in"
	maxWidth="max-w-xl"
	compactTitleSpacing={true}
>
	<div class="sign-in-modal-body px-4 pb-4 pt-2 md:px-6 md:pb-6">
		{#if step === 'choose'}
			<div class="choice-grid">
				<button
					type="button"
					class="choice-panel"
					disabled={extensionConnecting}
					onclick={handleExtensionSignIn}
				>
					<span class="choice-icon-wrap" aria-hidden="true">
						<Extension variant="fill" color="var(--white33)" size={PANEL_ICON_SIZE} />
					</span>
					<span class="choice-label">Browser Extension</span>
				</button>
				<button type="button" class="choice-panel" onclick={chooseNostrConnect}>
					<span class="choice-icon-wrap" aria-hidden="true">
						<Nostr variant="fill" color="var(--white33)" size={PANEL_ICON_SIZE} />
					</span>
					<span class="choice-label">Nostr Connect</span>
				</button>
			</div>
			{#if extensionError}
				<p class="field-error">{extensionError}</p>
			{/if}
		{:else}
			<InputTextField
				bind:value={nostrConnectUri}
				id="sign-in-nostr-connect-uri"
				title="Connection string"
				placeholder="bunker://… or nostr+walletconnect://…"
				autocomplete="off"
				autoCapitalize={false}
				warning={nostrFieldWarning}
				oninput={() => {
					nostrFieldWarning = null;
					nostrConnectError = null;
				}}
			/>
			<div class="sign-in-modal-actions">
				<button type="button" class="btn-secondary-large btn-secondary-modal shrink-0" onclick={backToChoices}>
					Back
				</button>
				<button
					type="button"
					class="btn-primary-large flex-1 min-w-0 justify-center"
					disabled={nostrConnectConnecting}
					onclick={handleNostrConnectSubmit}
				>
					{nostrConnectConnecting ? 'Connecting…' : 'Connect'}
				</button>
			</div>
			{#if nostrConnectError}
				<p class="field-error">{nostrConnectError}</p>
			{/if}
		{/if}
	</div>
</Modal>

<style>
	.sign-in-modal-body {
		box-sizing: border-box;
	}

	.choice-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	@media (max-width: 480px) {
		.choice-grid {
			grid-template-columns: 1fr;
		}
	}

	.choice-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 24px 20px 20px;
		border: none;
		border-radius: 16px;
		cursor: pointer;
		background-color: var(--black33);
		transition: opacity 0.15s ease;
		font-family: var(--font-sans);
		-webkit-tap-highlight-color: transparent;
	}

	.choice-panel:hover:not(:disabled),
	.choice-panel:focus-visible:not(:disabled) {
		background-color: var(--black33);
	}

	.choice-panel:disabled {
		opacity: 0.65;
		cursor: wait;
	}

	.choice-icon-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		flex-shrink: 0;
	}

	.sign-in-modal-actions {
		display: flex;
		gap: 16px;
		margin-top: 1rem;
		align-items: stretch;
	}

	@media (max-width: 767px) {
		.sign-in-modal-actions :global(.btn-primary-large),
		.sign-in-modal-actions :global(.btn-secondary-large) {
			font-size: 14px;
		}
	}

	.choice-label {
		font-size: 1rem;
		font-weight: 500;
		line-height: 1.5;
		color: var(--white);
		text-align: center;
	}

	.field-error {
		margin: 12px 0 0;
		font-size: 0.9375rem;
		line-height: 1.4;
		color: hsl(0, 72%, 72%);
		text-align: center;
	}
</style>
