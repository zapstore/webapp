/**
 * Reactive Apps Store
 *
 * Provides reactive access to app data with cursor-based pagination.
 * Uses Dexie liveQuery for automatic UI updates when data changes.
 *
 * Data flow:
 * 1. Initialize with prerendered data (seed events → Dexie)
 * 2. Background fetch from server API → writes to Dexie → liveQuery → UI
 * 3. Load More fetches next page → writes to Dexie
 */
import { setBackgroundRefreshing } from '$lib/stores/refresh-indicator.svelte.js';
import { putEvents } from '$lib/nostr/dexie';

const PAGE_SIZE = 24;

// ============================================================================
// Reactive State
// ============================================================================

/** Apps list - ordered by release recency */
let apps = $state([]);
/** Cursor for next page (timestamp) */
let cursor = $state(null);
/** Whether more apps are available */
let hasMore = $state(true);
/** Loading state for "Load More" */
let loadingMore = $state(false);
/** Refreshing in background */
let refreshing = $state(false);
/** Whether store has been initialized with prerendered data */
let initialized = $state(false);
/** Set of seen app keys for deduplication */
const seenApps = new Set();

// ============================================================================
// Public Reactive Getters
// ============================================================================

export function getApps() {
	return apps;
}
export function getHasMore() {
	return hasMore;
}
export function isLoadingMore() {
	return loadingMore;
}
export function isRefreshing() {
	return refreshing;
}
export function isStoreInitialized() {
	return initialized;
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Initialize with prerendered data.
 * Writes seed events to Dexie for local-first caching.
 */
export function initWithPrerenderedData(prerenderedApps, nextCursor, seedEvents = []) {
	apps = prerenderedApps;
	cursor = nextCursor;
	hasMore = nextCursor !== null;

	seenApps.clear();
	for (const app of prerenderedApps) {
		seenApps.add(`${app.pubkey}:${app.dTag}`);
	}

	initialized = true;

	// Write seed events to Dexie (non-blocking)
	if (seedEvents.length > 0) {
		putEvents(seedEvents).catch((err) =>
			console.error('[AppsStore] Seed persist failed:', err)
		);
	}
}

/**
 * Fetch apps page from server API.
 */
async function fetchAppsPageFromServer(limit, nextCursor) {
	const params = new URLSearchParams({ limit: String(limit) });
	if (nextCursor !== undefined && nextCursor !== null) {
		params.set('cursor', String(nextCursor));
	}

	const response = await fetch(`/api/apps?${params.toString()}`);
	if (!response.ok) {
		throw new Error(`Apps API failed: ${response.status}`);
	}

	return response.json();
}

/**
 * Refresh first page from server (background, non-blocking).
 */
export async function refreshFromRelays() {
	if (refreshing) return;
	if (typeof window === 'undefined' || !navigator.onLine) return;

	refreshing = true;
	setBackgroundRefreshing(true);

	try {
		const { apps: freshApps, nextCursor, seedEvents = [] } = await fetchAppsPageFromServer(PAGE_SIZE);

		// Write seed events to Dexie
		if (seedEvents.length > 0) {
			await putEvents(seedEvents).catch(() => {});
		}

		if (freshApps.length > 0) {
			const parsed = [];
			const newSeen = new Set();

			for (const app of freshApps) {
				const key = `${app.pubkey}:${app.dTag}`;
				if (!newSeen.has(key)) {
					newSeen.add(key);
					parsed.push(app);
				}
			}

			apps = parsed;
			cursor = nextCursor;
			hasMore = nextCursor !== null;

			seenApps.clear();
			for (const key of newSeen) seenApps.add(key);
		}
	} catch (err) {
		console.error('[AppsStore] Refresh failed:', err);
	} finally {
		refreshing = false;
		setBackgroundRefreshing(false);
	}
}

/**
 * Load more apps (next page).
 */
export async function loadMore() {
	if (loadingMore || !hasMore || cursor === null) return;
	if (typeof window === 'undefined' || !navigator.onLine) return;

	loadingMore = true;

	try {
		const { apps: moreApps, nextCursor, seedEvents = [] } = await fetchAppsPageFromServer(PAGE_SIZE, cursor);

		if (seedEvents.length > 0) {
			await putEvents(seedEvents).catch(() => {});
		}

		if (moreApps.length > 0) {
			const newApps = [];
			for (const app of moreApps) {
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
		console.error('[AppsStore] Load more failed:', err);
	} finally {
		loadingMore = false;
	}
}

/**
 * Schedule background refresh.
 */
export function scheduleRefresh() {
	if (typeof window === 'undefined') return;
	const schedule =
		'requestIdleCallback' in window
			? window.requestIdleCallback
			: (cb) => setTimeout(cb, 1);
	schedule(() => {
		refreshFromRelays();
	});
}

/**
 * Reset store state.
 */
export function resetStore() {
	apps = [];
	cursor = null;
	hasMore = true;
	loadingMore = false;
	refreshing = false;
	initialized = false;
	seenApps.clear();
}
