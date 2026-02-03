/**
 * Nostr Service Layer
 *
 * Central service using Applesauce patterns:
 * - EventStore for in-memory, synchronous access
 * - IndexedDB (via idb) for persistent caching
 * - persistEventsToCache for non-blocking writes
 *
 * Supports offline-first: loads from IndexedDB on init,
 * refreshes from relays when online.
 *
 * Key principle: All network/storage operations are non-blocking.
 * UI renders immediately from prerendered data, background work
 * happens via requestIdleCallback.
 */

import { EventStore, Helpers } from 'applesauce-core';
import { RelayPool } from 'applesauce-relay';
import { openDB, type IDBPDatabase } from 'idb';
import type { NostrEvent, Filter } from 'nostr-tools';
import { IDB_NAME, IDB_VERSION } from '$lib/config';

const { persistEventsToCache } = Helpers;

// IndexedDB schema
interface EventRecord {
	id: string;
	event: NostrEvent;
	cachedAt: number;
}

// Singleton instances
let eventStore: EventStore | null = null;
let pool: RelayPool | null = null;
let db: IDBPDatabase | null = null;
let initialized = false;

/**
 * Get the global EventStore instance (in-memory, synchronous)
 */
export function getEventStore(): EventStore {
	if (!eventStore) {
		eventStore = new EventStore();
	}
	return eventStore;
}

/**
 * Get the global RelayPool instance
 */
export function getPool(): RelayPool {
	if (!pool) {
		pool = new RelayPool();
	}
	return pool;
}

/**
 * Get the IndexedDB database instance
 */
async function getDb(): Promise<IDBPDatabase> {
	if (!db) {
		db = await openDB(IDB_NAME, IDB_VERSION, {
			upgrade(database) {
				if (!database.objectStoreNames.contains('events')) {
					const store = database.createObjectStore('events', { keyPath: 'id' });
					store.createIndex('cachedAt', 'cachedAt');
				}
			}
		});
	}
	return db;
}

/**
 * Check if the service has been initialized
 */
export function isInitialized(): boolean {
	return initialized;
}

// ============================================================================
// IndexedDB Query Interface
// ============================================================================

/**
 * Query IndexedDB cache using Nostr-style filters.
 * Adds matching events to EventStore automatically.
 *
 * @returns Events matching the filter from IndexedDB
 */
export async function queryCache(filter: Filter): Promise<NostrEvent[]> {
	const database = await getDb();
	const store = getEventStore();

	// Get all events from IndexedDB (we filter in memory since IDB doesn't support complex queries)
	const records = await database.getAll('events') as EventRecord[];

	const results: NostrEvent[] = [];

	for (const record of records) {
		const event = record.event;
		if (!event || typeof event.kind !== 'number') continue;

		// Apply filter
		if (!matchesFilter(event, filter)) continue;

		results.push(event);
		// Add to EventStore so it's available for sync queries
		store.add(event);
	}

	// Sort by created_at descending
	results.sort((a, b) => b.created_at - a.created_at);

	// Apply limit
	if (filter.limit && filter.limit > 0) {
		return results.slice(0, filter.limit);
	}

	return results;
}

/**
 * Check if an event matches a Nostr filter
 */
function matchesFilter(event: NostrEvent, filter: Filter): boolean {
	// Check kinds
	if (filter.kinds && filter.kinds.length > 0) {
		if (!filter.kinds.includes(event.kind)) return false;
	}

	// Check authors
	if (filter.authors && filter.authors.length > 0) {
		if (!filter.authors.includes(event.pubkey)) return false;
	}

	// Check ids
	if (filter.ids && filter.ids.length > 0) {
		if (!filter.ids.includes(event.id)) return false;
	}

	// Check since
	if (filter.since !== undefined) {
		if (event.created_at < filter.since) return false;
	}

	// Check until
	if (filter.until !== undefined) {
		if (event.created_at > filter.until) return false;
	}

	// Check tag filters (#a, #d, #e, #p, etc.)
	for (const [key, values] of Object.entries(filter)) {
		if (key.startsWith('#') && Array.isArray(values) && values.length > 0) {
			const tagName = key.slice(1);
			const valueSet = new Set(values as string[]);
			const matchingTags = event.tags.filter((t: string[]) => t[0] === tagName);
			const hasMatch = matchingTags.some((t: string[]) => t[1] && valueSet.has(t[1]));
			if (!hasMatch) return false;
		}
	}

	return true;
}

// ============================================================================
// Local Store Query Interface
// ============================================================================

