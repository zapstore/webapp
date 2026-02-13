<script lang="js">
import { onMount } from 'svelte';
import { browser, dev } from '$app/environment';
import { page } from '$app/stores';
import { initAuth } from '$lib/stores/auth.svelte.js';
import { initCatalogs } from '$lib/stores/catalogs.svelte.js';
import { initOnlineStatus, isOnline } from '$lib/stores/online.svelte.js';
import { startProfileSearchBackground } from '$lib/services/profile-search';
import { startLiveSubscriptions, stopLiveSubscriptions } from '$lib/nostr/service';
import { evictOldEvents } from '$lib/nostr/dexie';
import { IDB_NAME } from '$lib/config';
import Header from '$lib/components/layout/Header.svelte';
import Footer from '$lib/components/layout/Footer.svelte';
import NavigationProgress from '$lib/components/layout/NavigationProgress.svelte';
import '../app.css';
let { children } = $props();
let online = $derived(isOnline());
const path = $derived($page.url.pathname);
let isClearingLocalData = $state(false);
// ReachKit has its own layout (header + footer)
let isReachKit = $derived(path.startsWith('/studio/reachkit'));
// Determine header variant based on route
let isLandingPage = $derived(path === '/');
let isBrowsePage = $derived(path === '/discover' ||
    path === '/apps' ||
    path === '/stacks' ||
    path === '/studio' ||
    path === '/search');
// Detail pages use their own contextual header (app and stack only; profile uses normal header)
let isDetailPage = $derived(/^\/apps\/[^/]+$/.test(path) || /^\/stacks\/[^/]+$/.test(path));
let headerVariant = $derived(isLandingPage ? 'landing' : path === '/studio' ? 'studio' : 'browse');
// Determine page title for browse/studio/profile variant
let pageTitle = $derived(path === '/discover'
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
                        : '');
onMount(() => {
    if (browser) {
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

			{#if dev && !isReachKit}
				<div class="cache-bust-control">
					<button
						type="button"
						class="btn-secondary-small"
						onclick={clearAllLocalCaches}
						disabled={isClearingLocalData}
						title="Temporary dev tool: clear IndexedDB + caches"
					>
						{isClearingLocalData ? 'Clearing...' : 'Bust local cache'}
					</button>
				</div>
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

	.cache-bust-control {
		position: fixed;
		right: 1rem;
		bottom: 1rem;
		z-index: 1200;
	}

</style>
