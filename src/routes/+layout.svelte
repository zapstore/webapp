<script lang="js">
import { onMount } from 'svelte';
import { browser, dev } from '$app/environment';
import { page } from '$app/stores';
import { afterNavigate } from '$app/navigation';
import { initAuth } from '$lib/stores/auth.svelte.js';
import { initCatalogs } from '$lib/stores/catalogs.svelte.js';
import { initOnlineStatus, isOnline } from '$lib/stores/online.svelte.js';
import { startProfileSearchBackground } from '$lib/services/profile-search';
import { startLiveSubscriptions, stopLiveSubscriptions } from '$lib/nostr/service';
import { evictOldEvents } from '$lib/nostr/dexie';
import { IDB_NAME } from '$lib/config';
import { setBackGoesHomeIfLandedFromOutside, clearBackGoesHome } from '$lib/utils/back.js';
import Header from '$lib/components/layout/Header.svelte';
import Footer from '$lib/components/layout/Footer.svelte';
import AppSidebar from '$lib/components/layout/AppSidebar.svelte';
import NavigationProgress from '$lib/components/layout/NavigationProgress.svelte';
import SearchModal from '$lib/components/common/SearchModal.svelte';
import GetStartedModal from '$lib/components/modals/GetStartedModal.svelte';
import SpinKeyModal from '$lib/components/modals/SpinKeyModal.svelte';
import OnboardingBuildingModal from '$lib/components/modals/OnboardingBuildingModal.svelte';
import '../app.css';
let { children } = $props();
let online = $derived(isOnline());
const path = $derived($page.url.pathname);
let isClearingLocalData = $state(false);
// ReachKit has its own layout (header + footer)
let isReachKit = $derived(path.startsWith('/studio/reachkit'));
// Sidebar layout: all non-marketing pages (everything except / and /studio). Desktop only via CSS.
let useSidebarLayout = $derived(
	!isReachKit && path !== '/' && path !== '/studio' && !path.startsWith('/studio/')
);
// Modal state for sidebar layout (search + Get Started flow)
let searchOpen = $state(false);
let searchQuery = $state('');
let getStartedModalOpen = $state(false);
let spinKeyModalOpen = $state(false);
let onboardingBuildingModalOpen = $state(false);
let onboardingProfileName = $state('');
function openGetStartedModal() {
	getStartedModalOpen = true;
}
function handleGetStartedStart(event) {
	onboardingProfileName = event.profileName;
	spinKeyModalOpen = true;
	setTimeout(() => {
		getStartedModalOpen = false;
	}, 80);
}
function handleGetStartedConnected() {
	getStartedModalOpen = false;
}
function handleSpinComplete() {
	spinKeyModalOpen = false;
	setTimeout(() => {
		onboardingBuildingModalOpen = true;
	}, 150);
}
function handleUseExistingKey() {
	spinKeyModalOpen = false;
	getStartedModalOpen = true;
}
// Determine header variant based on route
let isLandingPage = $derived(path === '/');
let isBrowsePage = $derived(path === '/discover' ||
    path === '/apps' ||
    path === '/stacks' ||
    path === '/studio' ||
    path === '/docs' ||
    path.startsWith('/docs/') ||
    path === '/search');
// Detail pages use their own contextual header (app and stack only; profile uses normal header)
let isDetailPage = $derived(/^\/apps\/[^/]+$/.test(path) || /^\/stacks\/[^/]+$/.test(path));
let headerVariant = $derived(isLandingPage || path === '/studio' ? 'landing' : 'browse');
// Determine page title for browse/studio/profile variant
let pageTitle = $derived(path === '/discover'
    ? 'Discover'
    : path === '/apps'
        ? 'Apps'
        : path === '/stacks'
            ? 'Stacks'
            : path === '/studio'
                ? 'Studio'
                : path === '/docs' || path.startsWith('/docs/')
                    ? 'Docs'
                    : path === '/search'
                        ? 'Search'
                        : /^\/profile\/[^/]+$/.test(path)
                            ? 'Profile'
                            : '');
onMount(() => {
    if (browser) {
        // When user landed from another site or direct, back button will go to / instead of leaving the app
        setBackGoesHomeIfLandedFromOutside();
        // Restore auth from localStorage so "logged in" persists across reloads/navigation
        initAuth();
        // Initialize online/offline detection
        initOnlineStatus();
        // Start persistent relay connections for live catalog updates
        startLiveSubscriptions();
        // Evict old non-replaceable events to prevent unbounded IndexedDB growth
        evictOldEvents();
        // Start background load of default profiles for @ mention suggestions (local-first)
        startProfileSearchBackground();
        // Initialize catalog preferences from localStorage
        initCatalogs();
    }
    return () => {
        stopLiveSubscriptions();
    };
});

afterNavigate(({ from }) => {
    if (browser && from) {
        // User navigated within the app; back should use history again
        clearBackGoesHome();
    }
});

function deleteIndexedDb(name) {
    return new Promise((resolve) => {
        if (!name) {
            resolve(false);
            return;
        }

        try {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
            request.onblocked = () => resolve(false);
        } catch {
            resolve(false);
        }
    });
}