/**
 * Query the local EventStore using Nostr-style filters.
 * Supports: kinds, authors, ids, #<tag>, since, until, limit
 *
 * This is synchronous - reads from in-memory EventStore.
 *
 * @example
 * // Get all apps
 * queryStore({ kinds: [32267] })
 *
 * // Get releases for a specific app
 * queryStore({ kinds: [30063], '#a': ['32267:pubkey:identifier'] })
 *
 * // Get app by author and d-tag
 * queryStore({ kinds: [32267], authors: [pubkey], '#d': [identifier] })
 */
export function queryStore(filter: Filter): NostrEvent[] {
	const store = getEventStore();

	// Start with kind filter via getByFilters (returns NostrEvent[])
	let events: NostrEvent[] = store.getByFilters(filter.kinds ? { kinds: filter.kinds } : {});

	// Filter by authors
	if (filter.authors && filter.authors.length > 0) {
		const authorSet = new Set(filter.authors);
		events = events.filter((e: NostrEvent) => authorSet.has(e.pubkey));
	}

	// Filter by event ids
	if (filter.ids && filter.ids.length > 0) {
		const idSet = new Set(filter.ids);
		events = events.filter((e: NostrEvent) => idSet.has(e.id));
	}

	// Filter by since (created_at >= since)
	if (filter.since !== undefined) {
		events = events.filter((e: NostrEvent) => e.created_at >= filter.since!);
	}

	// Filter by until (created_at <= until)
	if (filter.until !== undefined) {
		events = events.filter((e: NostrEvent) => e.created_at <= filter.until!);
	}

	// Filter by tags (#a, #d, #e, #p, etc.)
	for (const [key, values] of Object.entries(filter)) {
		if (key.startsWith('#') && Array.isArray(values) && values.length > 0) {
			const tagName = key.slice(1); // Remove '#' prefix
			const valueSet = new Set(values as string[]);

			events = events.filter((e: NostrEvent) => {
				// Find all tags with this name
				const matchingTags = e.tags.filter((t: string[]) => t[0] === tagName);
				// Check if any tag value matches
				return matchingTags.some((t: string[]) => t[1] && valueSet.has(t[1]));
			});
		}
	}

	// Sort by created_at descending (most recent first)
	events.sort((a: NostrEvent, b: NostrEvent) => b.created_at - a.created_at);

	// Apply limit
	if (filter.limit !== undefined && filter.limit > 0) {
		events = events.slice(0, filter.limit);
	}

	return events;
}

/**
 * Get a single event by filter (returns most recent if multiple match)
 */
export function queryStoreOne(filter: Filter): NostrEvent | null {
	const events = queryStore({ ...filter, limit: 1 });
	return events[0] ?? null;
}

// ============================================================================
// Unified Query API: fetch (async) and watch (reactive)
// Both follow: EventStore → IndexedDB → Relays
// ============================================================================

interface QueryOptions {
	relays?: readonly string[] | string[];
	timeout?: number;
	signal?: AbortSignal;
}

/**
 * Fetch events using the full cascade: EventStore → IndexedDB → Relays
 *
 * Async, Promise-based. Waits for all sources to be checked.
 *
 * @example
 * const apps = await fetchEvents(
 *   { kinds: [32267], authors: [pubkey], '#d': [identifier] },
 *   { relays: DEFAULT_CATALOG_RELAYS }
 * );
 */
export async function fetchEvents(
	filter: Filter,
	options: QueryOptions = {}
): Promise<NostrEvent[]> {
	const { relays = [], timeout = 5000, signal } = options;

	if (signal?.aborted) return [];

	// Step 1: Check EventStore (memory)
	let results = queryStore(filter);
	if (results.length > 0) {
		return results;
	}

	// Step 2: Check IndexedDB (cache)
	if (typeof window !== 'undefined') {
		await initNostrService();
		results = await queryCache(filter);
		if (results.length > 0) {
			return results;
		}
	}

	// Step 3: Fetch from relays (network)
	if (relays.length > 0 && typeof window !== 'undefined' && navigator.onLine) {
		await fetchFromRelays([...relays], filter, { timeout, signal });
		results = queryStore(filter);
	}

	return results;
}

/**
 * Fetch a single event using the full cascade.
 */
export async function fetchEvent(
	filter: Filter,
	options: QueryOptions = {}
): Promise<NostrEvent | null> {
	const results = await fetchEvents({ ...filter, limit: 1 }, options);
	return results[0] ?? null;
}

