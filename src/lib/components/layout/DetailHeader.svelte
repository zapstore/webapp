<script lang="ts">
	/**
	 * DetailHeader - Contextual header for detail pages (app, stack, profile)
	 *
	 * Replaces the branded Zapstore header with:
	 * - Menu button (opens navigation)
	 * - Publisher profile pic, name, timestamp
	 * - Catalog/community info on the right
	 */

	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { Menu, Cross } from '$lib/components/icons';
	import { Search } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import { nip19 } from 'nostr-tools';
	import { getCurrentPubkey, connect } from '$lib/stores/auth.svelte';
	import { queryStoreOne, fetchProfile } from '$lib/nostr';
	import { parseProfile } from '$lib/nostr/models';
	import ProfilePic from '$lib/components/common/ProfilePic.svelte';
	import ProfilePicStack from '$lib/components/common/ProfilePicStack.svelte';
	import Timestamp from '$lib/components/common/Timestamp.svelte';
	import {
		zapstoreProfileStore,
		ZAPSTORE_PUBKEY,
		startProfileSearchBackground
	} from '$lib/services/profile-search';
	import SearchModal from '$lib/components/common/SearchModal.svelte';
	import GetStartedModal from '$lib/components/modals/GetStartedModal.svelte';
	import OnboardingBuildingModal from '$lib/components/modals/OnboardingBuildingModal.svelte';
	import SpinKeyModal from '$lib/components/modals/SpinKeyModal.svelte';

	interface CatalogProfile {
		pictureUrl?: string;
		name?: string;
		pubkey?: string;
	}

	interface Props {
		publisherPic?: string | null;
		publisherName?: string | null;
		publisherPubkey?: string | null;
		publisherUrl?: string;
		timestamp?: number | null;
		catalogs?: CatalogProfile[];
		catalogText?: string;
		showPublisher?: boolean;
		/** When set, header is hidden until user scrolls past this px (e.g. 164 for profile page). */
		scrollThreshold?: number;
	}

	let {
		publisherPic = null,
		publisherName = null,
		publisherPubkey = null,
		publisherUrl = '#',
		timestamp = null,
		catalogs = [],
		catalogText = 'In Zapstore',
		showPublisher = true,
		scrollThreshold
	}: Props = $props();

	// Reactive Zapstore profile from store (populated by profile-search from EventStore/relays)
	let zapstoreProfile = $state<{ picture: string; name: string } | null>(null);
	$effect(() => {
		const unsub = zapstoreProfileStore.subscribe((v) => (zapstoreProfile = v));
		return unsub;
	});
	const isZapstoreCatalog = $derived(
		catalogs.length > 0 &&
			catalogs[0]?.pubkey &&
			ZAPSTORE_PUBKEY &&
			(catalogs[0].pubkey.toLowerCase() === ZAPSTORE_PUBKEY.toLowerCase() ||
				(catalogs[0].name ?? '').toLowerCase() === 'zapstore')
	);
	const effectiveCatalogs = $derived(
		isZapstoreCatalog && zapstoreProfile
			? [{ ...catalogs[0], pictureUrl: zapstoreProfile.picture, name: zapstoreProfile.name }]
			: catalogs
	);

	let scrolled = $state(false);
	let scrollY = $state(0);
	let menuOpen = $state(false);
	let menuContainer = $state<HTMLElement | null>(null);
	let menuContainerFloating = $state<HTMLElement | null>(null);
	let menuButton = $state<HTMLElement | null>(null);
	let catalogDropdownOpen = $state(false);
	let catalogDropdownContainer = $state<HTMLElement | null>(null);
	let searchOpen = $state(false);
	let searchQuery = $state('');
	let getStartedModalOpen = $state(false);
	let spinKeyModalOpen = $state(false);
	let onboardingBuildingModalOpen = $state(false);
	let onboardingProfileName = $state('');

	// Categories and platforms for the search modal
	const categories = [
		'Productivity',
		'Social',
		'Entertainment',
		'Utilities',
		'Developer Tools',
		'Games'
	];
	const platforms = ['Android', 'Mac', 'Linux', 'CLI', 'Web', 'iOS'];

	// Reactive auth state
	const pubkey = $derived(getCurrentPubkey());
	const profileHref = $derived(pubkey ? '/profile/' + nip19.npubEncode(pubkey) : '#');
	const isConnected = $derived(pubkey !== null);

	// Current user profile (local-first: EventStore then background fetch) for menu avatar
	let currentUserProfile = $state<{ picture: string; name: string } | null>(null);
	$effect(() => {
		const pk = getCurrentPubkey();
		if (!pk) {
			currentUserProfile = null;
			return;
		}
		const ev = queryStoreOne({ kinds: [0], authors: [pk], limit: 1 });
		if (ev?.content) {
			try {
				const p = parseProfile(ev);
				currentUserProfile = {
					picture: p.picture ?? '',
					name: p.displayName ?? p.name ?? ''
				};
			} catch {
				currentUserProfile = null;
			}
		} else {
			currentUserProfile = null;
		}
		fetchProfile(pk).then((e) => {
			if (e?.content) {
				try {
					const p = parseProfile(e);
					currentUserProfile = {
						picture: p.picture ?? '',
						name: p.displayName ?? p.name ?? ''
					};
				} catch {
					// keep existing
				}
			}
		});
	});

	function openSearch() {
		searchOpen = true;
		menuOpen = false;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		const activeContainer =
			scrollThreshold != null && !headerVisible && menuContainerFloating
				? menuContainerFloating
				: menuContainer;
		if (menuOpen && activeContainer && !activeContainer.contains(target)) {
			menuOpen = false;
		}
		if (
			catalogDropdownOpen &&
			catalogDropdownContainer &&
			!catalogDropdownContainer.contains(target)
		) {
			catalogDropdownOpen = false;
		}
	}

	const headerVisible = $derived(scrollThreshold == null ? true : scrollY > scrollThreshold);

	onMount(() => {
		if (browser) startProfileSearchBackground();
		const handleScroll = () => {
			scrollY = window.scrollY;
			scrolled = window.scrollY > 10;
		};

		window.addEventListener('scroll', handleScroll, { passive: true });
		document.addEventListener('click', handleClickOutside);

		return () => {
			window.removeEventListener('scroll', handleScroll);
			document.removeEventListener('click', handleClickOutside);
		};
	});

	function toggleMenu(e?: Event) {
		if (e) e.stopPropagation();
		menuOpen = !menuOpen;
	}

	function closeMenu() {
		menuOpen = false;
	}

	function openGetStartedModal() {
		menuOpen = false;
		getStartedModalOpen = true;
	}

	function handleGetStartedStart(event: { profileName: string }) {
		onboardingProfileName = event.profileName;
		spinKeyModalOpen = true;
		setTimeout(() => {
			getStartedModalOpen = false;
		}, 50);
	}

	function handleGetStartedConnected() {
		getStartedModalOpen = false;
	}

	function handleSpinComplete(event: {
		nsec: string;
		secretKeyHex: string;
		pubkey: string;
		profileName: string;
	}) {
		spinKeyModalOpen = false;
		// Defer so SpinKeyModal can close and unmount before showing the next modal
		setTimeout(() => {
			onboardingBuildingModalOpen = true;
		}, 150);
	}

	function handleUseExistingKey() {
		spinKeyModalOpen = false;
		getStartedModalOpen = true;
	}

	async function handleSignIn() {
		try {
			await connect();
		} catch (err) {
			console.error('Sign in failed:', err);
		}
	}
