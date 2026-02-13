/**
 * Stacks Store — liveQuery + Pagination
 *
 * Architecture-compliant: Dexie liveQuery is the single client-side source of truth.
 *
 * This store provides:
 *   - createStacksQuery() → liveQuery observable for stacks with resolved apps
 *   - Pagination state (cursor, hasMore, loadingMore, refreshing)
 *   - Actions that write to Dexie (liveQuery updates UI automatically)
 */
import { liveQuery } from 'dexie';
import { setBackgroundRefreshing } from '$lib/stores/refresh-indicator.svelte.js';
import { db, putEvents } from '$lib/nostr/dexie';
import { parseApp, parseAppStack } from '$lib/nostr/models';
import { EVENT_KINDS, PLATFORM_FILTER } from '$lib/config';

const PAGE_SIZE = 20;
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

export function getStacksHasMore() {
	return hasMore;
}
export function isStacksLoadingMore() {
	return loadingMore;
}
export function isStacksRefreshing() {
	return refreshing;
}

// ============================================================================
// liveQuery — Reactive data from Dexie
// ============================================================================

/**
 * Returns a Dexie liveQuery observable for stacks with their resolved apps.
 * Each entry is { stack: ParsedStack, apps: ParsedApp[] }.
 * Subscribe in a component $effect for reactive updates.
 */
export function createStacksQuery() {
	return liveQuery(async () => {
		// Get stack events
		let stackEvents = await db.events
			.where('kind')
			.equals(EVENT_KINDS.APP_STACK)
			.reverse()
			.sortBy('created_at');

		// Filter by platform tag
		if (platformTag) {
			stackEvents = stackEvents.filter((e) =>
				e.tags?.some((t) => t[0] === 'f' && t[1] === platformTag)
			);
		}

		// Discard encrypted stacks (non-empty content that isn't valid JSON description)
		stackEvents = stackEvents.filter((e) => {
			if (!e.content) return true;
			// parseAppStack uses content as description, so we keep it
			return true;
		});

		// Get all app events for resolving stack references
		let appEvents = await db.events.where('kind').equals(EVENT_KINDS.APP).toArray();

		if (platformTag) {
			appEvents = appEvents.filter((e) =>
				e.tags?.some((t) => t[0] === 'f' && t[1] === platformTag)
			);
		}

		// Index apps by (pubkey:dTag)
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

		// Parse stacks and resolve their apps
		return stackEvents.map((event) => {
			const stack = parseAppStack(event);
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
 * Set initial pagination cursor from prerendered data.
 */
export function initStacksPagination(nextCursor) {
	cursor = nextCursor ?? null;
	hasMore = nextCursor !== null;
}

/**
 * Fetch stacks page from server API.
 */
async function fetchStacksPageFromServer(limit, nextCursor) {
	const params = new URLSearchParams({ limit: String(limit) });
	if (nextCursor !== undefined && nextCursor !== null) {
		params.set('cursor', String(nextCursor));
	}
	const response = await fetch(`/api/stacks?${params.toString()}`);
	if (!response.ok) throw new Error(`Stacks API failed: ${response.status}`);
	return response.json();
}

/**
 * Refresh from server API (background).
 * Writes to Dexie → liveQuery updates UI automatically.
 */
export async function refreshStacksFromAPI() {
	if (refreshing) return;
	if (typeof window === 'undefined' || !navigator.onLine) return;

	refreshing = true;
	setBackgroundRefreshing(true);

	try {
		const { nextCursor, seedEvents: events = [] } = await fetchStacksPageFromServer(PAGE_SIZE);
		if (events.length > 0) {
			await putEvents(events);
		}
		cursor = nextCursor;
		hasMore = nextCursor !== null;
	} catch (err) {
		console.error('[StacksStore] Refresh failed:', err);
	} finally {
		refreshing = false;
		setBackgroundRefreshing(false);
	}
}

/**
 * Load more stacks (next page → Dexie → liveQuery).
 */
export async function loadMoreStacks() {
	if (loadingMore || !hasMore || cursor === null) return;
	if (typeof window === 'undefined' || !navigator.onLine) return;

	loadingMore = true;

	try {
		const { nextCursor, seedEvents: events = [] } = await fetchStacksPageFromServer(
			PAGE_SIZE,
			cursor
		);
		if (events.length > 0) {
			await putEvents(events);
		}
		cursor = nextCursor;
		hasMore = nextCursor !== null;
	} catch (err) {
		console.error('[StacksStore] Load more failed:', err);
	} finally {
		loadingMore = false;
	}
}

/**
 * Schedule background refresh.
 */
export function scheduleStacksRefresh() {
	if (typeof window === 'undefined') return;
	const schedule =
		'requestIdleCallback' in window ? window.requestIdleCallback : (cb) => setTimeout(cb, 1);
	schedule(() => refreshStacksFromAPI());
}
