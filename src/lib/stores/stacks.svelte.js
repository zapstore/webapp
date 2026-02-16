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
import { fetchAppFromRelays } from '$lib/nostr/service';
import { EVENT_KINDS, PLATFORM_FILTER, DEFAULT_CATALOG_RELAYS } from '$lib/config';
import { STACKS_PAGE_SIZE } from '$lib/constants';

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

		// Parse stacks and keep only the latest event per (pubkey, dTag)
		const parsed = stackEvents.map(parseAppStack);
		const stacksByKey = new Map();
		for (const stack of parsed) {
			if (!stack?.pubkey || !stack?.dTag) continue;
			const key = `${stack.pubkey}:${stack.dTag}`;
			const existing = stacksByKey.get(key);
			if (!existing || (stack.createdAt != null && stack.createdAt > (existing.createdAt ?? 0))) {
				stacksByKey.set(key, stack);
			}
		}
		const stacks = [...stacksByKey.values()];
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
 * Seed events into Dexie and initialize pagination cursor.
 * Called on mount with SSR-provided seed events.
 */
export function seedStackEvents(events) {
	if (events && events.length > 0) {
		// Initialize cursor from oldest seeded stack (for relay-based load-more)
		if (cursor === null) {
			const stackEvents = events.filter((e) => e.kind === EVENT_KINDS.APP_STACK);
			if (stackEvents.length > 0) {
				const sorted = [...stackEvents].sort((a, b) => b.created_at - a.created_at);
				const oldest = sorted[sorted.length - 1];
				cursor = oldest.created_at - 1;
				hasMore = stackEvents.length >= STACKS_PAGE_SIZE;
			}
		}

		const p = putEvents(events).catch((err) =>
			console.error('[StacksStore] Seed persist failed:', err)
		);
		// Fill in missing app refs in background so stack cards show icons
		(async () => {
			const relayUrls = DEFAULT_CATALOG_RELAYS;
			const seen = new Set();
			for (const ev of events) {
				if (ev.kind !== EVENT_KINDS.APP_STACK) continue;
				const stack = parseAppStack(ev);
				if (!stack?.appRefs) continue;
				for (const ref of stack.appRefs) {
					if (ref.kind !== EVENT_KINDS.APP || !ref.pubkey || !ref.identifier) continue;
					const key = `${ref.pubkey}:${ref.identifier}`;
					if (seen.has(key)) continue;
					seen.add(key);
					try {
						const existing = await queryEvents({
							kinds: [EVENT_KINDS.APP],
							authors: [ref.pubkey],
							'#d': [ref.identifier],
							limit: 1
						});
						if (existing.length === 0) {
							const appEv = await fetchAppFromRelays(relayUrls, ref.pubkey, ref.identifier);
							if (appEv) await putEvents([appEv]).catch(() => {});
						}
					} catch {
						// ignore
					}
				}
			}
		})();
		return p;
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
	if (loadingMore || !hasMore) return;
	if (typeof window === 'undefined' || !navigator.onLine) return;

	loadingMore = true;

	try {
		const filter = {
			kinds: [EVENT_KINDS.APP_STACK],
			limit: STACKS_PAGE_SIZE
		};
		if (cursor != null) filter.until = cursor;
		if (platformTag) filter['#f'] = [platformTag];
		const events = await fetchFromRelays(relayUrls, filter);

		if (events.length > 0) {
			await putEvents(events).catch((err) =>
				console.error('[StacksStore] Load more persist failed:', err)
			);
			const lastEvent = events[events.length - 1];
			cursor = lastEvent.created_at - 1;
			hasMore = events.length >= STACKS_PAGE_SIZE;
			// Fetch missing app refs in background so stack cards fill in (don't block loading state)
			(async () => {
				const seen = new Set();
				for (const ev of events) {
					const stack = parseAppStack(ev);
					if (!stack?.appRefs) continue;
					for (const ref of stack.appRefs) {
						if (ref.kind !== EVENT_KINDS.APP || !ref.pubkey || !ref.identifier) continue;
						const key = `${ref.pubkey}:${ref.identifier}`;
						if (seen.has(key)) continue;
						seen.add(key);
						try {
							const existing = await queryEvents({
								kinds: [EVENT_KINDS.APP],
								authors: [ref.pubkey],
								'#d': [ref.identifier],
								limit: 1
							});
							if (existing.length === 0) {
								const appEv = await fetchAppFromRelays(relayUrls, ref.pubkey, ref.identifier);
								if (appEv) await putEvents([appEv]).catch(() => {});
							}
						} catch {
							// ignore per-ref failures
						}
					}
				}
			})();
		} else {
			hasMore = false;
		}
	} catch (err) {
		console.error('[StacksStore] Load more failed:', err);
	} finally {
		loadingMore = false;
	}
}
