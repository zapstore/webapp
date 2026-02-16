/**
 * Apps Store — liveQuery display + API-backed pagination + periodic refresh
 *
 * Architecture:
 *   - Dexie liveQuery is the single client-side source of truth for display.
 *     It orders apps by release recency (two-step: releases → apps in Dexie).
 *
 *   - LOADING comes from /api/apps (SSR seed + load-more + periodic refresh).
 *     The API returns both app events (32267) and their latest release (30063)
 *     so the client has everything it needs for release-ordered display.
 *
 *   - All events → putEvents → Dexie → liveQuery re-fires → UI updates.
 *     No separate ordered state. Dexie handles dedup. liveQuery handles reactivity.
 *
 *   - Every POLL_INTERVAL_MS (60s), page 0 is re-fetched from /api/apps to keep
 *     the listing fresh (new apps, updated rankings).
 *
 * Exports:
 *   - createAppsQuery()                 — liveQuery observable (subscribe in $effect)
 *   - seedEvents(events)               — write SSR seed to Dexie
 *   - initPagination(cursor, hasMore)  — set cursor from SSR response
 *   - loadMoreApps()                   — fetch next page from /api/apps
 *   - startAppsRefresh() / stopAppsRefresh() — 60s page-0 refresh timer
 *   - getHasMore() / isLoadingMore()   — pagination state
 */
import { liveQuery } from 'dexie';
import { putEvents, queryEvents } from '$lib/nostr/dexie';
import { parseApp } from '$lib/nostr/models';
import { fetchReleasesFromRelays, fetchAppFromRelays } from '$lib/nostr/service';
import { EVENT_KINDS, PLATFORM_FILTER, POLL_INTERVAL_MS, DEFAULT_CATALOG_RELAYS } from '$lib/config';
import { APPS_PAGE_SIZE } from '$lib/constants';

const platformTag = PLATFORM_FILTER['#f']?.[0];

// ============================================================================
// Reactive State (pagination only — display comes from liveQuery)
// ============================================================================

/** Release-based cursor for /api/apps pagination */
let _cursor = $state(null);

/** More pages available from API */
let _hasMore = $state(true);

/** Currently fetching a page */
let _loadingMore = $state(false);

/** Periodic refresh timer handle */
let _refreshTimer = null;

// ============================================================================
// Public Reactive Getters
// ============================================================================

export function getHasMore() {
	return _hasMore;
}
export function isLoadingMore() {
	return _loadingMore;
}

// ============================================================================
// liveQuery — Reactive display from Dexie
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
 *
 * Uses two sequential NIP-01 queries:
 *   1. Releases (kind 30063) → extract app identifiers
 *   2. Apps (kind 32267) matching those identifiers + platform filter
 *
 * Any write to Dexie (from SSR seed, /api/apps, or relay subscriptions)
 * automatically updates all subscribers.
 */
