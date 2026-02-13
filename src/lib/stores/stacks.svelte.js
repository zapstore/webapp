/**
 * Reactive Stacks Store
 *
 * Provides reactive access to app stacks with cursor-based pagination.
 * Uses Dexie for event persistence, server API for data fetching.
 */
import { setBackgroundRefreshing } from '$lib/stores/refresh-indicator.svelte.js';
import { putEvents } from '$lib/nostr/dexie';

const PAGE_SIZE = 20;

// ============================================================================
// Reactive State
// ============================================================================

let stacks = $state([]);
let cursor = $state(null);
let hasMore = $state(true);
let loadingMore = $state(false);
let refreshing = $state(false);
let initialized = $state(false);
const seenStacks = new Set();
let resolvedStacksCache = $state([]);

// ============================================================================
// Public Reactive Getters
// ============================================================================

export function getStacks() {
	return stacks;
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
export function isStacksInitialized() {
	return initialized;
}
export function getResolvedStacks() {
	return resolvedStacksCache;
}
export function setResolvedStacks(value) {
	resolvedStacksCache = value;
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Initialize with prerendered data.
 */
export function initWithPrerenderedStacks(prerenderedStacks, prerenderedResolvedStacks, nextCursor, seedEvents = []) {
	stacks = prerenderedStacks;
	resolvedStacksCache = prerenderedResolvedStacks ?? [];
	cursor = nextCursor;
	hasMore = nextCursor !== null;

	seenStacks.clear();
	for (const stack of prerenderedStacks) {
		seenStacks.add(`${stack.pubkey}:${stack.dTag}`);
	}

	initialized = true;

	if (seedEvents.length > 0) {
		putEvents(seedEvents).catch((err) =>
			console.error('[StacksStore] Seed persist failed:', err)
		);
	}
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
	if (!response.ok) {
		throw new Error(`Stacks API failed: ${response.status}`);
	}

	return response.json();
}

/**
 * Refresh stacks from server (background, non-blocking).
 */
export async function refreshStacksFromRelays() {
	if (refreshing) return;
	if (typeof window === 'undefined' || !navigator.onLine) return;

	refreshing = true;
	setBackgroundRefreshing(true);

	try {
		const { stacks: freshStacks, resolvedStacks: freshResolvedStacks = [], nextCursor, seedEvents = [] } =
			await fetchStacksPageFromServer(PAGE_SIZE);

		if (seedEvents.length > 0) {
			await putEvents(seedEvents).catch(() => {});
		}

		if (freshStacks.length > 0) {
			const parsed = [];
			const newSeen = new Set();

			for (const stack of freshStacks) {
				const key = `${stack.pubkey}:${stack.dTag}`;
				if (!newSeen.has(key)) {
					newSeen.add(key);
					parsed.push(stack);
				}
			}

			stacks = parsed;
			resolvedStacksCache = freshResolvedStacks;
			cursor = nextCursor;
			hasMore = nextCursor !== null;

			seenStacks.clear();
			for (const key of newSeen) seenStacks.add(key);
		}
	} catch (err) {
		console.error('[StacksStore] Refresh failed:', err);
	} finally {
		initialized = true;
		refreshing = false;
		setBackgroundRefreshing(false);
	}
}

/**
 * Load more stacks (next page).
 */
export async function loadMoreStacks() {
	if (loadingMore || !hasMore || cursor === null) return;
	if (typeof window === 'undefined' || !navigator.onLine) return;

	loadingMore = true;

	try {
		const { stacks: moreStacks, resolvedStacks: moreResolvedStacks = [], nextCursor, seedEvents = [] } =
			await fetchStacksPageFromServer(PAGE_SIZE, cursor);

		if (seedEvents.length > 0) {
			await putEvents(seedEvents).catch(() => {});
		}

		if (moreStacks.length > 0) {
			const newStacks = [];
			for (const stack of moreStacks) {
				const key = `${stack.pubkey}:${stack.dTag}`;
				if (!seenStacks.has(key)) {
					seenStacks.add(key);
					newStacks.push(stack);
				}
			}
			if (newStacks.length > 0) {
				stacks = [...stacks, ...newStacks];
			}
			if (moreResolvedStacks.length > 0) {
				resolvedStacksCache = [...resolvedStacksCache, ...moreResolvedStacks];
			}
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
 * Resolve apps for a stack.
 */
export async function resolveStackApps(stack) {
	if (!stack?.pubkey || !stack?.dTag) return [];
	const key = `${stack.pubkey}:${stack.dTag}`;
	const resolved = resolvedStacksCache.find(
		(entry) => `${entry.stack.pubkey}:${entry.stack.dTag}` === key
	);
	return resolved?.apps ?? [];
}

/**
 * Resolve apps for multiple stacks.
 */
export async function resolveMultipleStackApps(stacksList) {
	if (typeof window === 'undefined' || stacksList.length === 0) return [];
	return Promise.all(
		stacksList.map(async (stack) => ({
			stack,
			apps: await resolveStackApps(stack)
		}))
	);
}

/**
 * Schedule background refresh.
 */
export function scheduleStacksRefresh() {
	if (typeof window === 'undefined') return;
	const schedule =
		'requestIdleCallback' in window
			? window.requestIdleCallback
			: (cb) => setTimeout(cb, 1);
	schedule(() => {
		refreshStacksFromRelays();
	});
}

/**
 * Reset store state.
 */
export function resetStacksStore() {
	stacks = [];
	resolvedStacksCache = [];
	cursor = null;
	hasMore = true;
	loadingMore = false;
	refreshing = false;
	initialized = false;
	seenStacks.clear();
}