/**
 * Watch events: immediate return + background updates via callback.
 *
 * 1. Returns EventStore results immediately (synchronous)
 * 2. Checks IndexedDB if EventStore empty → calls onUpdate
 * 3. Fetches from relays in background → calls onUpdate
 *
 * @example
 * const releases = watchEvents(
 *   { kinds: [30063], '#a': [aTagValue] },
 *   { relays: DEFAULT_CATALOG_RELAYS },
 *   (freshReleases) => { latestRelease = parseRelease(freshReleases[0]); }
 * );
 */
export function watchEvents(
	filter: Filter,
	options: Omit<QueryOptions, 'signal'> = {},
	onUpdate?: (events: NostrEvent[]) => void
): NostrEvent[] {
	const { relays = [], timeout = 5000 } = options;

	// Immediate: return EventStore results (synchronous)
	const localResults = queryStore(filter);

	if (typeof window === 'undefined') {
		return localResults;
	}

	// Background: check cache then relays (async, non-blocking)
	(async () => {
		try {
			await initNostrService();

			// If EventStore empty, check IndexedDB
			if (localResults.length === 0) {
				const cachedResults = await queryCache(filter);
				if (cachedResults.length > 0 && onUpdate) {
					onUpdate(cachedResults);
				}
			}

			// Fetch from relays in background
			if (relays.length > 0 && navigator.onLine) {
				await fetchFromRelays([...relays], filter, { timeout });

				if (onUpdate) {
					const freshResults = queryStore(filter);
					onUpdate(freshResults);
				}
			}
		} catch (err) {
			console.error('[watchEvents] Background fetch failed:', err);
		}
	})();

	return localResults;
}

/**
 * Watch a single event: immediate return + background updates.
 */
export function watchEvent(
	filter: Filter,
	options: Omit<QueryOptions, 'signal'> = {},
	onUpdate?: (event: NostrEvent | null) => void
): NostrEvent | null {
	const results = watchEvents(
		{ ...filter, limit: 1 },
		options,
		onUpdate ? (events) => onUpdate(events[0] ?? null) : undefined
	);
	return results[0] ?? null;
}

/**
 * Initialize the Nostr service (call once on app start)
 * 
 * Lightweight init - does NOT load cache (prerendered data handles first paint).
 * Sets up persistence so new events are cached for return visits.
 */
export async function initNostrService(): Promise<void> {
	if (initialized) return;

	const store = getEventStore();

	// Set up non-blocking persistence: events added to store are saved to cache
	const database = await getDb();
	persistEventsToCache(store, async (events: NostrEvent[]) => {
		const db = await getDb();
		const tx = db.transaction('events', 'readwrite');
		for (const event of events) {
			await tx.store.put({
				id: event.id,
				event,
				cachedAt: Date.now()
			});
		}
		await tx.done;
	});

	initialized = true;
	console.log('[NostrService] Initialized (lightweight, no cache load)');
}

/**
 * Load cached events from IndexedDB into EventStore.
 * Call this only when needed (offline mode, return visits).
 */
export async function loadCacheIntoStore(): Promise<number> {
	const store = getEventStore();
	const database = await getDb();

	const records = await database.getAll('events');
	console.log(`[NostrService] Loading ${records.length} cached events...`);
	
	let loadedCount = 0;
	for (const record of records as EventRecord[]) {
		if (record.event && typeof record.event.kind === 'number') {
			store.add(record.event);
			loadedCount++;
		}
	}
	
	console.log(`[NostrService] Loaded ${loadedCount} events from cache`);
	return loadedCount;
}

/**
 * Check if we have any cached events of a specific kind
 */
export function hasCachedEvents(kind: number): boolean {
	const store = getEventStore();
	const events = store.getByFilters({ kinds: [kind] });
	return events.length > 0;
}

/**
 * Fetch events from relays
 * Returns events and adds them to the store
 * 
 * @param relays - Relay URLs to query
 * @param filter - Nostr filter
 * @param options - Fetch options
 * @param options.timeout - Timeout in ms (default 5000)
 * @param options.signal - AbortSignal to cancel the request
 */