export function createAppsQuery() {
	return liveQuery(async () => {
		// Query 1: releases sorted by recency (NIP-01 filter)
		const releases = await queryEvents({ kinds: [EVENT_KINDS.RELEASE] });

		if (releases.length === 0) return [];

		// Extract app identifiers from releases
		const identifiers = [];
		const seen = new Set();
		for (const release of releases) {
			const id = getReleaseIdentifier(release);
			if (id && !seen.has(id)) {
				seen.add(id);
				identifiers.push(id);
			}
		}

		if (identifiers.length === 0) return [];

		// Query 2: apps matching those identifiers (NIP-01 filter with #d tag)
		const appFilter = { kinds: [EVENT_KINDS.APP], '#d': identifiers };
		if (platformTag) appFilter['#f'] = [platformTag];
		const appEvents = await queryEvents(appFilter);

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
// Seed — write SSR events to Dexie
// ============================================================================

/**
 * Seed events into Dexie (non-blocking).
 * Called on hydration with SSR seed events (apps + releases).
 */
export function seedEvents(events) {
	if (events && events.length > 0) {
		return putEvents(events).catch((err) =>
			console.error('[AppsStore] Seed persist failed:', err)
		);
	}
	return Promise.resolve();
}

// ============================================================================
// Pagination — set cursor from SSR, load more from API
// ============================================================================

/**
 * Initialize pagination cursor from SSR response.
 * Called once on mount — subsequent calls are no-ops.
 */
export function initPagination(cursor, hasMore) {
	if (_cursor === null) {
		_cursor = cursor ?? null;
		_hasMore = hasMore ?? true;
	}
}

/**
 * Fetch the next page of apps + releases from /api/apps.
 * Events are written to Dexie; liveQuery picks them up automatically.
 *
 * If no cursor is set (client-side nav without SSR), fetches page 0.
 */
export async function loadMoreApps() {
	if (_loadingMore || !_hasMore) return;
	if (typeof window === 'undefined' || !navigator.onLine) return;

	_loadingMore = true;

	try {
		const params = new URLSearchParams({ limit: String(APPS_PAGE_SIZE) });
		if (_cursor != null) params.set('cursor', String(_cursor));

		const res = await fetch(`/api/apps?${params}`);
		if (!res.ok) throw new Error(`API error: ${res.status}`);
		const data = await res.json();

		if (data.events?.length > 0) {
			await putEvents(data.events).catch((err) =>
				console.error('[AppsStore] Load more persist failed:', err)
			);
			_cursor = data.cursor ?? null;
			_hasMore = data.hasMore ?? true;
			// When API says no more, try relays once (server cache may be limited)
			if (data.hasMore === false && _cursor != null) {
				try {
					const releaseEvents = await fetchReleasesFromRelays(DEFAULT_CATALOG_RELAYS, {
						limit: APPS_PAGE_SIZE,
						until: _cursor
					});
					if (releaseEvents.length > 0) {
						await putEvents(releaseEvents).catch(() => {});
						const seen = new Set();
						for (const ev of releaseEvents) {
							const aTag = ev.tags?.find((t) => t[0] === 'a')?.[1] ?? '';
							const parts = aTag.split(':');
							const appPubkey = parts[1];
							const appD = parts[2];
							if (!appPubkey || !appD) continue;
							const key = `${appPubkey}:${appD}`;
							if (seen.has(key)) continue;
							seen.add(key);
							const existing = await queryEvents({
								kinds: [32267],
								authors: [appPubkey],
								'#d': [appD],
								limit: 1
							});
							if (existing.length === 0) {
								const appEv = await fetchAppFromRelays(DEFAULT_CATALOG_RELAYS, appPubkey, appD);
								if (appEv) await putEvents([appEv]).catch(() => {});
							}
						}
						const minCreated = Math.min(...releaseEvents.map((e) => e.created_at));
						_cursor = minCreated;
						_hasMore = releaseEvents.length >= APPS_PAGE_SIZE;
					} else {
						_hasMore = false;
					}
				} catch (e) {
					console.error('[AppsStore] Relay fallback (after API hasMore false) failed:', e);
					_hasMore = false;
				}
			}
		} else {
			// API cache exhausted — try relays for next page (releases + ensure apps in Dexie)
			if (_cursor != null) {
				try {
					const releaseEvents = await fetchReleasesFromRelays(DEFAULT_CATALOG_RELAYS, {
						limit: APPS_PAGE_SIZE,
						until: _cursor
					});
					if (releaseEvents.length > 0) {
						await putEvents(releaseEvents).catch(() => {});
						const seen = new Set();
						for (const ev of releaseEvents) {
							const aTag = ev.tags?.find((t) => t[0] === 'a')?.[1] ?? '';
							const parts = aTag.split(':');
							const appPubkey = parts[1];
							const appD = parts[2];
							if (!appPubkey || !appD) continue;
							const key = `${appPubkey}:${appD}`;
							if (seen.has(key)) continue;
							seen.add(key);
							const existing = await queryEvents({
								kinds: [32267],
								authors: [appPubkey],
								'#d': [appD],
								limit: 1
							});
							if (existing.length === 0) {
								const appEv = await fetchAppFromRelays(DEFAULT_CATALOG_RELAYS, appPubkey, appD);
								if (appEv) await putEvents([appEv]).catch(() => {});
							}
						}
						const minCreated = Math.min(...releaseEvents.map((e) => e.created_at));
						_cursor = minCreated;
						_hasMore = releaseEvents.length >= APPS_PAGE_SIZE;
					} else {
						_hasMore = false;
					}
				} catch (e) {
					console.error('[AppsStore] Relay fallback failed:', e);
					_hasMore = false;
				}
			} else {
				_hasMore = false;
			}
		}
	} catch (err) {
		console.error('[AppsStore] Load more failed:', err);
	} finally {
		_loadingMore = false;
	}
}

// ============================================================================
// Periodic Refresh — re-fetch page 0 every POLL_INTERVAL_MS
// ============================================================================

/**
 * Silently re-fetch page 0 from /api/apps.
 * New/updated events go into Dexie; liveQuery handles the rest.
 */
async function refreshPage0() {
	if (typeof window === 'undefined' || !navigator.onLine) return;
	try {
		const res = await fetch(`/api/apps?limit=${APPS_PAGE_SIZE}`);
		if (!res.ok) return;
		const data = await res.json();
		if (data.events?.length > 0) {
			await putEvents(data.events).catch(() => {});
		}
	} catch {
		// Silent — network may be unavailable
	}
}

/**
 * Start the periodic page-0 refresh timer.
 * Call on component mount. Idempotent.
 */
export function startAppsRefresh() {
	if (_refreshTimer) return;
	_refreshTimer = setInterval(refreshPage0, POLL_INTERVAL_MS);
}

/**
 * Stop the periodic refresh timer.
 * Call on component destroy.
 */
export function stopAppsRefresh() {
	if (_refreshTimer) {
		clearInterval(_refreshTimer);
		_refreshTimer = null;
	}
}
