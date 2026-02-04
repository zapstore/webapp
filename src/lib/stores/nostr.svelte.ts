/**
 * Reactive Nostr Store
 *
 * Provides reactive access to app data with cursor-based pagination.
 * Aligned with FEAT-001 spec:
 * - Apps ordered by release recency (most recent release first)
 * - Cursor-based pagination via "Load More" button
 * - Background refresh updates UI reactively
 *
 * @see spec/features/FEAT-001-apps-listing.md
 */

import { initNostrService, fetchAppsByReleases } from '$lib/nostr/service';
import { parseApp, type App } from '$lib/nostr/models';
import { DEFAULT_CATALOG_RELAYS } from '$lib/config';

const PAGE_SIZE = 24; // Fetch extra to account for duplicates, ensures ~16+ unique apps

// ============================================================================
// Reactive State
// ============================================================================

/** Apps list - ordered by release recency */
let apps = $state<App[]>([]);

/** Cursor for next page (timestamp) */
let cursor = $state<number | null>(null);

/** Whether more apps are available */
let hasMore = $state(true);

/** Loading state for "Load More" */
let loadingMore = $state(false);

/** Refreshing from relays in background */
let refreshing = $state(false);

/** Whether store has been initialized with prerendered data */
let initialized = $state(false);

/** Set of seen app keys for deduplication */
const seenApps = new Set<string>();

// ============================================================================
// Public Reactive Getters
// ============================================================================

export function getApps(): App[] {
	return apps;
}

export function getHasMore(): boolean {
	return hasMore;
}

export function isLoadingMore(): boolean {
	return loadingMore;
}

export function isRefreshing(): boolean {
	return refreshing;
}

export function isStoreInitialized(): boolean {
	return initialized;
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Initialize with prerendered data.
 * Call this on page load with SSG data.
 */
export function initWithPrerenderedData(prerenderedApps: App[], nextCursor: number | null): void {
	apps = prerenderedApps;
	cursor = nextCursor;
	hasMore = nextCursor !== null;
	
	// Track seen apps for deduplication
	seenApps.clear();
	for (const app of prerenderedApps) {
		seenApps.add(`${app.pubkey}:${app.dTag}`);
	}
	
	// Mark store as initialized (client now owns the data)
	initialized = true;
}

/**
 * Refresh first page from relays (background, non-blocking).
 * Updates UI reactively as data arrives.
 */
export async function refreshFromRelays(): Promise<void> {
	if (refreshing) return;
	if (typeof window === 'undefined' || !navigator.onLine) return;

	refreshing = true;

	try {
		await initNostrService();

		const { apps: freshApps, nextCursor } = await fetchAppsByReleases(
			[...DEFAULT_CATALOG_RELAYS],
			PAGE_SIZE
		);

		if (freshApps.length > 0) {
			// Parse and deduplicate, maintaining release order
			const parsed: App[] = [];
			const newSeen = new Set<string>();

			for (const event of freshApps) {
				const app = parseApp(event);
				const key = `${app.pubkey}:${app.dTag}`;
				if (!newSeen.has(key)) {
					newSeen.add(key);
					parsed.push(app);
				}
			}

			// Replace apps list with fresh data (maintains release order)
			apps = parsed;
			cursor = nextCursor;
			hasMore = nextCursor !== null;

			// Update seen set
			seenApps.clear();
			for (const key of newSeen) {
				seenApps.add(key);
			}
		}
	} catch (err) {
		console.error('[NostrStore] Refresh failed:', err);
	} finally {
		refreshing = false;
	}
}

/**
 * Load more apps (next page) from relays.
 * Uses cursor-based pagination per FEAT-001 spec.
 */
export async function loadMore(): Promise<void> {
	if (loadingMore || !hasMore || cursor === null) return;
	if (typeof window === 'undefined' || !navigator.onLine) return;

	loadingMore = true;

	try {
		await initNostrService();

		const { apps: moreApps, nextCursor } = await fetchAppsByReleases(
			[...DEFAULT_CATALOG_RELAYS],
			PAGE_SIZE,
			cursor
		);

		if (moreApps.length > 0) {
			// Parse and add only new apps (not seen before)
			const newApps: App[] = [];

			for (const event of moreApps) {
				const app = parseApp(event);
				const key = `${app.pubkey}:${app.dTag}`;
				if (!seenApps.has(key)) {
					seenApps.add(key);
					newApps.push(app);
				}
			}

			if (newApps.length > 0) {
				apps = [...apps, ...newApps];
			}
		}

		cursor = nextCursor;
		hasMore = nextCursor !== null;
	} catch (err) {
		console.error('[NostrStore] Load more failed:', err);
	} finally {
		loadingMore = false;
	}
}

/**
 * Schedule background refresh using requestIdleCallback.
 */
export function scheduleRefresh(): void {
	if (typeof window === 'undefined') return;

	const schedule =
		'requestIdleCallback' in window
			? window.requestIdleCallback
			: (cb: () => void) => setTimeout(cb, 1);

	schedule(() => {
		refreshFromRelays();
	});
}

/**
 * Reset store state (for testing or cleanup).
 */
export function resetStore(): void {
	apps = [];
	cursor = null;
	hasMore = true;
	loadingMore = false;
	refreshing = false;
	initialized = false;
	seenApps.clear();
}
