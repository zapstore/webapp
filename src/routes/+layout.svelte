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
import NavigationProgress from '$lib/components/layout/NavigationProgress.svelte';
import '../app.css';
let { children } = $props();
let online = $derived(isOnline());
const path = $derived($page.url.pathname);
let isClearingLocalData = $state(false);
// Marketing pages show the footer
let showFooter = $derived(
	path === '/' ||
	path === '/discover' ||
	path === '/studio' ||
	path.startsWith('/studio/') ||
	path === '/blog' ||
	path.startsWith('/blog/') ||
	path === '/docs' ||
	path.startsWith('/docs/')
);
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

<div class="app-root bg-background">
	<!-- Subtle gradient overlay -->
	<div class="fixed inset-0 bg-gradient-subtle pointer-events-none z-0"></div>
	<!-- Noise/dither for depth -->
	<div class="fixed inset-0 bg-dither pointer-events-none opacity-40 z-0"></div>

	<div class="relative z-10 app-root-inner">
		<NavigationProgress />

		<Header variant="landing" />

		{#if !online}
			<div class="offline-banner">
				<span class="offline-icon">📡</span>
				<span>You're offline — showing cached data</span>
			</div>
		{/if}

		<main class="flex-1 main-content has-header">
			{@render children()}
		</main>

		{#if showFooter}
			<Footer />
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

	/* ── Header offset ────────────────────────────────────────────────────── */
	.has-header {
		padding-top: 64px;
	}
</style>
