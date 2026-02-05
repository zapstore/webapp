<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { initAuth } from '$lib/stores/auth.svelte';
	import { initCatalogs } from '$lib/stores/catalogs.svelte';
	import { initOnlineStatus, isOnline } from '$lib/stores/online.svelte';
	import { initNostrService } from '$lib/nostr';
	import { startProfileSearchBackground } from '$lib/services/profile-search';
	import Header from '$lib/components/layout/Header.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import NavigationProgress from '$lib/components/layout/NavigationProgress.svelte';
	import '../app.css';

	let { children } = $props();
	let online = $derived(isOnline());

	const path = $derived($page.url.pathname as string);

	// ReachKit has its own layout (header + footer)
	let isReachKit = $derived(path.startsWith('/studio/reachkit'));

	// Determine header variant based on route
	let isLandingPage = $derived(path === '/');
	let isBrowsePage = $derived(
		path === '/discover' ||
			path === '/apps' ||
			path === '/stacks' ||
			path === '/studio' ||
			path === '/search'
	);

	// Detail pages use their own contextual header (app and stack only; profile uses normal header)
	let isDetailPage = $derived(/^\/apps\/[^/]+$/.test(path) || /^\/stacks\/[^/]+$/.test(path));

	// Header variant: landing, browse, or studio (studio has custom search bar)
	type HeaderVariant = 'landing' | 'browse' | 'studio';
	let headerVariant = $derived<HeaderVariant>(
		isLandingPage ? 'landing' : path === '/studio' ? 'studio' : 'browse'
	);

	// Determine page title for browse/studio/profile variant
	let pageTitle = $derived(
		path === '/discover'
			? 'Discover'
			: path === '/apps'
				? 'Apps'
				: path === '/stacks'
					? 'Stacks'
					: path === '/studio'
						? 'Studio'
						: path === '/search'
							? 'Search'
							: /^\/profile\/[^/]+$/.test(path)
								? 'Profile'
								: ''
	);

	onMount(async () => {
		if (browser) {
			// Restore auth from localStorage so "logged in" persists across reloads/navigation
			initAuth();
			// Initialize online/offline detection
			initOnlineStatus();
			// Initialize Nostr service (cache, store, persistence)
			await initNostrService();
			// Start background load of default profiles for @ mention suggestions (local-first)
			startProfileSearchBackground();
			// Initialize catalog preferences from localStorage
			initCatalogs();
		}
	});
</script>

<div class="min-h-screen relative bg-background">
	<!-- Subtle gradient overlay -->
	<div class="fixed inset-0 bg-gradient-subtle pointer-events-none"></div>
	<!-- Noise/dither for depth -->
	<div class="fixed inset-0 bg-dither pointer-events-none opacity-40"></div>

	<div class="relative z-10 flex flex-col min-h-screen">
		<NavigationProgress />

		{#if isReachKit}
			{@render children()}
		{:else}
			{#if !isDetailPage}
				<Header
					variant={headerVariant}
					pageTitle={isBrowsePage || pageTitle === 'Profile' ? pageTitle : ''}
				/>
			{/if}

			{#if !online}
				<div class="offline-banner">
					<span class="offline-icon">📡</span>
					<span>You're offline — showing cached data</span>
				</div>
			{/if}

			<main class="flex-1 main-content" class:has-header={!isDetailPage}>
				{@render children()}
			</main>

			{#if !isDetailPage}
				<Footer />
			{/if}
		{/if}
	</div>
</div>

<style>
	.has-header {
		padding-top: 64px;
	}

	.offline-banner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: hsl(var(--goldColor33));
		color: hsl(var(--goldColor));
		font-size: 0.875rem;
		font-weight: 500;
	}

	.offline-icon {
		font-size: 1rem;
	}
</style>