</script>

<header
	class={cn(
		'detail-header fixed top-0 left-0 right-0 z-50 transition-all duration-300',
		!headerVisible && 'detail-header-hidden',
		scrolled
			? 'bg-background/60 border-b border-border/50'
			: 'bg-transparent border-b border-transparent'
	)}
>
	<nav class="container mx-auto pl-1 pr-4 sm:pl-3 sm:pr-6 md:pl-5 md:pr-8 h-full">
		<div class="flex items-center justify-between gap-3 h-full">
			<!-- Left: Menu button + Publisher info -->
			<div class="flex items-center gap-2 min-w-0 flex-1">
				<!-- Menu button with dropdown -->
				<div
					class="menu-container"
					bind:this={menuContainer}
					role="navigation"
					aria-label="Main menu"
				>
					<button
						type="button"
						class="menu-button"
						class:menu-button-open={menuOpen}
						bind:this={menuButton}
						onclick={(e) => {
							e.stopPropagation();
							toggleMenu();
						}}
						aria-label={menuOpen ? 'Close menu' : 'Open menu'}
						aria-expanded={menuOpen}
					>
						{#if menuOpen}
							<Cross variant="outline" color="hsl(var(--white33))" size={14} />
						{:else}
							<Menu variant="outline" color="hsl(var(--white33))" size={16} />
						{/if}
					</button>

					<!-- Menu backdrop (mobile only) -->
					{#if menuOpen}
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<div class="menu-backdrop" onclick={closeMenu}></div>
					{/if}

					<!-- Menu dropdown -->
					{#if menuOpen}
						<div class="menu-dropdown">
							<!-- Logo section with user profile -->
							<div class="menu-header-row">
								<a href="/" class="menu-logo" onclick={closeMenu}>
									<svg
										width="19"
										height="32"
										viewBox="0 0 19 32"
										fill="none"
										xmlns="http://www.w3.org/2000/svg"
										class="menu-logo-icon"
									>
										<defs>
											<linearGradient id="menu-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
												<stop offset="0%" style="stop-color: hsl(252, 100%, 72%);" />
												<stop offset="100%" style="stop-color: hsl(241, 100%, 68%);" />
											</linearGradient>
										</defs>
										<path
											d="M18.8379 13.9711L8.84956 0.356086C8.30464 -0.386684 7.10438 0.128479 7.30103 1.02073L9.04686 8.94232C9.16268 9.46783 8.74887 9.96266 8.19641 9.9593L0.871032 9.91477C0.194934 9.91066 -0.223975 10.6293 0.126748 11.1916L7.69743 23.3297C7.99957 23.8141 7.73264 24.4447 7.16744 24.5816L5.40958 25.0076C4.70199 25.179 4.51727 26.0734 5.10186 26.4974L12.4572 31.8326C12.9554 32.194 13.6711 31.9411 13.8147 31.3529L15.8505 23.0152C16.0137 22.3465 15.3281 21.7801 14.6762 22.0452L13.0661 22.7001C12.5619 22.9052 11.991 22.6092 11.8849 22.0877L10.7521 16.5224C10.6486 16.014 11.038 15.5365 11.5704 15.5188L18.1639 15.2998C18.8529 15.2769 19.2383 14.517 18.8379 13.9711Z"
											fill="url(#menu-logo-gradient)"
										/>
									</svg>
									<span class="menu-logo-text">Zapstore</span>
								</a>
								{#if isConnected}
									<a href={profileHref} class="menu-user-pic-btn" onclick={closeMenu}>
										<span class="menu-user-pic-mobile">
											<ProfilePic
												{pubkey}
												pictureUrl={currentUserProfile?.picture || undefined}
												name={currentUserProfile?.name || undefined}
												size="md"
											/>
										</span>
										<span class="menu-user-pic-desktop">
											<ProfilePic
												{pubkey}
												pictureUrl={currentUserProfile?.picture || undefined}
												name={currentUserProfile?.name || undefined}
												size="sm"
											/>
										</span>
									</a>
								{/if}
							</div>

							<!-- Search bar button -->
							<button type="button" class="menu-search-btn" onclick={openSearch}>
								<Search class="h-5 w-5 flex-shrink-0" style="color: hsl(var(--white33));" />
								<span class="menu-search-text">Search Any App</span>
							</button>

							<!-- Discover section -->
							<div class="menu-section">
								<a href="/discover" class="menu-section-link" onclick={closeMenu}>Discover</a>
								<nav class="menu-subnav">
									<a
										href="/apps"
										class="menu-sublink text-sm font-medium text-white/66"
										onclick={closeMenu}>Apps</a
									>
									<a
										href="/stacks"
										class="menu-sublink text-sm font-medium text-white/66"
										onclick={closeMenu}>Stacks</a
									>
								</nav>
							</div>

							<!-- Studio section -->
							<div class="menu-section">
								<a href="/studio" class="menu-section-link" onclick={closeMenu}>Studio</a>
								<nav class="menu-subnav">
									<a
										href="/studio#quickstart"
										class="menu-sublink text-sm font-medium text-white/66"
										onclick={closeMenu}>Quickstart</a
									>
									<a
										href="/studio/reachkit"
										class="menu-sublink text-sm font-medium text-white/66"
										onclick={closeMenu}>ReachKit</a
									>
								</nav>
							</div>

							<!-- Contact section -->
							<div class="menu-section">
								<span class="menu-section-label">Contact</span>
								<nav class="menu-subnav">
									<a
										href="https://github.com/zapstore/zapstore"
										class="menu-sublink text-sm font-medium text-white/66"
										onclick={closeMenu}
										target="_blank"
										rel="noopener noreferrer">GitHub</a
									>
									<a
										href="https://signal.group/#CjQKIK20nMOglqNT8KYw4ZeyChsvA14TTcjtjuC2VF6j6nB5EhDLZ7pQHvOeopr36jq431ow"
										class="menu-sublink text-sm font-medium text-white/66"
										onclick={closeMenu}
										target="_blank"
										rel="noopener noreferrer">User Support on Signal</a
									>
									<a
										href="https://signal.group/#CjQKIC0VCHf6gGeeHKcIrKcaI-B5Kjvge2NKw2i4P55tMkCwEhBaOk9B80F3_MhMYVbgj7lL"
										class="menu-sublink text-sm font-medium text-white/66"
										onclick={closeMenu}
										target="_blank"
										rel="noopener noreferrer">Dev Support on Signal</a
									>
									<a
										href="https://npub.world/npub10r8xl2njyepcw2zwv3a6dyufj4e4ajx86hz6v4ehu4gnpupxxp7stjt2p8"
										class="menu-sublink text-sm font-medium text-white/66"
										onclick={closeMenu}
										target="_blank"
										rel="noopener noreferrer">Follow us on Nostr</a
									>
									<a
										href="https://x.com/zapstore_"
										class="menu-sublink text-sm font-medium text-white/66"
										onclick={closeMenu}
										target="_blank"
										rel="noopener noreferrer">Follow us on Twitter</a
									>
								</nav>
							</div>

							{#if !isConnected}
								<div class="menu-divider"></div>
								<!-- Get Started button (only when not logged in) -->
								<div class="menu-cta-wrapper">
									<button type="button" class="btn-primary w-full" onclick={openGetStartedModal}>
										Get Started
									</button>
								</div>
							{/if}
						</div>
					{/if}
				</div>

				{#if showPublisher}
					<!-- Publisher link -->
					<a
						href={publisherUrl}
						class="publisher-link flex items-center gap-2.5 min-w-0 hover:opacity-80 transition-opacity"
					>
						<ProfilePic
							pictureUrl={publisherPic}
							name={publisherName}
							pubkey={publisherPubkey}
							size="sm"
						/>
						<span class="publisher-name">
							{publisherName || 'Anonymous'}
						</span>
						{#if timestamp}
							<Timestamp {timestamp} size="xs" className="publisher-timestamp" />
						{/if}
					</a>
				{/if}
			</div>

			<!-- Right: Catalog profile stack (opens dropdown explainer on click) -->
			{#if catalogs.length > 0}
				<div class="catalog-dropdown-wrap" bind:this={catalogDropdownContainer}>
					<ProfilePicStack
						profiles={effectiveCatalogs}
						text={catalogText}
						size="sm"
						onclick={() => (catalogDropdownOpen = !catalogDropdownOpen)}
					/>
					{#if catalogDropdownOpen}
						<div class="catalog-dropdown-panel" role="dialog" aria-label="Catalog info">
							<p class="catalog-dropdown-text">
								For now Zapstore only reads app events from the Zapstore server (relay + Blossom).
								Soon any catalog will be usable and creatable within the app.
							</p>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</nav>
</header>

<!-- When scrollThreshold is set, no top gap until user scrolls (spacer 0 when header hidden) -->
<div
	class="header-spacer"
	class:header-spacer-zero={scrollThreshold != null && !headerVisible}
></div>

<!-- Floating menu button (same position as header) when header is hidden due to scrollThreshold -->
{#if scrollThreshold != null && !headerVisible}
	<div class="floating-menu-bar" role="banner">
		<nav class="floating-menu-nav">
			<div
				class="menu-container"
				bind:this={menuContainerFloating}
				role="navigation"
				aria-label="Main menu"
			>
				<button
					type="button"
					class="menu-button"
					class:menu-button-open={menuOpen}
					onclick={(e) => {
						e.stopPropagation();
						toggleMenu();
					}}
					aria-label={menuOpen ? 'Close menu' : 'Open menu'}
					aria-expanded={menuOpen}
				>
					{#if menuOpen}
						<Cross variant="outline" color="hsl(var(--white33))" size={14} />
					{:else}
						<Menu variant="outline" color="hsl(var(--white33))" size={16} />
					{/if}
				</button>
				{#if menuOpen}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div
						class="menu-backdrop"
						onclick={closeMenu}
						role="button"
						tabindex="-1"
						aria-label="Close menu"
					></div>
					<div class="menu-dropdown floating-menu-dropdown">
						<div class="menu-header-row">
							<a href="/" class="menu-logo" onclick={closeMenu}>
								<svg
									width="19"
									height="32"
									viewBox="0 0 19 32"
									fill="none"
									xmlns="http://www.w3.org/2000/svg"
									class="menu-logo-icon"
								>
									<defs>
										<linearGradient
											id="menu-logo-gradient-float"
											x1="0%"
											y1="0%"
											x2="100%"
											y2="100%"
										>
											<stop offset="0%" style="stop-color: hsl(252, 100%, 72%);" />
											<stop offset="100%" style="stop-color: hsl(241, 100%, 68%);" />
										</linearGradient>
									</defs>
									<path
										d="M18.8379 13.9711L8.84956 0.356086C8.30464 -0.386684 7.10438 0.128479 7.30103 1.02073L9.04686 8.94232C9.16268 9.46783 8.74887 9.96266 8.19641 9.9593L0.871032 9.91477C0.194934 9.91066 -0.223975 10.6293 0.126748 11.1916L7.69743 23.3297C7.99957 23.8141 7.73264 24.4447 7.16744 24.5816L5.40958 25.0076C4.70199 25.179 4.51727 26.0734 5.10186 26.4974L12.4572 31.8326C12.9554 32.194 13.6711 31.9411 13.8147 31.3529L15.8505 23.0152C16.0137 22.3465 15.3281 21.7801 14.6762 22.0452L13.0661 22.7001C12.5619 22.9052 11.991 22.6092 11.8849 22.0877L10.7521 16.5224C10.6486 16.014 11.038 15.5365 11.5704 15.5188L18.1639 15.2998C18.8529 15.2769 19.2383 14.517 18.8379 13.9711Z"
										fill="url(#menu-logo-gradient-float)"
									/>
								</svg>
								<span class="menu-logo-text">Zapstore</span>
							</a>
							{#if isConnected}
								<a href={profileHref} class="menu-user-pic-btn" onclick={closeMenu}>
									<span class="menu-user-pic-mobile">
										<ProfilePic
											{pubkey}
											pictureUrl={currentUserProfile?.picture || undefined}
											name={currentUserProfile?.name || undefined}
											size="md"
										/>
									</span>
									<span class="menu-user-pic-desktop">
										<ProfilePic
											{pubkey}
											pictureUrl={currentUserProfile?.picture || undefined}
											name={currentUserProfile?.name || undefined}
											size="sm"
										/>
									</span>
								</a>
							{/if}
						</div>
						<button type="button" class="menu-search-btn" onclick={openSearch}>
							<Search class="h-5 w-5 flex-shrink-0" style="color: hsl(var(--white33));" />
							<span class="menu-search-text">Search Any App</span>
						</button>
						<div class="menu-section">
							<a href="/discover" class="menu-section-link" onclick={closeMenu}>Discover</a>
							<nav class="menu-subnav">
								<a
									href="/apps"
									class="menu-sublink text-sm font-medium text-white/66"
									onclick={closeMenu}>Apps</a
								>
								<a
									href="/stacks"
									class="menu-sublink text-sm font-medium text-white/66"
									onclick={closeMenu}>Stacks</a
								>
							</nav>
						</div>
						<div class="menu-section">
							<a href="/studio" class="menu-section-link" onclick={closeMenu}>Studio</a>
						</div>
						{#if !isConnected}
							<div class="menu-divider"></div>
							<div class="menu-cta-wrapper">
								<button type="button" class="btn-primary w-full" onclick={openGetStartedModal}
									>Get Started</button
								>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</nav>
	</div>
{/if}

<!-- Search Modal -->
<SearchModal bind:open={searchOpen} bind:searchQuery {categories} {platforms} />

<!-- Onboarding Modals -->
<GetStartedModal
	bind:open={getStartedModalOpen}
	onstart={handleGetStartedStart}
	onconnected={handleGetStartedConnected}
/>

<SpinKeyModal
	bind:open={spinKeyModalOpen}
	profileName={onboardingProfileName}
	zIndex={55}
	onspinComplete={handleSpinComplete}
	onuseExistingKey={handleUseExistingKey}
/>

<OnboardingBuildingModal bind:open={onboardingBuildingModalOpen} zIndex={56} />

<style>
	/* Fixed header height - exactly 64px to match main header */
	:global(.detail-header) {
		height: 64px;
	}

	:global(.detail-header.detail-header-hidden) {
		opacity: 0;
		pointer-events: none;
	}

	:global(.detail-header)::before {
		content: '';
		position: absolute;
		inset: 0;
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		z-index: -1;
	}

	.header-spacer {
		height: 64px;
	}

	.header-spacer.header-spacer-zero {
		height: 0;
	}

	.floating-menu-bar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 51;
		pointer-events: none;
	}

	.floating-menu-bar > * {
		pointer-events: auto;
	}

	.floating-menu-nav {
		height: 64px;
		display: flex;
		align-items: center;
		width: 100%;
		max-width: 1280px;
		margin: 0 auto;
		padding-left: 0.25rem;
		padding-right: 1rem;
	}

	@media (min-width: 640px) {
		.floating-menu-nav {
			padding-left: 0.75rem;
			padding-right: 1.5rem;
		}
	}

	@media (min-width: 768px) {
		.floating-menu-nav {
			padding-left: 1.25rem;
			padding-right: 1.5rem;
		}
	}

	@media (min-width: 1024px) {
		.floating-menu-nav {
			padding-left: 1.25rem;
			padding-right: 2rem;
		}
	}

	.floating-menu-bar .menu-dropdown.floating-menu-dropdown {
		position: fixed;
		top: calc(64px + 4px);
		left: 1rem;
		right: auto;
		width: 75%;
		max-width: 320px;
	}

	@media (min-width: 768px) {
		.floating-menu-bar .menu-dropdown.floating-menu-dropdown {
			position: absolute;
			top: calc(100% + 4px);
			left: 0;
			width: 280px;
			max-width: none;
		}
	}

	/* Menu container */
	.menu-container {
		position: relative;
	}

	/* Menu button - 40x40, gray33 bg on hover */
	.menu-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		min-width: 40px;
		min-height: 40px;
		background-color: transparent;
		border: none;
		border-radius: 12px;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	/* Ensure icons don't block clicks */
	.menu-button :global(svg) {
		pointer-events: none;
	}

	.menu-button:hover {
		background-color: hsl(var(--gray66));
	}

	.menu-button-open {
		background-color: hsl(var(--gray66));
	}

	.menu-button:active {
		transform: scale(0.96);
	}

	/* Menu backdrop overlay (mobile only) */
	.menu-backdrop {
		display: block;
		position: fixed;
		inset: 0;
		background-color: hsl(var(--overlay));
		z-index: 99;
	}

	@media (min-width: 768px) {
		.menu-backdrop {
			display: none;
		}
	}

	/* Menu dropdown - mobile: full-height sheet from left */
	.menu-dropdown {
		position: fixed;
		top: 0;
		left: 0;
		width: 75%;
		max-width: 320px;
		height: 100vh;
		background-color: hsla(240, 6%, 18%, 0.8);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border-right: 0.33px solid hsl(var(--white16));
		border-radius: 0;
		padding: 12px;
		z-index: 100;
		box-shadow: 8px 0 32px hsl(var(--black33));
		overflow-y: auto;
	}

	/* Desktop: dropdown positioned below button */
	@media (min-width: 768px) {
		.menu-dropdown {
			position: absolute;
			top: calc(100% + 4px);
			left: 0;
			width: 280px;
			max-width: none;
			height: auto;
			border: 0.33px solid hsl(var(--white16));
			border-radius: 12px 32px 32px 32px;
			box-shadow: 0 8px 32px hsl(var(--black33));
			padding: 12px;
			overflow-y: visible;
		}
	}

	/* Menu header row with logo and user pic */
	.menu-header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	/* Logo section in menu - same height as profile pic (38px) */
	.menu-logo {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 38px;
		padding: 0 8px 0 6px;
		flex: 1;
		text-decoration: none;
		border-radius: 16px;
		transition: background-color 0.15s ease;
	}

	.menu-logo:hover {
		background-color: hsl(var(--white8));
	}

	.menu-logo-icon {
		height: 22px;
		width: auto;
		flex-shrink: 0;
	}

	.menu-logo-text {
		font-size: 1.125rem;
		font-weight: 600;
		color: hsl(var(--white));
		letter-spacing: -0.01em;
	}

	/* Profile pic button in menu - square, matches Zapstore button height */
	.menu-user-pic-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 38px;
		height: 38px;
		border-radius: 16px;
		flex-shrink: 0;
		transition: background-color 0.15s ease;
		text-decoration: none;
	}

	.menu-user-pic-btn:hover {
		background-color: hsl(var(--white8));
	}

	/* Responsive profile pic sizes in menu */
	.menu-user-pic-mobile {
		display: flex;
	}

	.menu-user-pic-desktop {
		display: none;
	}

	@media (min-width: 768px) {
		.menu-user-pic-mobile {
			display: none;
		}

		.menu-user-pic-desktop {
			display: flex;
		}
	}

	/* Search bar button in menu */
	.menu-search-btn {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		margin: 12px 0;
		padding: 8px 16px 8px 12px;
		background-color: hsl(var(--white8));
		border: 0.33px solid hsl(var(--white16));
		border-radius: 12px;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.menu-search-btn:hover {
		background-color: hsl(var(--white16));
	}

	.menu-search-text {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--white33));
	}

	/* Menu divider */
	.menu-divider {
		height: 1.4px;
		background-color: hsl(var(--white11));
		margin: 12px 0;
	}

	/* Menu section */
	.menu-section {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: 8px;
	}

	/* Section link (big clickable item) */
	.menu-section-link {
		display: block;
		padding: 6px 10px;
		font-size: 0.9375rem;
		font-weight: 500;
		color: hsl(var(--white));
		text-decoration: none;
		border-radius: 10px;
		transition: background-color 0.15s ease;
	}

	.menu-section-link:hover {
		background-color: hsl(var(--white8));
	}

	.menu-section-label {
		display: block;
		padding: 6px 10px;
		font-size: 0.9375rem;
		font-weight: 500;
		color: hsl(var(--white));
	}

	/* Sub navigation */
	.menu-subnav {
		display: flex;
		flex-direction: column;
		padding-left: 10px;
	}

	/* Sub link items */
	.menu-sublink {
		display: block;
		padding: 6px 12px;
		text-decoration: none;
		border-radius: 12px;
		transition:
			background-color 0.15s ease,
			opacity 0.15s ease;
	}

	.menu-sublink:hover {
		background-color: hsl(var(--white8));
		opacity: 1;
	}

	/* Publisher link styles */
	.publisher-link {
		text-decoration: none;
		overflow: hidden;
	}

	.publisher-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--white66));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	:global(.publisher-timestamp) {
		color: hsl(var(--white33)) !important;
		flex-shrink: 0;
	}

	/* Catalog dropdown on the right */
	.catalog-dropdown-wrap {
		position: relative;
		flex-shrink: 0;
		z-index: 1;
	}

	.catalog-dropdown-panel {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		min-width: 260px;
		max-width: 320px;
		padding: 12px 14px;
		/* Solid non-transparent background (no blur) */
		background: hsl(241 15% 18%);
		border: 1px solid hsl(var(--white16));
		border-radius: 12px;
		box-shadow: 0 8px 24px hsl(var(--black66) / 0.4);
	}

	.catalog-dropdown-text {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.45;
		color: hsl(var(--white66));
	}

	/* CTA button wrapper for padding */
	.menu-cta-wrapper {
		padding: 0 4px;
	}
</style>
