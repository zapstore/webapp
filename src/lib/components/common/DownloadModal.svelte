<script>
	/**
	 * DownloadModal - Unified download modal for all apps
	 *
	 * Shows platform-specific download options.
	 * For Zapstore itself (isZapstore=true), shows the fancy promotional header.
	 * For other apps, shows a standard download modal with app icon.
	 */
	import { Monitor, Smartphone, Copy } from 'lucide-svelte';
	import { Download, ChevronRight } from '$lib/components/icons';
	import { assets } from '$app/paths';
	import { SITE_URL, ZAPSTORE_LATEST_APK_URL } from '$lib/config';
	import { browser } from '$app/environment';
	import AppPic from './AppPic.svelte';
	import Modal from './Modal.svelte';
	import SkeletonLoader from './SkeletonLoader.svelte';
	import { fetchZapstoreLatestApk } from '$lib/utils/blossom-download.js';
	/** @typedef {import("$lib/nostr/models").App} AppModel */

	/** @type {{ open?: boolean, app?: AppModel|null, isZapstore?: boolean }} */
	let { open = $bindable(false), app = null, isZapstore = false } = $props();

	let showVerifyOverlay = $state(false);
	const isAndroid = browser && /android/i.test(navigator.userAgent);
	let verifyTab = $state(/** @type {'desktop' | 'mobile'} */ (isAndroid ? 'mobile' : 'desktop'));
	let linkCopied = $state(false);

	let zapstoreQrLoaded = $state(false);
	let step1QrLoaded = $state(false);
	let step2QrLoaded = $state(false);
	/** @type {string} */
	let apkVersion = $state('');
	/** @type {string} */
	let apkSha256 = $state('');
	/** Human-readable APK size from CDN Content-Length (e.g. "4.2 MB"). */
	let apkSizeLabel = $state('');
	let apkMetaError = $state(false);
	let apkFilename = $derived(apkVersion ? `zapstore-${apkVersion}.apk` : 'zapstore.apk');

	/** Intrinsic size of static/images/download-image.png — reserves layout before decode. */
	const DOWNLOAD_HERO_WIDTH = 512;
	const DOWNLOAD_HERO_HEIGHT = 636;
	/** Signing certificate hash (not release-specific). */
	const APK_CERT_HASH = '99e33b0c2d07e75fcd9df7e40e886646ff667e3aa6648e1a1160b036cf2b9320';

	let appDeepLink = $derived(app ? `${SITE_URL}/apps/${app.naddr ?? app.dTag ?? ''}` : '');

	function formatApkSize(bytes) {
		if (!Number.isFinite(bytes) || bytes <= 0) return '';
		if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
		if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
		return `${bytes} B`;
	}

	$effect(() => {
		if (!browser || !open || apkVersion) return;
		const controller = new AbortController();
		apkMetaError = false;
		fetchZapstoreLatestApk(controller.signal)
			.then((meta) => {
				apkVersion = meta.version;
				apkSha256 = meta.sha256;
				apkSizeLabel = meta.bytes ? formatApkSize(meta.bytes) : '';
			})
			.catch((err) => {
				if (controller.signal.aborted) return;
				console.error('Failed to load Zapstore APK metadata:', err);
				apkMetaError = true;
			});
		return () => {
			controller.abort();
		};
	});

	async function copyDownloadLink() {
		try {
			await navigator.clipboard.writeText(ZAPSTORE_LATEST_APK_URL);
			linkCopied = true;
			setTimeout(() => (linkCopied = false), 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}
</script>

<Modal
	bind:open
	ariaLabel="Download {isZapstore ? 'Zapstore' : app?.name || 'App'}"
	maxWidth="max-w-lg"
	class={isZapstore ? 'download-modal download-modal-bg' : ''}
>
	{#if isZapstore}
		<!-- Zapstore: Fancy header image -->
		<img
			src={`${assets}/images/download-image.png`}
			alt="Download Zapstore"
			width={DOWNLOAD_HERO_WIDTH}
			height={DOWNLOAD_HERO_HEIGHT}
			class="download-hero-img w-full h-auto object-cover"
			loading="eager"
			fetchpriority="high"
			decoding="sync"
		/>
		<div class="zapstore-content p-4 md:p-6 relative">
			<h2 class="modal-title modal-heading mb-6">Download Zapstore</h2>

			<div class="space-y-5">
				<div
					class="flex items-stretch rounded-xl bg-white/5 border border-border/30 overflow-hidden"
				>
						<!-- QR Code - Hidden on mobile -->
						<div class="hidden md:flex flex-col items-center gap-3 p-4">
							<div class="relative w-36 h-36 flex-shrink-0">
								{#if !zapstoreQrLoaded}
									<div class="absolute inset-0 rounded-md overflow-hidden bg-neutral-200">
										<SkeletonLoader />
									</div>
								{/if}
								<img
									src="https://api.qrserver.com/v1/create-qr-code/?size=144x144&bgcolor=ffffff&color=000000&data={encodeURIComponent(
										ZAPSTORE_LATEST_APK_URL
									)}"
									alt="QR code to download Zapstore"
									class="w-36 h-36 rounded-md border border-border/40 bg-white p-1"
									loading="lazy"
									onload={() => (zapstoreQrLoaded = true)}
								/>
							</div>
							<button
								type="button"
								class="flex items-center gap-2 regular14 text-muted-foreground hover:text-foreground transition-colors"
								onclick={copyDownloadLink}
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
							class="hidden md:block w-px flex-shrink-0 self-stretch"
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
								<span class="regular14" style="color: var(--white33);">
									{#if apkVersion}
										<strong>v{apkVersion}</strong>
										{#if apkSizeLabel}
											· {apkSizeLabel}
										{/if}
									{:else if apkMetaError}
										<span>Version unavailable</span>
									{:else}
										<span class="apk-size-loading">…</span>
									{/if}
								</span>
							</div>
						</div>
						<!-- Vertical Divider - Only on mobile -->
						<div
							class="md:hidden w-px flex-shrink-0 self-stretch"
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
								<span class="regular14" style="color: var(--white33);">
									{#if apkVersion}
										<strong>v{apkVersion}</strong>
										{#if apkSizeLabel}
											· {apkSizeLabel}
										{/if}
									{:else if apkMetaError}
										<span>Version unavailable</span>
									{:else}
										<span class="apk-size-loading">…</span>
									{/if}
								</span>
							</div>

							<!-- Horizontal Divider - Hidden on mobile -->
							<div
								class="hidden md:block w-full h-px flex-shrink-0"
								style="background-color: var(--white16);"
							></div>

							<!-- Verify APK -->
							<button
								type="button"
								class="flex items-center gap-2 regular14 text-muted-foreground hover:text-foreground transition-colors pl-6 pr-4 py-4 cursor-pointer"
								onclick={() => (showVerifyOverlay = true)}
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
								class="w-full h-px flex-shrink-0"
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
					<a
						href={ZAPSTORE_LATEST_APK_URL}
						class="btn-primary-large w-full flex items-center justify-center gap-3"
					>
						<Download variant="fill" color="var(--white66)" size={20} />
						Download Android App
					</a>
				</div>
			</div>
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
					<a
						href={ZAPSTORE_LATEST_APK_URL}
						class="btn-primary-small step-action-btn ml-auto flex-shrink-0 whitespace-nowrap"
						>Download</a
					>
				</div>
				<!-- QR + description -->
				<div class="flex items-stretch">
					<div class="hidden md:flex flex-col items-center justify-center p-4">
						<div class="relative w-36 h-36 flex-shrink-0">
							{#if !step1QrLoaded}
								<div class="absolute inset-0 rounded-md overflow-hidden bg-neutral-200">
									<SkeletonLoader />
								</div>
							{/if}
							<img
								src="https://api.qrserver.com/v1/create-qr-code/?size=144x144&bgcolor=ffffff&color=000000&data={encodeURIComponent(
									ZAPSTORE_LATEST_APK_URL
								)}"
								alt="QR code to download Zapstore"
								class="w-36 h-36 rounded-md border border-border/40 bg-white p-1"
								loading="lazy"
								onload={() => (step1QrLoaded = true)}
							/>
						</div>
					</div>
					<div
						class="hidden md:block w-px flex-shrink-0 self-stretch"
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
					<div class="hidden md:flex flex-col items-center justify-center p-4">
						<div class="relative w-36 h-36 flex-shrink-0">
							{#if !step2QrLoaded}
								<div class="absolute inset-0 rounded-md overflow-hidden bg-neutral-200">
									<SkeletonLoader />
								</div>
							{/if}
							<img
								src="https://api.qrserver.com/v1/create-qr-code/?size=144x144&bgcolor=ffffff&color=000000&data={encodeURIComponent(
									appDeepLink
								)}"
								alt="QR code to open {app?.name} in Zapstore"
								class="w-36 h-36 rounded-md border border-border/40 bg-white p-1"
								loading="lazy"
								onload={() => (step2QrLoaded = true)}
							/>
						</div>
					</div>
					<div
						class="hidden md:block w-px flex-shrink-0 self-stretch"
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
		zIndex={200}
	>
		<div class="p-6">
			<div class="flex items-center justify-between mb-6">
				<h3 class="bold18 text-foreground">Verify APK Authenticity</h3>
				<button
					type="button"
					class="text-muted-foreground hover:text-foreground transition-colors"
					onclick={() => (showVerifyOverlay = false)}
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
						onclick={() => (verifyTab = 'desktop')}
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
						onclick={() => (verifyTab = 'mobile')}
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
							shasum -a 256 {apkFilename}
						</div>
						<p class="regular12 text-muted-foreground mb-1.5">Should equal:</p>
						<div
							class="font-mono text-[11px] text-muted-foreground break-all bg-muted/30 p-2.5 rounded-lg border border-border/30 mb-3"
						>
							{#if apkSha256}
								{apkSha256}
							{:else if apkMetaError}
								Hash unavailable
							{:else}
								…
							{/if}
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


	/* Gradient background for Zapstore download modal */
	:global(.download-modal-bg) {
		background: linear-gradient(to bottom, var(--black66), var(--gray66)) !important;
	}

	.download-hero-img {
		width: 100%;
		height: auto;
		object-fit: cover;
		/* Negative-margin content overlaps this image — never steal clicks. */
		pointer-events: none;
	}

	/* ≥1600px modal is wider — cap hero at intrinsic height so the sheet does not balloon */
	@media (min-width: 1600px) {
		.download-hero-img {
			max-height: 636px;
		}
	}

	/* Zapstore content overlap with image - less overlap on smaller screens */
	.zapstore-content {
		position: relative;
		z-index: 1;
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
		border-bottom: 1px solid var(--white16);
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

	.download-actions a,
	a.step-action-btn {
		text-decoration: none;
	}

	.apk-size-loading {
		color: var(--white33);
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
