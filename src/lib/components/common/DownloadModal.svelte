<script>
	/**
	 * DownloadModal - Unified download modal for all apps
	 *
	 * Shows platform-specific download options.
	 * For Zapstore itself (isZapstore=true), shows the fancy promotional header.
	 * For other apps, shows a standard download modal with app icon.
	 */
	import { Monitor, Smartphone, ArrowRight, Copy } from 'lucide-svelte';
	import { Download, ChevronRight } from '$lib/components/icons';
	import { assets } from '$app/paths';
	import { SITE_URL } from '$lib/config';
	import { browser } from '$app/environment';
	import PlatformSelector from './PlatformSelector.svelte';
	import AppPic from './AppPic.svelte';
	import Modal from './Modal.svelte';
	/** @typedef {import("$lib/nostr/models").App} AppModel */

	/** @type {boolean} */
	export let open = false;

	/** @type {AppModel|null} - App data (required for non-Zapstore apps) */
	export let app = null;

	/** @type {boolean} - Whether this is the Zapstore app itself */
	export let isZapstore = false;

	// Platform options for Zapstore
	const zapstorePlatforms = ['Android', 'iOS'];

	let selectedPlatform = 'Android';
	let showVerifyOverlay = false;
	let isAndroid = browser && /android/i.test(navigator.userAgent);
	let verifyTab = isAndroid ? 'mobile' : 'desktop';
	let downloading = false;
	let step1Downloading = false;
	let linkCopied = false;

	// iOS waitlist state (only for Zapstore)
	let iosWaitlistStatus = 'idle';
	let iosWaitlistMessage = '';
	let iosSubmitting = false;
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	const npubRegex = /^npub1[ac-hj-np-z0-9]{58}$/i;

	// Zapstore-specific constants
	const ZAPSTORE_APK_FILENAME = 'zapstore-1.0.6.apk';
	const ZAPSTORE_APK_URL =
		'https://cdn.zapstore.dev/8619dabc77c84b7ba5621f1b707153460e0dd643ec65bd814d4e6f32560be66b.apk';
	/** Intrinsic size of static/images/download-image.png — reserves layout before decode. */
	const DOWNLOAD_HERO_WIDTH = 512;
	const DOWNLOAD_HERO_HEIGHT = 636;
	const ANDROID_APK_SHA256 = '8619dabc77c84b7ba5621f1b707153460e0dd643ec65bd814d4e6f32560be66b';
	const APK_CERT_HASH = '99e33b0c2d07e75fcd9df7e40e886646ff667e3aa6648e1a1160b036cf2b9320';

	// App info helpers
	const minAndroidVersion = 'Android 10+';
	$: sourceUrl = app?.repository || app?.url || null;
	$: appDeepLink = app ? `${SITE_URL}/apps/${app.naddr ?? app.dTag ?? ''}` : '';

	async function downloadApk() {
		downloading = true;
		try {
			const response = await fetch(ZAPSTORE_APK_URL);
			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = ZAPSTORE_APK_FILENAME;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);
		} catch {
			window.location.href = ZAPSTORE_APK_URL;
		} finally {
			downloading = false;
		}
	}

	async function downloadZapstoreStep1() {
		step1Downloading = true;
		try {
			const response = await fetch(ZAPSTORE_APK_URL);
			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = ZAPSTORE_APK_FILENAME;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);
		} catch {
			window.location.href = ZAPSTORE_APK_URL;
		} finally {
			step1Downloading = false;
		}
	}

	async function copyDownloadLink() {
		const urlToCopy = ZAPSTORE_APK_URL;
		if (!urlToCopy) return;
		try {
			await navigator.clipboard.writeText(urlToCopy);
			linkCopied = true;
			setTimeout(() => (linkCopied = false), 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	/** @param {SubmitEvent} event */
	async function handleIosWaitlistSubmit(event) {
		event.preventDefault();
		const form = /** @type {HTMLFormElement} */ (event.currentTarget);
		const formData = new FormData(form);
		const contact = formData.get('contact')?.toString().trim();

		if (!contact) {
			iosWaitlistStatus = 'error';
			iosWaitlistMessage = 'Please enter an email or npub.';
			return;
		}

		if (!emailRegex.test(contact) && !npubRegex.test(contact)) {
			iosWaitlistStatus = 'error';
			iosWaitlistMessage = 'Enter a valid email or Nostr npub (starts with npub1).';
			return;
		}

		iosSubmitting = true;
		iosWaitlistStatus = 'idle';
		iosWaitlistMessage = '';

		try {
			const response = await fetch('https://formspree.io/f/mldqprpn', {
				method: 'POST',
				headers: {
					Accept: 'application/json'
				},
				body: formData
			});

			if (!response.ok) {
				throw new Error('Request failed');
			}

			iosWaitlistStatus = 'success';
			iosWaitlistMessage = "Thanks! We'll share more as soon as it's ready.";
			form.reset();
		} catch {
			iosWaitlistStatus = 'error';
			iosWaitlistMessage = 'Something went wrong. Please try again.';
		} finally {
			iosSubmitting = false;
		}
	}
</script>

<Modal
	bind:open
	ariaLabel="Download {isZapstore ? 'Zapstore' : app?.name || 'App'}"
	maxWidth="max-w-lg"
	maxHeight={90}
	class={isZapstore ? 'download-modal-bg' : ''}
>
	{#if isZapstore}
		<!-- Zapstore: Fancy header image -->
		<img
			src={`${assets}/images/download-image.png`}
			alt="Download Zapstore"
			width={DOWNLOAD_HERO_WIDTH}
			height={DOWNLOAD_HERO_HEIGHT}
			class="w-full h-auto object-cover"
			decoding="async"
		/>
		<div class="zapstore-content p-4 md:p-6 relative">
			<h2 class="modal-title modal-heading mb-6">Download Zapstore</h2>

			<!-- Platform Selector -->
			<div class="mb-6">
				<PlatformSelector
					platforms={zapstorePlatforms}
					{selectedPlatform}
					onSelect={(/** @type {string} */ platform) => (selectedPlatform = platform)}
				/>
			</div>

			<!-- Platform-specific content for Zapstore -->
			{#if selectedPlatform === 'Android'}
				<div class="space-y-5">
					<div
						class="flex items-stretch rounded-xl bg-white/5 border border-border/30 overflow-hidden"
					>
						<!-- QR Code - Hidden on mobile -->
						<div class="hidden md:flex flex-col items-center gap-5 pt-5 pb-4 px-5">
							<img
								src={`${assets}/images/qr.png`}
								alt="QR code to download Zapstore"
								class="w-32 h-32 rounded-lg border border-border/40 bg-white p-1"
								loading="lazy"
							/>
							<button
								type="button"
								class="flex items-center gap-2 regular14 text-muted-foreground hover:text-foreground transition-colors"
								on:click={copyDownloadLink}
							>
								<span>Download Link</span>
								{#if linkCopied}
									<svg
										class="w-4 h-4 text-green-500"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M5 13l4 4L19 7"
										></path>
									</svg>
								{:else}
									<Copy class="w-4 h-4" />
								{/if}
							</button>
						</div>
						<!-- Vertical Divider - Hidden on mobile -->
						<div
							class="hidden md:block w-[1.4px] flex-shrink-0 self-stretch"
							style="background-color: var(--white16);"
						></div>
						<!-- Left Column (Android info) - Only on mobile -->
						<div class="flex-1 md:hidden flex flex-col justify-center">
							<div class="flex flex-col justify-center gap-1 text-muted-foreground px-5 py-4">
								<span class="flex items-center gap-2">
									<svg
										class="w-5 h-5 flex-shrink-0"
										viewBox="0 0 24 24"
										fill="currentColor"
										xmlns="http://www.w3.org/2000/svg"
									>
										<path
											d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.463 11.463 0 00-8.94 0L5.65 5.67c-.19-.29-.58-.38-.87-.2-.28.18-.37.54-.22.83L6.4 9.48A10.78 10.78 0 003 18h18a10.78 10.78 0 00-3.4-8.52zM8.5 14c-.83 0-1.5-.67-1.5-1.5S7.67 11 8.5 11s1.5.67 1.5 1.5S9.33 14 8.5 14zm7 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
										/>
									</svg>
									<span class="regular14">Android 10+</span>
								</span>
								<span class="regular14" style="color: var(--white33);"
									><strong>arm64-v8a</strong> only</span
								>
							</div>
						</div>
						<!-- Vertical Divider - Only on mobile -->
						<div
							class="md:hidden w-[1.4px] flex-shrink-0 self-stretch"
							style="background-color: var(--white16);"
						></div>
						<div class="flex-1 flex flex-col">
							<!-- Android 10+ Info - Hidden on mobile (shown in left column instead) -->
							<div
								class="hidden md:flex flex-1 flex-col justify-center gap-1 text-muted-foreground pl-6 pr-4 py-2"
							>
								<span class="flex items-center gap-2">
									<svg
										class="w-5 h-5 flex-shrink-0"
										viewBox="0 0 24 24"
										fill="currentColor"
										xmlns="http://www.w3.org/2000/svg"
									>
										<path
											d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.463 11.463 0 00-8.94 0L5.65 5.67c-.19-.29-.58-.38-.87-.2-.28.18-.37.54-.22.83L6.4 9.48A10.78 10.78 0 003 18h18a10.78 10.78 0 00-3.4-8.52zM8.5 14c-.83 0-1.5-.67-1.5-1.5S7.67 11 8.5 11s1.5.67 1.5 1.5S9.33 14 8.5 14zm7 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
										/>
									</svg>
									<span class="regular14">Android 10+</span>
								</span>
								<span class="regular14" style="color: var(--white33);"
									><strong>arm64-v8a</strong> only</span
								>
							</div>

							<!-- Horizontal Divider - Hidden on mobile -->
							<div
								class="hidden md:block w-full h-[1.4px] flex-shrink-0"
								style="background-color: var(--white16);"
							></div>

							<!-- Verify APK -->
							<button
								type="button"
								class="flex items-center gap-2 regular14 text-muted-foreground hover:text-foreground transition-colors pl-6 pr-4 py-4 cursor-pointer"
								on:click={() => (showVerifyOverlay = true)}
							>
								<span>Verify APK</span>
								<ChevronRight
									variant="outline"
									strokeWidth={1.4}
									color="var(--white33)"
									size={16}
									className="ml-auto"
								/>
							</button>

							<!-- Horizontal Divider -->
							<div
								class="w-full h-[1.4px] flex-shrink-0"
								style="background-color: var(--white16);"
							></div>

							<!-- View Source Code -->
							<a
								href="https://github.com/zapstore/zapstore"
								class="flex items-center gap-2 regular14 text-muted-foreground hover:text-foreground transition-colors pl-6 pr-4 py-4"
								target="_blank"
								rel="noopener noreferrer"
							>
								<span>View Source Code</span>
								<ChevronRight
									variant="outline"
									strokeWidth={1.4}
									color="var(--white33)"
									size={16}
									className="ml-auto"
								/>
							</a>
						</div>
					</div>

					<div class="download-actions">
						<button
							type="button"
							on:click={downloadApk}
							disabled={downloading}
							class="btn-primary-large w-full disabled:opacity-70 flex items-center justify-center gap-3"
						>
							{#if downloading}
								<div
									class="animate-spin rounded-full h-5 w-5 border-2 border-primary-foreground border-t-transparent"
								></div>
								Downloading...
							{:else}
								<Download variant="fill" color="var(--white66)" size={20} />
								Download Android App
							{/if}
						</button>
					</div>
				</div>
			{:else if selectedPlatform === 'iOS'}
				<div class="space-y-5">
					<p class="regular14 text-muted-foreground">
						We're designing Zapstore iOS to bypass the App Store and deliver an even better UX. <strong
							>It will require an Apple Developer Account ($100/yr) and a monthly fee</strong
						>. Drop an email or npub and we'll share more as it gets ready.
					</p>
					<form class="space-y-3" on:submit|preventDefault={handleIosWaitlistSubmit}>
						<label class="sr-only" for="ios-contact">Email or npub</label>
						<input
							id="ios-contact"
							name="contact"
							type="text"
							inputmode="text"
							autocomplete="off"
							placeholder="you@example.com or npub1..."
							class="w-full rounded-lg border border-border bg-background px-4 py-3 regular14 text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/40 transition-colors"
						/>
						<button
							type="submit"
							class="btn-primary-large group w-full disabled:opacity-70 disabled:cursor-not-allowed"
							disabled={iosSubmitting}
						>
							{#if iosSubmitting}
								Submitting...
							{:else}
								Notify me
							{/if}
							<ArrowRight class="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
						</button>
						{#if iosWaitlistStatus === 'error'}
							<p class="regular14 text-rose-400">{iosWaitlistMessage}</p>
						{:else if iosWaitlistStatus === 'success'}
							<p class="regular14 text-emerald-400">{iosWaitlistMessage}</p>
						{/if}
					</form>
				</div>
			{:else}
				<div class="text-center py-8">
					<p class="text-muted-foreground">
						{selectedPlatform} downloads coming soon!
					</p>
				</div>
			{/if}
		</div>
	{:else}
		<!-- Other apps: Two-step download flow -->
		<div class="p-4 md:p-6">
			<!-- App icon + title -->
			<div class="flex justify-center mb-4">
				<AppPic iconUrl={app?.icon} name={app?.name} identifier={app?.dTag} size="2xl" />
			</div>
			<h2 class="modal-title modal-heading mb-4">
				Download {app?.name || 'App'}
			</h2>
			<!-- <p class="app-modal-description">With Zapstore for reliable, secure updates</p> -->

			<!-- Platform selector -->
			<div class="mb-3">
				<div class="app-platform-selector">
					<button type="button" class="platform-btn selected">Android</button>
					<button type="button" class="platform-btn disabled" disabled>No other platforms</button>
				</div>
			</div>

			<!-- Step 1: Get Zapstore -->
			<div class="flex flex-col rounded-xl bg-white/5 border border-border/30 overflow-hidden mb-5">
				<!-- Step header -->
				<div class="step-card-header">
					<span class="step-num">1</span>
					<span class="step-card-title semibold16">Download Zapstore</span>
					<button
						type="button"
						disabled={step1Downloading}
						class="btn-primary-small step-action-btn ml-auto flex-shrink-0 whitespace-nowrap disabled:opacity-70"
						on:click={downloadZapstoreStep1}
						>{step1Downloading ? 'Downloading…' : 'Download'}</button
					>
				</div>
				<!-- QR + description -->
				<div class="flex items-stretch">
					<div class="hidden md:flex flex-col items-center justify-center pt-5 pb-5 px-5">
						<img
							src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&bgcolor=ffffff&color=000000&data={encodeURIComponent(
								ZAPSTORE_APK_URL
							)}"
							alt="QR code to download Zapstore"
							class="w-[7.5rem] h-[7.5rem] rounded-lg border border-border/40 bg-white p-1"
							loading="lazy"
						/>
					</div>
					<div
						class="hidden md:block w-[1.4px] flex-shrink-0 self-stretch"
						style="background-color: var(--white16);"
					></div>
					<div class="flex-1 flex flex-col justify-start pl-5 pr-4 py-4">
						<ul class="step-bullet-list">
							<li class="step-desktop-only">
								<span>Scan and tap <strong>Download anyway</strong>, if prompted</span>
							</li>
							<li class="step-mobile-only">
								<span>Tap <strong>Download anyway</strong>, if prompted</span>
							</li>
							<li>
								<span>Allow <strong>installation from unknown sources</strong>, if prompted</span>
							</li>
							<li><span>Open <strong>Zapstore</strong> once installed</span></li>
						</ul>
					</div>
				</div>
			</div>

			<!-- Step 2: Open in Zapstore -->
			<div class="flex flex-col rounded-xl bg-white/5 border border-border/30 overflow-hidden">
				<!-- Step header -->
				<div class="step-card-header">
					<span class="step-num">2</span>
					<span class="step-card-title semibold16"
						>Open {app?.name || 'the app'} page in Zapstore</span
					>
					<a
						href={appDeepLink}
						class="btn-primary-small step-action-btn ml-auto flex-shrink-0 whitespace-nowrap"
						target="_blank"
						rel="noopener noreferrer">Open</a
					>
				</div>
				<!-- QR + description -->
				<div class="flex items-stretch">
					<div class="hidden md:flex flex-col items-center justify-center pt-5 pb-5 px-5">
						<img
							src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&bgcolor=ffffff&color=000000&data={encodeURIComponent(
								appDeepLink
							)}"
							alt="QR code to open {app?.name} in Zapstore"
							class="w-[7.5rem] h-[7.5rem] rounded-lg border border-border/40 bg-white p-1"
							loading="lazy"
						/>
					</div>
					<div
						class="hidden md:block w-[1.4px] flex-shrink-0 self-stretch"
						style="background-color: var(--white16);"
					></div>
					<div class="flex-1 flex flex-col justify-start pl-5 pr-4 py-4">
						<ul class="step-bullet-list">
							<li class="step-desktop-only">
								<span
									>Scan to open <strong>{app?.name}</strong> directly in Zapstore, or use search.</span
								>
							</li>
							<li>
								<span
									><strong>Install {app?.name}.</strong> Enable installing unknown apps via Zapstore,
									if prompted</span
								>
							</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	{/if}
</Modal>

<!-- Verify APK Overlay (only for Zapstore) -->
{#if isZapstore}
	<Modal
		bind:open={showVerifyOverlay}
		ariaLabel="Verify APK Authenticity"
		maxWidth="max-w-lg"
		zIndex={60}
	>
		<div class="p-6">
			<div class="flex items-center justify-between mb-6">
				<h3 class="bold18 text-foreground">Verify APK Authenticity</h3>
				<button
					type="button"
					class="text-muted-foreground hover:text-foreground transition-colors"
					on:click={() => (showVerifyOverlay = false)}
				>
					✕
				</button>
			</div>

			<div class="rounded-xl bg-white/5 border border-border/30 regular14 overflow-hidden">
				<!-- Tabs -->
				<div class="flex border-b border-border/30">
					<button
						type="button"
						class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 medium12 transition-colors {verifyTab ===
						'desktop'
							? 'text-foreground bg-white/5'
							: 'text-muted-foreground hover:text-foreground'}"
						on:click={() => (verifyTab = 'desktop')}
					>
						<Monitor class="w-3.5 h-3.5" />
						Desktop
					</button>
					<button
						type="button"
						class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 medium12 transition-colors {verifyTab ===
						'mobile'
							? 'text-foreground bg-white/5'
							: 'text-muted-foreground hover:text-foreground'}"
						on:click={() => (verifyTab = 'mobile')}
					>
						<Smartphone class="w-3.5 h-3.5" />
						Mobile
					</button>
				</div>

				<!-- Tab content -->
				<div class="p-4">
					{#if verifyTab === 'desktop'}
						<p class="regular12 text-muted-foreground mb-2">Run in terminal:</p>
						<div
							class="font-mono regular12 text-muted-foreground bg-muted/30 p-2.5 rounded-lg border border-border/30 mb-3"
						>
							shasum -a 256 {ZAPSTORE_APK_FILENAME}
						</div>
						<p class="regular12 text-muted-foreground mb-1.5">Should equal:</p>
						<div
							class="font-mono text-[11px] text-muted-foreground break-all bg-muted/30 p-2.5 rounded-lg border border-border/30 mb-3"
						>
							{ANDROID_APK_SHA256}
						</div>
						<p class="text-[11px] text-muted-foreground/70">
							Always check the hash in
							<a
								href="https://npub.world/npub10r8xl2njyepcw2zwv3a6dyufj4e4ajx86hz6v4ehu4gnpupxxp7stjt2p8"
								target="_blank"
								rel="noopener noreferrer"
								class="text-primary hover:underline">Zapstore's Nostr profile</a
							>
						</p>
					{:else}
						<p class="regular12 text-muted-foreground mb-2">
							Use
							<a
								href="https://github.com/soupslurpr/AppVerifier"
								target="_blank"
								rel="noopener noreferrer"
								class="text-primary hover:underline">AppVerifier</a
							>
							to verify the APK certificate:
						</p>
						<p class="regular12 text-muted-foreground mb-1.5">Certificate hash:</p>
						<div
							class="font-mono text-[11px] text-muted-foreground break-all bg-muted/30 p-2.5 rounded-lg border border-border/30 mb-3"
						>
							{APK_CERT_HASH}
						</div>
						<p class="text-[11px] text-muted-foreground/70">
							Always check the hash in
							<a
								href="https://npub.world/npub10r8xl2njyepcw2zwv3a6dyufj4e4ajx86hz6v4ehu4gnpupxxp7stjt2p8"
								target="_blank"
								rel="noopener noreferrer"
								class="text-primary hover:underline">Zapstore's Nostr profile</a
							>
						</p>
					{/if}
				</div>
			</div>
		</div>
	</Modal>
{/if}

<style>
	.modal-title {
		font-size: 1.875rem;
	}

	.app-modal-description {
		margin: 0 0 1.25rem;
		font-size: 0.9375rem;
		text-align: center;
		color: var(--white66);
	}

	/* Gradient background for Zapstore download modal */
	:global(.download-modal-bg) {
		background: linear-gradient(to bottom, var(--black66), var(--gray66)) !important;
	}

	/* Zapstore content overlap with image - less overlap on smaller screens */
	.zapstore-content {
		margin-top: -300px;
	}

	@media (min-width: 640px) {
		.zapstore-content {
			margin-top: -360px;
		}
	}

	/* ── Custom platform selector for non-Zapstore apps ── */
	.app-platform-selector {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem;
		background-color: var(--black33);
		border-radius: 16px;
	}

	.platform-btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 32px;
		padding: 0 14px;
		font-size: 14px;
		font-weight: 500;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		transition: transform 0.2s ease;
	}

	.platform-btn.selected {
		background-color: var(--white16);
		color: var(--white);
	}

	.platform-btn.disabled {
		background-color: transparent;
		color: var(--white33);
		cursor: not-allowed;
	}

	/* ── Step header row (number circle + title) ── */
	.step-card-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		border-bottom: 1.4px solid var(--white16);
	}

	.step-num {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--white16);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		font-weight: 600;
		color: var(--white);
		flex-shrink: 0;
	}

	/* step-card-title font handled by semibold16 utility class */
	.step-card-title {
		color: var(--white);
	}

	/* Mobile-only action buttons — hidden on desktop */
	.step-action-btn {
		display: inline-flex;
	}

	@media (min-width: 768px) {
		.step-action-btn {
			display: none !important;
		}
	}

	/* Responsive bullet variants */
	.step-desktop-only {
		display: none !important;
	}

	@media (min-width: 768px) {
		.step-desktop-only {
			display: flex !important;
		}

		.step-mobile-only {
			display: none !important;
		}
	}

	/* ── Bullet list in step description column ── */
	.step-bullet-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 7px;
	}

	.step-bullet-list li {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		font-size: 14px;
		color: var(--white66);
		line-height: 1.45;
	}

	.step-bullet-list li::before {
		content: '';
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--white33);
		flex-shrink: 0;
		margin-top: 8px;
	}

	.download-actions {
		display: flex;
		gap: 0.75rem;
	}

	/* Smaller button text on mobile */
	@media (max-width: 767px) {
		.download-actions :global(.btn-primary-large),
		.download-actions :global(.btn-secondary-large),
		:global(.space-y-3 .btn-primary-large) {
			font-size: 14px;
		}
	}
</style>