async function clearAllLocalCaches() {
    if (!browser || isClearingLocalData) return;

    const confirmed = window.confirm('Clear all IndexedDB and Cache Storage data for this app?');
    if (!confirmed) return;

    isClearingLocalData = true;

    try {
        if (typeof indexedDB !== 'undefined') {
            let dbNames = [];

            if (typeof indexedDB.databases === 'function') {
                const databases = await indexedDB.databases();
                dbNames = databases.map((entry) => entry?.name).filter(Boolean);
            }
            else {
                // Fallback for browsers without indexedDB.databases()
                dbNames = [IDB_NAME];
            }

            await Promise.all(dbNames.map((name) => deleteIndexedDb(name)));
        }

        if (typeof caches !== 'undefined') {
            const cacheKeys = await caches.keys();
            await Promise.all(cacheKeys.map((key) => caches.delete(key)));
        }

        window.location.reload();
    } finally {
        isClearingLocalData = false;
    }
}
</script>

<!--
  App shell — three layout branches:
    1. ReachKit  — bare, no chrome
    2. Sidebar   — app shell: sidebar (desktop) + content-viewport + mobile bottom nav
    3. Marketing — standard header + footer (landing / studio pages)

  Modal scoping:
    On desktop (≥768px), .content-viewport has transform:translateZ(0) which makes it the
    containing block for position:fixed children. Modals placed inside .content-viewport
    therefore fill only the right column, not the full viewport (sidebar excluded).
    On mobile (<768px) the transform is removed, so modals are viewport-relative and
    cover the full screen (including over the bottom nav bar) as expected.
-->
<div class="app-root bg-background">
	<!-- Subtle gradient overlay -->
	<div class="fixed inset-0 bg-gradient-subtle pointer-events-none z-0"></div>
	<!-- Noise/dither for depth -->
	<div class="fixed inset-0 bg-dither pointer-events-none opacity-40 z-0"></div>

	<div class="relative z-10 app-root-inner">
		<NavigationProgress />

		{#if isReachKit}
			<!-- ── ReachKit: bare layout, no chrome ── -->
			{@render children()}

		{:else if useSidebarLayout}
			<!-- ── Sidebar layout: sidebar (desktop) + right column ── -->
			<div class="app-shell">
				<AppSidebar onGetStarted={openGetStartedModal} onOpenSearch={() => (searchOpen = true)} />

				<div class="right-column">
					<!-- Offline banner: outside the scroll area so it's always visible -->
					{#if !online}
						<div class="offline-banner">
							<span class="offline-icon">📡</span>
							<span>You're offline — showing cached data</span>
						</div>
					{/if}

					<!--
						content-viewport: the modal containing block.
						overflow:hidden + transform:translateZ(0) (desktop) scopes position:fixed children.
						The actual scrolling happens on content-scroll inside.
					-->
					<div class="content-viewport">
						<div class="content-scroll" data-scroll-container>
							<main class="page-content">
								{@render children()}
							</main>
						</div>

					<!--
						Modals inside content-viewport so they respect the desktop modal-scoping
						transform (fills right column only). On mobile they cover the full screen.
					-->
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
				</div>
			</div>
		</div>

		<!--
			SearchModal is outside content-viewport so it covers the full viewport
			(including the sidebar) and is properly centered on screen.
		-->
		<SearchModal bind:open={searchOpen} bind:searchQuery />

	{:else}
			<!-- ── Marketing layout: landing / studio pages ── -->
			{#if !isDetailPage}
				<Header
					variant={headerVariant}
					pageTitle={isBrowsePage || pageTitle === 'Profile' ? pageTitle : ''}
				/>
			{/if}

			{#if !online}
				<div class="offline-banner offline-banner-marketing">
					<span class="offline-icon">📡</span>
					<span>You're offline — showing cached data</span>
				</div>
			{/if}

			<main class="flex-1 main-content" class:has-header={!isDetailPage}>
				{@render children()}
			</main>

			{#if !isDetailPage && path !== '/apps'}
				<Footer />
			{/if}
		{/if}
	</div>
</div>

<style>
	/* ── Root ─────────────────────────────────────────────────────────────── */
	.app-root {
		min-height: 100dvh;
		position: relative;
	}

	.app-root-inner {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}

	/* ── App shell (sidebar layout) ───────────────────────────────────────── */
	.app-shell {
		display: flex;
		flex-direction: row;
		height: 100dvh;
		overflow: hidden;
	}

	/* Right side of the shell: stacks content-viewport + mobile bottom nav */
	.right-column {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		overflow: hidden;
	}

	/*
	  content-viewport: the scoping container for modals.

	  overflow:hidden ensures the element's visual box has fixed dimensions
	  (does not grow with scrollable content), which is required for the
	  transform trick to scope position:fixed children correctly.

	  On desktop only: transform:translateZ(0) creates a new containing block
	  so that position:fixed children are positioned relative to this element
	  instead of the viewport — modals fill the right column, not the full screen.

	  On mobile: no transform, so modals are viewport-relative (full-screen).
	*/
	.content-viewport {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		overflow: hidden;
		min-height: 0;
	}

	@media (min-width: 768px) {
		.content-viewport {
			transform: translateZ(0);
		}
	}

	/* The actual scrollable area — a child of content-viewport */
	.content-scroll {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		overflow-anchor: auto;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.page-content {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	/* ── Offline banner ───────────────────────────────────────────────────── */
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
		flex-shrink: 0;
		z-index: 10;
	}

	.offline-icon {
		font-size: 1rem;
	}

	/* ── Marketing layout ─────────────────────────────────────────────────── */
	.has-header {
		padding-top: 64px;
	}
</style>
