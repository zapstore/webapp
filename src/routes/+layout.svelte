<script lang="js">
import { onMount } from 'svelte';
import { browser } from '$app/environment';
import { page } from '$app/stores';
import { afterNavigate } from '$app/navigation';
import { initAuth, restoreNostrConnectSession } from '$lib/stores/auth.svelte.js';
import { initCatalogs } from '$lib/stores/catalogs.svelte.js';
import { initOnlineStatus } from '$lib/stores/online.svelte.js';
import { startProfileSearchBackground } from '$lib/services/profile-search';
import {
	startLiveSubscriptions,
	stopLiveSubscriptions,
	syncDeletions,
	installZapstoreDebugHooks
} from '$lib/nostr/service';
import { ZAPSTORE_RELAY } from '$lib/config';
import { evictOldEvents } from '$lib/nostr/dexie';
import { IDB_NAME } from '$lib/config';
import { setBackGoesHomeIfLandedFromOutside, clearBackGoesHome } from '$lib/utils/back.js';
import { getCurrentPubkey } from '$lib/stores/auth.svelte.js';
import SiteHeader from '$lib/components/layout/SiteHeader.svelte';
import Footer from '$lib/components/layout/Footer.svelte';
import NavigationProgress from '$lib/components/layout/NavigationProgress.svelte';
import { SHOW_STUDIO_SIGNED_IN_DASHBOARD } from '$lib/constants.js';
import '../app.css';
let { children } = $props();
const path = $derived($page.url.pathname);
let isClearingLocalData = $state(false);
// Hide footer on studio only when the signed-in dashboard is actually being shown
const isStudio = $derived(path === '/studio' || path.startsWith('/studio/'));
const showingStudioDashboard = $derived(isStudio && getCurrentPubkey() !== null && SHOW_STUDIO_SIGNED_IN_DASHBOARD);
let showFooter = $derived(
	(path === '/' ||
		path === '/apps' ||
		path === '/studio' ||
		path.startsWith('/studio/') ||
		path === '/blog' ||
		path.startsWith('/blog/') ||
		path === '/docs' ||
		path.startsWith('/docs/') ||
		path === '/terms') &&
		!showingStudioDashboard
);
onMount(() => {
    let cancelled = false;
    if (browser) {
        setBackGoesHomeIfLandedFromOutside();
        initAuth();
        initOnlineStatus();
        void (async () => {
            await restoreNostrConnectSession();
            if (cancelled) return;
            startLiveSubscriptions();
            installZapstoreDebugHooks();
            if (import.meta.env.DEV) {
                console.info(
                    '[Zapstore] Nostr client started. For relay/Dexie logs: localStorage.setItem("zapstore_debug","1"); location.reload() — then check [Zapstore] lines and globalThis.__zapstore'
                );
            }
            syncDeletions([ZAPSTORE_RELAY]);
            evictOldEvents();
            startProfileSearchBackground();
            initCatalogs();
        })();
    }
    return () => {
        cancelled = true;
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

async function _clearAllLocalCaches() {
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

		<SiteHeader variant="landing" />

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

	/* ── Header offset ────────────────────────────────────────────────────── */
	.has-header {
		padding-top: 64px;
	}
</style>
