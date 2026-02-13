/**
 * Apps Store — liveQuery + Relay-backed pagination
 *
 * Architecture: Dexie liveQuery is the single client-side source of truth.
 * All queries use queryEvents() with NIP-01 filters — the universal query DSL.
 *
 * This store provides:
 *   - createAppsQuery() → liveQuery observable (subscribe in component $effect)
 *   - Pagination state (cursor, hasMore, loadingMore)
 *   - Actions that write to Dexie (liveQuery updates UI automatically)
 *
 * Data flow:
 *   1. liveQuery reads from Dexie via queryEvents() → UI renders immediately (local-first)
 *   2. Seed events / relay stream → putEvents → Dexie → liveQuery re-fires → UI updates
 */
import { liveQuery } from 'dexie';
import { putEvents, queryEvents } from '$lib/nostr/dexie';
import { parseApp } from '$lib/nostr/models';
import { EVENT_KINDS, PLATFORM_FILTER } from '$lib/config';

const platformTag = PLATFORM_FILTER['#f']?.[0];

// ============================================================================
// Reactive State (pagination/UI only — data comes from liveQuery)
// ============================================================================

let cursor = $state(null);
let hasMore = $state(true);
let loadingMore = $state(false);

// ============================================================================
// Public Reactive Getters
// ============================================================================

export function getHasMore() {
	return hasMore;
}
export function isLoadingMore() {
	return loadingMore;
}

// ============================================================================
// liveQuery — Reactive data from Dexie via NIP-01 filters
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
 * Any write to Dexie automatically updates all subscribers.
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
 * Load more apps by querying relays for older releases.
 * The fetched events are written to Dexie; liveQuery picks them up automatically.
 *
 * @param {function} fetchFromRelays - relay fetch function from service.js
 * @param {string[]} relayUrls - relay URLs to query
 */
export async function loadMore(fetchFromRelays, relayUrls) {
	if (loadingMore || !hasMore || cursor === null) return;
	if (typeof window === 'undefined' || !navigator.onLine) return;

	loadingMore = true;

	try {
		const filter = {
			kinds: [EVENT_KINDS.RELEASE],
			until: cursor,
			limit: 24
		};
		const events = await fetchFromRelays(relayUrls, filter);

		if (events.length > 0) {
			const lastEvent = events[events.length - 1];
			cursor = lastEvent.created_at - 1;
			hasMore = events.length >= 24;
		} else {
			hasMore = false;
		}
	} catch (err) {
		console.error('[AppsStore] Load more failed:', err);
	} finally {
		loadingMore = false;
	}
}
