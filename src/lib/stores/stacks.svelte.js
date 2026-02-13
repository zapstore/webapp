/**
 * Stacks Store — liveQuery + Relay-backed pagination
 *
 * Architecture: Dexie liveQuery is the single client-side source of truth.
 * All queries use queryEvents() with NIP-01 filters — the universal query DSL.
 *
 * This store provides:
 *   - createStacksQuery() → liveQuery observable for stacks with resolved apps
 *   - Pagination state (cursor, hasMore, loadingMore)
 *   - Actions that write to Dexie (liveQuery updates UI automatically)
 */
import { liveQuery } from 'dexie';
import { putEvents, queryEvents } from '$lib/nostr/dexie';
import { parseApp, parseAppStack } from '$lib/nostr/models';
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

export function getStacksHasMore() {
	return hasMore;
}
export function isStacksLoadingMore() {
	return loadingMore;
}

// ============================================================================
// liveQuery — Reactive data from Dexie via NIP-01 filters
// ============================================================================

/**
 * Returns a Dexie liveQuery observable for stacks with their resolved apps.
 * Each entry is { stack: ParsedStack, apps: ParsedApp[] }.
 * Subscribe in a component $effect for reactive updates.
 *
 * Uses two sequential NIP-01 queries:
 *   1. Stacks (kind 30267) with platform filter
 *   2. Apps (kind 32267) matching stack references
 */
export function createStacksQuery() {
	return liveQuery(async () => {
		// Query 1: stacks (NIP-01 filter)
		const stackFilter = { kinds: [EVENT_KINDS.APP_STACK] };
		if (platformTag) stackFilter['#f'] = [platformTag];
		const stackEvents = await queryEvents(stackFilter);

		if (stackEvents.length === 0) return [];

		// Parse stacks and collect all app references
		const stacks = stackEvents.map(parseAppStack);
		const allIdentifiers = new Set();

		for (const stack of stacks) {
			if (!stack?.appRefs) continue;
			for (const ref of stack.appRefs) {
				if (ref.kind === EVENT_KINDS.APP && ref.identifier) {
					allIdentifiers.add(ref.identifier);
				}
			}
		}

		// Query 2: apps matching stack references (NIP-01 filter with #d tag)
		let appsByKey = new Map();
		if (allIdentifiers.size > 0) {
			const appFilter = { kinds: [EVENT_KINDS.APP], '#d': [...allIdentifiers] };
			if (platformTag) appFilter['#f'] = [platformTag];
			const appEvents = await queryEvents(appFilter);

			// Index apps by (pubkey:dTag)
			for (const app of appEvents) {
				const dTag = app.tags?.find((t) => t[0] === 'd')?.[1];
				if (!dTag) continue;
				const key = `${app.pubkey}:${dTag}`;
				const existing = appsByKey.get(key);
				if (!existing || app.created_at > existing.created_at) {
					appsByKey.set(key, app);
				}
			}
		}

		// Resolve each stack's apps
		return stacks.map((stack) => {
			const apps = [];
			if (stack.appRefs) {
				for (const ref of stack.appRefs) {
					if (ref.kind !== EVENT_KINDS.APP) continue;
					const key = `${ref.pubkey}:${ref.identifier}`;
					const appEvent = appsByKey.get(key);
					if (appEvent) {
						apps.push(parseApp(appEvent));
					}
				}
			}
			return { stack, apps };
		});
	});
}

// ============================================================================
// Actions — write to Dexie, liveQuery handles the rest
// ============================================================================

/**
 * Seed events into Dexie (non-blocking).
 */
export function seedStackEvents(events) {
	if (events && events.length > 0) {
		return putEvents(events).catch((err) =>
			console.error('[StacksStore] Seed persist failed:', err)
		);
	}
	return Promise.resolve();
}

/**
 * Load more stacks by querying relays for older stacks.
 * The fetched events are written to Dexie; liveQuery picks them up automatically.
 *
 * @param {function} fetchFromRelays - relay fetch function from service.js
 * @param {string[]} relayUrls - relay URLs to query
 */
export async function loadMoreStacks(fetchFromRelays, relayUrls) {
	if (loadingMore || !hasMore || cursor === null) return;
	if (typeof window === 'undefined' || !navigator.onLine) return;

	loadingMore = true;

	try {
		const filter = {
			kinds: [EVENT_KINDS.APP_STACK],
			until: cursor,
			limit: 20
		};
		if (platformTag) filter['#f'] = [platformTag];
		const events = await fetchFromRelays(relayUrls, filter);

		if (events.length > 0) {
			const lastEvent = events[events.length - 1];
			cursor = lastEvent.created_at - 1;
			hasMore = events.length >= 20;
		} else {
			hasMore = false;
		}
	} catch (err) {
		console.error('[StacksStore] Load more failed:', err);
	} finally {
		loadingMore = false;
	}
}
