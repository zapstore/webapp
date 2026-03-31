/**
 * Apps Store — liveQuery display + relay-backed pagination
 *
 * Architecture:
 *   - Dexie liveQuery is the single client-side source of truth for display.
 *     Apps are ordered by created_at. The server seeds apps in release-recency
 *     order, so initial display reflects that ranking.
 *
 *   - Loading uses direct relay queries — no server API endpoint.
 *     Pattern: query releases (30063) for ordering → extract app IDs →
 *     query apps (32267) → apps go to Dexie → liveQuery re-fires → UI updates.
 *
 *   - Live subscription (started in +layout.svelte) streams new events into
 *     Dexie continuously. No periodic refresh needed.
 *
 * Exports:
 *   - createAppsQuery()     — liveQuery observable (subscribe in $effect)
 *   - seedEvents(events)    — write SSR seed to Dexie
 *   - loadMoreApps()        — fetch next page from relay
 *   - getHasMore() / isLoadingMore() — pagination state
 */
import { liveQuery } from 'dexie';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { putEvents, queryEvents } from '$lib/nostr/dexie';
import { parseApp } from '$lib/nostr/models';
import { fetchFromRelays } from '$lib/nostr/service';
import { EVENT_KINDS, PLATFORM_FILTER, ZAPSTORE_RELAY } from '$lib/config';
import { APPS_PAGE_SIZE } from '$lib/constants';

const platformTag = PLATFORM_FILTER['#f']?.[0];

// ============================================================================
// Reactive State (pagination only — display comes from liveQuery)
// ============================================================================

/** Release-based cursor for relay pagination (created_at of oldest fetched release) */
let _cursor = $state(null);

/** More pages available from relay */
let _hasMore = $state(true);

/** Currently fetching a page */
let _loadingMore = $state(false);

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

function getReleaseIdentifier(event) {
	const iTag = event.tags?.find((t) => t[0] === 'i' && typeof t[1] === 'string');
	if (iTag) return iTag[1];
	const dTag = event.tags?.find((t) => t[0] === 'd' && typeof t[1] === 'string');
	if (!dTag) return null;
	const [identifier] = dTag[1].split('@');
	return identifier || null;
}

/**
 * Returns a Dexie liveQuery observable for all apps ordered by created_at.
 *
 * The server seeds apps in release-recency order, so initial display reflects
 * that ranking. As new app events arrive (live subscription, load-more),
 * liveQuery re-fires and includes them automatically.
 */
export function createAppsQuery() {
	return liveQuery(async () => {
		const appFilter = { kinds: [EVENT_KINDS.APP] };
		if (platformTag) appFilter['#f'] = [platformTag];
		const appEvents = await queryEvents(appFilter);

		const appsByKey = new SvelteMap();
		for (const app of appEvents) {
			const dTag = app.tags?.find((t) => t[0] === 'd')?.[1];
			if (!dTag) continue;
			const key = `${app.pubkey}:${dTag}`;
			const existing = appsByKey.get(key);
			if (!existing || app.created_at > existing.created_at) {
				appsByKey.set(key, app);
			}
		}

		return [...appsByKey.values()]
			.sort((a, b) => b.created_at - a.created_at)
			.map(parseApp);
	});
}

// ============================================================================
// Seed — write SSR events to Dexie
// ============================================================================

/**
 * Seed events into Dexie (non-blocking).
 * Called on hydration with SSR seed events.
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
// Pagination — direct relay queries
// ============================================================================

/**
 * Fetch the next page of apps from relay.
 *
 * Pattern: query releases (30063) for ordering → extract app identifiers →
 * batch-query apps (32267) not yet in Dexie → all written to Dexie →
 * liveQuery picks them up automatically.
 */
export async function loadMoreApps() {
	if (_loadingMore || !_hasMore) return;
	if (typeof window === 'undefined' || !navigator.onLine) return;

	_loadingMore = true;

	try {
		const relayFilter = {
			kinds: [EVENT_KINDS.RELEASE],
			limit: APPS_PAGE_SIZE
		};
		if (_cursor != null) relayFilter.until = _cursor;

		const releaseEvents = await fetchFromRelays(
			[ZAPSTORE_RELAY], relayFilter, { feature: 'load-more-releases' }
		);

		if (releaseEvents.length === 0) {
			_hasMore = false;
			return;
		}

		const seen = new SvelteSet();
		const missingIdentifiers = [];
		const missingAuthors = [];

		for (const ev of releaseEvents) {
			const identifier = getReleaseIdentifier(ev);
			if (!identifier || seen.has(identifier)) continue;
			seen.add(identifier);

			const aTag = ev.tags?.find((t) => t[0] === 'a')?.[1] ?? '';
			const parts = aTag.split(':');
			const appPubkey = parts[1];
			const appD = parts.slice(2).join(':');
			if (!appPubkey || !appD) continue;

			const existing = await queryEvents({
				kinds: [EVENT_KINDS.APP],
				authors: [appPubkey],
				'#d': [appD],
				limit: 1
			});
			if (existing.length === 0) {
				missingIdentifiers.push(appD);
				missingAuthors.push(appPubkey);
			}
		}

		if (missingIdentifiers.length > 0) {
			await fetchFromRelays(
				[ZAPSTORE_RELAY],
				{
					kinds: [EVENT_KINDS.APP],
					authors: [...new Set(missingAuthors)],
					'#d': [...new Set(missingIdentifiers)],
					...PLATFORM_FILTER,
					limit: missingIdentifiers.length + 10
				},
				{ feature: 'load-more-apps' }
			);
		}

		const minCreated = Math.min(...releaseEvents.map((e) => e.created_at));
		_cursor = minCreated - 1;
		_hasMore = releaseEvents.length >= APPS_PAGE_SIZE;
	} catch (err) {
		console.error('[AppsStore] Load more failed:', err);
	} finally {
		_loadingMore = false;
	}
}