export async function fetchFromRelays(
	relays: string[],
	filter: Filter,
	options: { timeout?: number; signal?: AbortSignal } = {}
): Promise<NostrEvent[]> {
	const { timeout = 5000, signal } = options;

	// Check if already aborted
	if (signal?.aborted) {
		return [];
	}

	return new Promise((resolve) => {
		const events: NostrEvent[] = [];
		const store = getEventStore();
		let resolved = false;

		const finish = () => {
			if (!resolved) {
				resolved = true;
				sub.unsubscribe();
				resolve(events);
			}
		};

		const p = getPool();
		const sub = p.subscription(relays, [filter]).subscribe({
			next: (message) => {
				if (message === 'EOSE') {
					finish();
				} else if (message && typeof message === 'object' && 'kind' in message) {
					// Validate that message is a valid Nostr event before adding
					const event = message as NostrEvent;
					events.push(event);
					store.add(event);
				}
			},
			error: (err) => {
				console.error('[NostrService] Subscription error:', err);
				finish();
			}
		});

		// Handle abort signal
		signal?.addEventListener('abort', finish, { once: true });

		// Fallback timeout
		setTimeout(finish, timeout);
	});
}

/**
 * Extract app reference from release event's 'a' tag
 * Format: "kind:pubkey:identifier"
 */
function parseAppReference(event: NostrEvent): { pubkey: string; identifier: string } | null {
	const aTag = event.tags.find((t) => t[0] === 'a')?.[1];
	if (!aTag) return null;

	const parts = aTag.split(':');
	if (parts.length < 3 || !parts[1] || !parts[2]) return null;

	return {
		pubkey: parts[1],
		identifier: parts[2]
	};
}

/**
 * Fetch apps by loading releases and resolving to their apps.
 * This is the canonical data loading pattern:
 * 1. Load releases (kind 30063) by created_at
 * 2. For each release, find its app (kind 32267)
 * 3. Return unique apps
 *
 * @param relays - Relay URLs to query
 * @param limit - Number of releases to fetch per page
 * @param until - Fetch releases created before this timestamp (for pagination)
 * @param options - Fetch options
 * @param options.timeout - Timeout in ms (default 5000)
 * @param options.signal - AbortSignal to cancel the request
 * @returns Object with apps, releases, and cursor for next page
 */
export async function fetchAppsByReleases(
	relays: string[],
	limit: number = 20,
	until?: number,
	options: { timeout?: number; signal?: AbortSignal } = {}
): Promise<{ apps: NostrEvent[]; releases: NostrEvent[]; nextCursor: number | null }> {
	const { timeout = 5000, signal } = options;

	// Check if already aborted
	if (signal?.aborted) {
		return { apps: [], releases: [], nextCursor: null };
	}

	// Step 1: Fetch releases sorted by created_at
	const releaseFilter: Filter = {
		kinds: [30063], // EVENT_KINDS.RELEASE
		limit
	};
	if (until !== undefined) {
		releaseFilter.until = until;
	}

	console.log(`[NostrService] Fetching releases (limit: ${limit}, until: ${until ?? 'now'})...`);
	const releases = await fetchFromRelays(relays, releaseFilter, { timeout, signal });
	
	// Check if aborted during fetch
	if (signal?.aborted) {
		return { apps: [], releases: [], nextCursor: null };
	}
	
	console.log(`[NostrService] Fetched ${releases.length} releases`);

	if (releases.length === 0) {
		return { apps: [], releases: [], nextCursor: null };
	}

	// Sort releases by created_at descending
	releases.sort((a, b) => b.created_at - a.created_at);

	// Step 2: Extract unique app references from releases
	const appRefs = new Map<string, { pubkey: string; identifier: string }>();
	for (const release of releases) {
		const ref = parseAppReference(release);
		if (ref) {
			const key = `${ref.pubkey}:${ref.identifier}`;
			if (!appRefs.has(key)) {
				appRefs.set(key, ref);
			}
		}
	}

	console.log(`[NostrService] Found ${appRefs.size} unique app references`);

	// Step 3: Resolve apps using fetchEvent (EventStore → IndexedDB → Relays)
	const apps: NostrEvent[] = [];

	for (const [, ref] of appRefs) {
		if (signal?.aborted) break;

		const app = await fetchEvent(
			{ kinds: [32267], authors: [ref.pubkey], '#d': [ref.identifier] },
			{ relays, timeout, signal }
		);

		if (app) {
			apps.push(app);
		}
	}

	console.log(`[NostrService] Resolved ${apps.length} apps`);

	// Calculate next cursor (timestamp of last release minus 1 to avoid duplicates)
	const lastRelease = releases[releases.length - 1]!;
	const nextCursor = releases.length === limit ? lastRelease.created_at - 1 : null;

	return { apps, releases, nextCursor };
}

/**
 * Close all connections and cleanup
 */
export function cleanup(): void {
	if (pool) {
		for (const relay of pool.relays.values()) {
			relay.close();
		}
		pool = null;
	}
	if (db) {
		db.close();
		db = null;
	}
	eventStore = null;
	initialized = false;
}
