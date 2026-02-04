/**
 * Reactive Stacks Store
 *
 * Provides reactive access to app stacks with cursor-based pagination.
 * Mirrors nostr.svelte.ts pattern for consistency.
 */

import { initNostrService, fetchAppStacks, fetchEvents } from '$lib/nostr/service';
import { parseAppStack, parseApp, type AppStack, type App } from '$lib/nostr/models';
import { DEFAULT_CATALOG_RELAYS, EVENT_KINDS } from '$lib/config';

const PAGE_SIZE = 20;

// ============================================================================
// Reactive State
// ============================================================================

/** Stacks list - ordered by created_at */
let stacks = $state<AppStack[]>([]);

/** Cursor for next page (timestamp) */
let cursor = $state<number | null>(null);

/** Whether more stacks are available */
let hasMore = $state(true);

/** Loading state for "Load More" */
let loadingMore = $state(false);

/** Refreshing from relays in background */
let refreshing = $state(false);

/** Whether store has been initialized */
let initialized = $state(false);

/** Set of seen stack keys for deduplication */
const seenStacks = new Set<string>();

/** Cached resolved stacks with apps and creator info */
let resolvedStacksCache = $state<Array<{
	name: string;
	description: string;
	apps: App[];
	creator?: { name?: string; picture?: string; pubkey: string; npub: string };
	pubkey: string;
	dTag: string;
}>>([]);

// ============================================================================
// Public Reactive Getters
// ============================================================================

export function getStacks(): AppStack[] {
	return stacks;
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

export function isStacksInitialized(): boolean {
	return initialized;
}

export function getResolvedStacks(): typeof resolvedStacksCache {
	return resolvedStacksCache;
}

export function setResolvedStacks(stacks: typeof resolvedStacksCache): void {
	resolvedStacksCache = stacks;
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Initialize with prerendered data.
 */
export function initWithPrerenderedStacks(prerenderedStacks: AppStack[], nextCursor: number | null): void {
	stacks = prerenderedStacks;
	cursor = nextCursor;
	hasMore = nextCursor !== null;

	seenStacks.clear();
	for (const stack of prerenderedStacks) {
		seenStacks.add(`${stack.pubkey}:${stack.dTag}`);
	}

	initialized = true;
}

/**
 * Refresh stacks from relays (background, non-blocking).
 */
export async function refreshStacksFromRelays(): Promise<void> {
	if (refreshing) return;
	if (typeof window === 'undefined' || !navigator.onLine) return;

	refreshing = true;

	try {
		await initNostrService();

		const { stacks: freshStacks, nextCursor } = await fetchAppStacks(
			[...DEFAULT_CATALOG_RELAYS],
			PAGE_SIZE
		);

		if (freshStacks.length > 0) {
			const parsed: AppStack[] = [];
			const newSeen = new Set<string>();

			for (const event of freshStacks) {
				const stack = parseAppStack(event);
				const key = `${stack.pubkey}:${stack.dTag}`;
				if (!newSeen.has(key)) {
					newSeen.add(key);
					parsed.push(stack);
				}
			}

			stacks = parsed;
			cursor = nextCursor;
			hasMore = nextCursor !== null;

			seenStacks.clear();
			for (const key of newSeen) {
				seenStacks.add(key);
			}
		}
	} catch (err) {
		console.error('[StacksStore] Refresh failed:', err);
	} finally {
		refreshing = false;
	}
}

/**
 * Load more stacks (next page) from relays.
 */
export async function loadMoreStacks(): Promise<void> {
	if (loadingMore || !hasMore || cursor === null) return;
	if (typeof window === 'undefined' || !navigator.onLine) return;

	loadingMore = true;

	try {
		await initNostrService();

		const { stacks: moreStacks, nextCursor } = await fetchAppStacks(
			[...DEFAULT_CATALOG_RELAYS],
			PAGE_SIZE,
			cursor
		);

		if (moreStacks.length > 0) {
			const newStacks: AppStack[] = [];

			for (const event of moreStacks) {
				const stack = parseAppStack(event);
				const key = `${stack.pubkey}:${stack.dTag}`;
				if (!seenStacks.has(key)) {
					seenStacks.add(key);
					newStacks.push(stack);
				}
			}

			if (newStacks.length > 0) {
				stacks = [...stacks, ...newStacks];
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
 * Resolve apps for a stack's app references.
 * Returns the apps in the same order as the stack's appRefs.
 */
export async function resolveStackApps(stack: AppStack): Promise<App[]> {
	if (typeof window === 'undefined') return [];

	await initNostrService();

	const apps: App[] = [];

	for (const ref of stack.appRefs) {
		const events = await fetchEvents(
			{
				kinds: [EVENT_KINDS.APP],
				authors: [ref.pubkey],
				'#d': [ref.identifier]
			},
			{ relays: [...DEFAULT_CATALOG_RELAYS] }
		);

		if (events.length > 0) {
			apps.push(parseApp(events[0]!));
		}
	}

	return apps;
}

/**
 * Schedule background refresh using requestIdleCallback.
 */
export function scheduleStacksRefresh(): void {
	if (typeof window === 'undefined') return;

	const schedule =
		'requestIdleCallback' in window
			? window.requestIdleCallback
			: (cb: () => void) => setTimeout(cb, 1);

	schedule(() => {
		refreshStacksFromRelays();
	});
}

/**
 * Reset store state.
 */
export function resetStacksStore(): void {
	stacks = [];
	cursor = null;
	hasMore = true;
	loadingMore = false;
	refreshing = false;
	initialized = false;
	seenStacks.clear();
}
