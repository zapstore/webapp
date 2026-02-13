/**
 * Apps Store — liveQuery + Pagination
 *
 * Architecture-compliant: Dexie liveQuery is the single client-side source of truth.
 *
 * This store provides:
 *   - createAppsQuery() → liveQuery observable (subscribe in component $effect)
 *   - Pagination state (cursor, hasMore, loadingMore, refreshing)
 *   - Actions that write to Dexie (liveQuery updates UI automatically)
 *
 * Data flow:
 *   1. liveQuery reads from Dexie → UI renders immediately (local-first)
 *   2. Seed events / API fetch → write to Dexie → liveQuery re-fires → UI updates
 */
import { liveQuery } from 'dexie';
import { setBackgroundRefreshing } from '$lib/stores/refresh-indicator.svelte.js';
import { db, putEvents } from '$lib/nostr/dexie';
import { parseApp } from '$lib/nostr/models';
import { EVENT_KINDS, PLATFORM_FILTER } from '$lib/config';

const PAGE_SIZE = 24;
const platformTag = PLATFORM_FILTER['#f']?.[0];

// ============================================================================
// Reactive State (pagination/UI only — data comes from liveQuery)
// ============================================================================

let cursor = $state(null);
let hasMore = $state(true);
let loadingMore = $state(false);
let refreshing = $state(false);

// ============================================================================
// Public Reactive Getters
// ============================================================================

export function getHasMore() {
	return hasMore;
}
export function isLoadingMore() {
	return loadingMore;
}
export function isRefreshing() {
	return refreshing;
}

// ============================================================================
// liveQuery — Reactive data from Dexie
// ============================================================================

/**
 * Extract app identifier from a release event.
 */
function getReleaseIdentifier(event) {
	const iTag = event.tags?.find((t) => t[0] === 'i' && typeof t[1] === 'string');
	if (iTag) return iTag[1];
	const dTag = event.tags?.find((t) => t[0] === 'd' && typeof t[1] === 'string');
	if (!dTag) return null;
	const [identifier] = dTag[1].split('@');
	return identifier || null;
}

/**
 * Returns a Dexie liveQuery observable for apps ordered by release recency.
 * Subscribe in a component $effect for reactive updates.
 * Any write to Dexie automatically updates all subscribers.
 */
export function createAppsQuery() {
	return liveQuery(async () => {
		// Get releases sorted by recency
		const releases = await db.events
			.where('kind')
			.equals(EVENT_KINDS.RELEASE)
			.reverse()
			.sortBy('created_at');

		// Get all app events
		let appEvents = await db.events.where('kind').equals(EVENT_KINDS.APP).toArray();

		// Filter by platform tag
		if (platformTag) {
			appEvents = appEvents.filter((e) =>
				e.tags?.some((t) => t[0] === 'f' && t[1] === platformTag)
			);
		}

		// Index apps by (pubkey:dTag) — keep latest per key
		const appsByKey = new Map();
		for (const app of appEvents) {
			const dTag = app.tags?.find((t) => t[0] === 'd')?.[1];
			if (!dTag) continue;
			const key = `${app.pubkey}:${dTag}`;
			const existing = appsByKey.get(key);
			if (!existing || app.created_at > existing.created_at) {
				appsByKey.set(key, app);
			}
		}

		// Also index by dTag only (for fallback matching)
		const appsByDTag = new Map();
		for (const [key, app] of appsByKey) {
			const dTag = key.split(':').slice(1).join(':');
			if (!appsByDTag.has(dTag)) {
				appsByDTag.set(dTag, app);
			}
		}

		// Order apps by release recency
		const seenApps = new Set();
		const result = [];

		for (const release of releases) {
			const identifier = getReleaseIdentifier(release);
			if (!identifier) continue;

			const exactKey = `${release.pubkey}:${identifier}`;
			const appEvent = appsByKey.get(exactKey) ?? appsByDTag.get(identifier);
			if (!appEvent) continue;

			const appKey = `${appEvent.pubkey}:${identifier}`;
			if (seenApps.has(appKey)) continue;
			seenApps.add(appKey);
			result.push(parseApp(appEvent));
		}

		return result;
	});
}

// ============================================================================
// Actions — write to Dexie, liveQuery handles the rest
// ============================================================================

/**
 * Seed events into Dexie (non-blocking).
 * Called on hydration with prerendered seed events.
 */
export function seedEvents(events) {
	if (events && events.length > 0) {
		return putEvents(events).catch((err) =>
			console.error('[AppsStore] Seed persist failed:', err)
		);
	}
	return Promise.resolve();
}

/**
 * Set initial pagination cursor from prerendered data.
 */
export function initPagination(nextCursor) {
	cursor = nextCursor ?? null;
	hasMore = nextCursor !== null;
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
	if (!response.ok) throw new Error(`Apps API failed: ${response.status}`);
	return response.json();
}

/**
 * Refresh from server API (background).
 * Writes to Dexie → liveQuery updates UI automatically.
 */
export async function refreshFromAPI() {
	if (refreshing) return;
	if (typeof window === 'undefined' || !navigator.onLine) return;

	refreshing = true;
	setBackgroundRefreshing(true);

	try {
		const { nextCursor, seedEvents: events = [] } = await fetchAppsPageFromServer(PAGE_SIZE);
		if (events.length > 0) {
			await putEvents(events);
		}
		cursor = nextCursor;
		hasMore = nextCursor !== null;
	} catch (err) {
		console.error('[AppsStore] Refresh failed:', err);
	} finally {
		refreshing = false;
		setBackgroundRefreshing(false);
	}
}

/**
 * Load more apps (next page → Dexie → liveQuery).
 */
export async function loadMore() {
	if (loadingMore || !hasMore || cursor === null) return;
	if (typeof window === 'undefined' || !navigator.onLine) return;

	loadingMore = true;

	try {
		const { nextCursor, seedEvents: events = [] } = await fetchAppsPageFromServer(
			PAGE_SIZE,
			cursor
		);
		if (events.length > 0) {
			await putEvents(events);
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
		'requestIdleCallback' in window ? window.requestIdleCallback : (cb) => setTimeout(cb, 1);
	schedule(() => refreshFromAPI());
}
