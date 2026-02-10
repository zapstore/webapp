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
import type { EventTemplate } from 'nostr-tools/pure';
import { IDB_NAME, IDB_VERSION, DEFAULT_CATALOG_RELAYS, DEFAULT_SOCIAL_RELAYS, PROFILE_RELAYS } from '$lib/config';

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
			upgrade(database, oldVersion, _newVersion, transaction) {
				if (!database.objectStoreNames.contains('events')) {
					const store = database.createObjectStore('events', { keyPath: 'id' });
					store.createIndex('cachedAt', 'cachedAt');
					store.createIndex('kind', 'event.kind');
				} else if (oldVersion > 0 && oldVersion < 3) {
					const store = transaction.objectStore('events');
					if (!store.indexNames.contains('kind')) {
						store.createIndex('kind', 'event.kind');
					}
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

	if (typeof window === 'undefined') {
		return queryStore(filter);
	}

	await initNostrService();

	// Step 1: If EventStore empty, load from IndexedDB into store (queryCache does store.add)
	let results = queryStore(filter);
	if (results.length === 0) {
		await queryCache(filter);
		results = queryStore(filter);
	}

	// Step 2: Always fetch from relays when online so we get complete, consistent data.
	// (Early return on "any store result" caused partial/stale counts across reloads and browsers.)
	if (relays.length > 0 && navigator.onLine) {
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
 * Sets up persistence and loads IndexedDB cache into EventStore so return visits
 * get instant local data (per ARCHITECTURE: "IndexedDB cache loaded into EventStore").
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

	// Load IndexedDB cache into EventStore so queryStore/queryCommentsFromStore
	// return data immediately on return visits (local-first, per ARCHITECTURE)
	await loadCacheIntoStore();

	initialized = true;
	console.log('[NostrService] Initialized (cache loaded into EventStore)');
}

/**
 * Load cached events from IndexedDB into EventStore.
 * Loads profiles (kind 0) first so profile lookups are fast (ARCHITECTURE: local-first).
 * Call this only when needed (offline mode, return visits).
 */
export async function loadCacheIntoStore(): Promise<number> {
	const store = getEventStore();
	const database = await getDb();

	// Load profiles (kind 0) first so zapper/commenter profiles show immediately from cache
	let loadedCount = 0;
	let hasKindIndex = false;
	try {
		const profileRecords = (await database.getAllFromIndex('events', 'kind', 0)) as EventRecord[];
		hasKindIndex = true;
		for (const record of profileRecords) {
			if (record.event && record.event.kind === 0) {
				store.add(record.event);
				loadedCount++;
			}
		}
	} catch {
		// Index may not exist on older DBs; will load all below
	}

	const records = (await database.getAll('events')) as EventRecord[];
	for (const record of records) {
		if (!record.event || typeof record.event.kind !== 'number') continue;
		if (hasKindIndex && record.event.kind === 0) continue; // already loaded
		store.add(record.event);
		loadedCount++;
	}

	console.log(`[NostrService] Loaded ${loadedCount} events from cache (profiles first)`);
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
 * Fetch app stacks (kind 30267) from relays.
 *
 * @param relays - Relay URLs to query
 * @param limit - Number of stacks to fetch per page
 * @param until - Fetch stacks created before this timestamp (for pagination)
 * @param options - Fetch options
 * @returns Object with stacks and cursor for next page
 */
export async function fetchAppStacks(
	relays: string[],
	limit: number = 20,
	until?: number,
	options: { timeout?: number; signal?: AbortSignal } = {}
): Promise<{ stacks: NostrEvent[]; nextCursor: number | null }> {
	const { timeout = 5000, signal } = options;

	if (signal?.aborted) {
		return { stacks: [], nextCursor: null };
	}

	const filter: Filter = {
		kinds: [30267], // EVENT_KINDS.APP_STACK
		limit
	};
	if (until !== undefined) {
		filter.until = until;
	}

	console.log(`[NostrService] Fetching app stacks (limit: ${limit}, until: ${until ?? 'now'})...`);
	const stacks = await fetchFromRelays(relays, filter, { timeout, signal });

	if (signal?.aborted) {
		return { stacks: [], nextCursor: null };
	}

	console.log(`[NostrService] Fetched ${stacks.length} app stacks`);

	if (stacks.length === 0) {
		return { stacks: [], nextCursor: null };
	}

	// Sort by created_at descending
	stacks.sort((a, b) => b.created_at - a.created_at);

	// Calculate next cursor
	const lastStack = stacks[stacks.length - 1]!;
	const nextCursor = stacks.length === limit ? lastStack.created_at - 1 : null;

	return { stacks, nextCursor };
}

/**
 * Fetch a single app by pubkey and identifier (client-side).
 * Uses local-first pattern: EventStore → IndexedDB → Catalog Relays
 * 
 * @param pubkey - App publisher pubkey
 * @param identifier - App d-tag identifier
 * @param options - Fetch options
 * @returns Parsed App or null
 */
export async function fetchApp(
	pubkey: string,
	identifier: string,
	options: { timeout?: number; signal?: AbortSignal } = {}
): Promise<import('./models').App | null> {
	const { timeout = 5000, signal } = options;

	if (signal?.aborted) {
		return null;
	}

	const filter: Filter = {
		kinds: [32267], // EVENT_KINDS.APP
		authors: [pubkey],
		'#d': [identifier],
		limit: 1
	};

	console.log(`[NostrService] Fetching app: ${pubkey}:${identifier}`);
	
	// Use fetchEvent for single event lookup
	const event = await fetchEvent(filter, { relays: DEFAULT_CATALOG_RELAYS, timeout, signal });

	if (!event) {
		console.log(`[NostrService] App not found: ${pubkey}:${identifier}`);
		return null;
	}

	const { parseApp } = await import('./models');
	return parseApp(event as any);
}

/**
 * Fetch app stacks with parsing (client-side convenience wrapper).
 * 
 * @param options - Filter options
 * @returns Array of parsed AppStack objects
 */
export async function fetchAppStacksParsed(options: {
	authors?: string[];
	limit?: number;
	until?: number;
	timeout?: number;
	signal?: AbortSignal;
} = {}): Promise<import('./models').AppStack[]> {
	const { authors, limit = 20, until, timeout = 5000, signal } = options;

	if (signal?.aborted) {
		return [];
	}

	const filter: Filter = {
		kinds: [30267], // EVENT_KINDS.APP_STACK
		limit
	};

	if (authors && authors.length > 0) {
		filter.authors = authors;
	}

	if (until !== undefined) {
		filter.until = until;
	}

	console.log(`[NostrService] Fetching app stacks (limit: ${limit}, authors: ${authors?.length || 'all'})...`);
	
	// Fetch from relays
	const events = await fetchFromRelays([...DEFAULT_CATALOG_RELAYS], filter, { timeout, signal });

	if (signal?.aborted) {
		return [];
	}

	console.log(`[NostrService] Fetched ${events.length} app stacks`);

	// Parse events to AppStack objects
	const { parseAppStack } = await import('./models');
	const stacks = events.map((event) => parseAppStack(event as any));

	// Sort by created_at descending
	stacks.sort((a, b) => b.createdAt - a.createdAt);

	return stacks;
}

/**
 * Fetch a profile by pubkey.
 * Uses local-first pattern: EventStore → IndexedDB → Social Relays
 */
export async function fetchProfile(
	pubkey: string,
	options: { timeout?: number; signal?: AbortSignal } = {}
): Promise<NostrEvent | null> {
	const { timeout = 5000, signal } = options;
	
	if (signal?.aborted || !pubkey) {
		return null;
	}

	const filter: Filter = {
		kinds: [0], // EVENT_KINDS.PROFILE
		authors: [pubkey],
		limit: 1
	};

	// Use profile relays (social + vertex, match Flutter app)
	console.log(`[NostrService] Fetching profile for: ${pubkey.slice(0, 8)}...`);
	const events = await fetchEvents(filter, {
		relays: [...PROFILE_RELAYS],
		timeout,
		signal,
	});

	if (events.length > 0) {
		console.log(`[NostrService] Found profile for: ${pubkey.slice(0, 8)}...`);
		return events[0]!;
	}

	console.log(`[NostrService] No profile found for: ${pubkey.slice(0, 8)}...`);
	return null;
}

/**
 * Fetch multiple profiles in batch.
 * Uses local-first pattern with parallel fetching.
 */
export async function fetchProfilesBatch(
	pubkeys: string[],
	options: { timeout?: number; signal?: AbortSignal } = {}
): Promise<Map<string, NostrEvent>> {
	const { timeout = 5000, signal } = options;
	const results = new Map<string, NostrEvent>();

	if (!pubkeys || pubkeys.length === 0 || signal?.aborted) {
		return results;
	}

	// Deduplicate pubkeys
	const uniquePubkeys = [...new Set(pubkeys)];

	console.log(`[NostrService] Fetching ${uniquePubkeys.length} profiles in batch...`);

	// Fetch all profiles in parallel
	const fetchPromises = uniquePubkeys.map(async (pubkey) => {
		const event = await fetchProfile(pubkey, { timeout, signal });
		if (event) {
			results.set(pubkey, event);
		}
	});

	await Promise.all(fetchPromises);

	console.log(`[NostrService] Fetched ${results.size} profiles`);
	return results;
}

// ============================================================================
// Social Features: Comments and Zaps
// ============================================================================

// Social relays for comments, zaps (match Flutter: damus, primal, nos.lol)
const SOCIAL_RELAYS = [...DEFAULT_SOCIAL_RELAYS];

/**
 * Build NIP-22 comment filter.
 * Comments reference the target via 'a' tag: kind:pubkey:identifier (app 32267, stack 30267).
 */
function buildCommentFilter(
	pubkey: string,
	identifier: string,
	aTagKind: number = 32267
): Filter {
	const aTagValue = `${aTagKind}:${pubkey}:${identifier}`;
	return {
		kinds: [1111], // NIP-22 Comment
		'#a': [aTagValue]
	};
}

/**
 * Query comment events from EventStore only (sync, local-first).
 * All comments for this app/stack are stored with #a; same filter as fetchComments.
 * Use for immediate paint; then run fetchComments() for latest from relays.
 */
export function queryCommentsFromStore(
	pubkey: string,
	identifier: string,
	aTagKind: number = 32267
): NostrEvent[] {
	if (!pubkey || !identifier) return [];
	const aTagValue = `${aTagKind}:${pubkey}:${identifier}`;
	const filterLower = { kinds: [1111] as number[], '#a': [aTagValue], limit: 500 };
	const filterUpper = { kinds: [1111] as number[], '#A': [aTagValue], limit: 500 };
	const lower = queryStore(filterLower);
	const upper = queryStore(filterUpper);
	const byId = new Map<string, NostrEvent>();
	for (const e of [...lower, ...upper]) {
		if (!byId.has(e.id)) byId.set(e.id, e);
	}
	// All comments for this app/stack have #a; no need to follow #e (we persist what we fetch by #a)
	return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
}

/**
 * Fetch comments for an app/stack.
 * All comments (roots and replies at any depth) reference the subject via the #a tag
 * (e.g. 32267:pubkey:dTag for app, 30267:pubkey:dTag for stack). We publish with #a on every
 * comment, so a single query by #a / #A returns the full thread.
 *
 * @param pubkey - App/stack publisher's pubkey
 * @param identifier - App's d-tag or stack d-tag
 * @param options - Fetch options
 * @returns Array of comment events (root and all nested replies)
 */
export async function fetchComments(
	pubkey: string,
	identifier: string,
	options: { timeout?: number; signal?: AbortSignal; relays?: string[]; aTagKind?: number } = {}
): Promise<NostrEvent[]> {
	const { timeout = 5000, signal, relays = SOCIAL_RELAYS, aTagKind = 32267 } = options;

	if (signal?.aborted || !pubkey || !identifier) {
		return [];
	}

	const aTagValue = `${aTagKind}:${pubkey}:${identifier}`;
	const filterLower = { kinds: [1111] as number[], '#a': [aTagValue], limit: 500 };
	const filterUpper = { kinds: [1111] as number[], '#A': [aTagValue], limit: 500 };

	console.log(`[NostrService] Fetching comments for app: ${pubkey.slice(0, 8)}:${identifier}...`);

	const [eventsLower, eventsUpper] = await Promise.all([
		fetchEvents(filterLower, { relays, timeout, signal }),
		fetchEvents(filterUpper, { relays, timeout, signal })
	]);

	const byId = new Map<string, NostrEvent>();
	for (const e of [...eventsLower, ...eventsUpper]) {
		if (!byId.has(e.id)) byId.set(e.id, e);
	}

	const events = Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
	console.log(`[NostrService] Found ${events.length} comments`);
	return events;
}

/** Batch size for #e filter (many relays cap filter size) */
const COMMENT_REPLIES_E_BATCH = 100;

/**
 * Fetch kind 1111 comments that reference any of the given event ids via #e.
 * Used to include replies from clients that don't add #a (e.g. other apps replying in our thread).
 * Events are added to EventStore via fetchEvents.
 */
export async function fetchCommentRepliesByE(
	eventIds: string[],
	options: { timeout?: number; signal?: AbortSignal; relays?: string[] } = {}
): Promise<NostrEvent[]> {
	if (eventIds.length === 0) return [];
	const { timeout = 5000, signal, relays = SOCIAL_RELAYS } = options;
	const byId = new Map<string, NostrEvent>();
	for (let i = 0; i < eventIds.length; i += COMMENT_REPLIES_E_BATCH) {
		const chunk = eventIds.slice(i, i + COMMENT_REPLIES_E_BATCH);
		const filter = { kinds: [1111] as number[], '#e': chunk, limit: 500 };
		const events = await fetchEvents(filter, { relays, timeout, signal });
		for (const e of events) byId.set(e.id, e);
	}
	return Array.from(byId.values());
}

/**
 * Watch comments for an app with background updates.
 * Sync: returns comments from EventStore (both #a and #A).
 * Background: runs fetchComments (#a/#A, single query) and calls onUpdate.
 */
export function watchComments(
	pubkey: string,
	identifier: string,
	options: { timeout?: number; relays?: string[]; aTagKind?: number } = {},
	onUpdate?: (comments: NostrEvent[]) => void
): NostrEvent[] {
	if (!pubkey || !identifier) return [];

	const initial = queryCommentsFromStore(pubkey, identifier, options.aTagKind ?? 32267);

	if (typeof window === 'undefined') return initial;

	(async () => {
		try {
			await initNostrService();
			const { timeout = 5000, relays = SOCIAL_RELAYS, aTagKind = 32267 } = options;
			const events = await fetchComments(pubkey, identifier, { timeout, relays, aTagKind });
			onUpdate?.(events);
		} catch (err) {
			console.error('[watchComments] Background fetch failed:', err);
		}
	})();

	return initial;
}

/**
 * Build zap receipt filter for an app.
 * Zap receipts reference the zapped content via 'a' tag.
 */
function buildZapFilter(pubkey: string, identifier: string): Filter {
	const aTagValue = `32267:${pubkey}:${identifier}`;
	return {
		kinds: [9735], // Zap Receipt
		'#a': [aTagValue]
	};
}

/**
 * Fetch zaps per NIP-57. Zaps on the app event only — #a / #A only (no #p; that pulls in random profile zaps from other apps).
 * - Main event: #a / #A so receipt must have app a-tag (we send it on every zap from the app page).
 * - Zaps on other events: #e with event ids (comment or zap receipt ids).
 *
 * @param pubkey - App publisher's pubkey
 * @param identifier - App's d-tag identifier
 * @param options - Fetch options; eventIds = comment or zap receipt ids to fetch zaps ON those events
 * @returns Array of zap receipt events
 */
export async function fetchZaps(
	pubkey: string,
	identifier: string,
	options: { timeout?: number; signal?: AbortSignal; relays?: string[]; eventIds?: string[] } = {}
): Promise<NostrEvent[]> {
	const { timeout = 5000, signal, relays = SOCIAL_RELAYS } = options;

	if (signal?.aborted || !pubkey || !identifier) {
		return [];
	}

	const aTagValue = `32267:${pubkey}:${identifier}`;
	const byId = new Map<string, NostrEvent>();

	// 1) Zaps on the app event ONLY: #a / #A. No #p — that returns zaps to the profile from anywhere (other apps, notes), not just this app.
	// To get more app zaps: always send the app a-tag in zap requests from this app page so receipts have it and we find them here.
	const filtersMain: Filter[] = [
		{ kinds: [9735] as number[], '#a': [aTagValue], limit: 100 },
		{ kinds: [9735] as number[], '#A': [aTagValue], limit: 100 },
	];
	const mainResults = await Promise.all(
		filtersMain.map((f) => fetchEvents(f, { relays, timeout, signal }))
	);
	for (const events of mainResults) {
		for (const e of events) {
			if (!byId.has(e.id)) byId.set(e.id, e);
		}
	}

	// 2) Zaps on specific events (comments or zap receipts): NIP-57 Appendix F — #e with those event ids (normalized lowercase for relay matching)
	const eventIds = (options.eventIds ?? []).map((id) => id.trim().toLowerCase()).filter((id) => /^[a-f0-9]{64}$/.test(id));
	if (eventIds.length > 0 && !signal?.aborted) {
		const filterE = { kinds: [9735] as number[], '#e': eventIds, limit: 100 };
		const filterEUpper = { kinds: [9735] as number[], '#E': eventIds, limit: 100 };
		const [byELower, byEUpper] = await Promise.all([
			fetchEvents(filterE, { relays, timeout, signal }),
			fetchEvents(filterEUpper, { relays, timeout, signal })
		]);
		for (const e of [...byELower, ...byEUpper]) {
			if (!byId.has(e.id)) byId.set(e.id, e);
		}
	}

	const events = Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
	console.log(`[NostrService] Found ${events.length} zaps`);
	return events;
}

/**
 * Watch zaps for an app with background updates.
 *
 * @param pubkey - App publisher's pubkey
 * @param identifier - App's d-tag identifier
 * @param options - Watch options
 * @param onUpdate - Callback when new zaps arrive
 * @returns Initial zaps from EventStore
 */
export function watchZaps(
	pubkey: string,
	identifier: string,
	options: { timeout?: number; relays?: string[] } = {},
	onUpdate?: (zaps: NostrEvent[]) => void
): NostrEvent[] {
	const { timeout = 5000, relays = SOCIAL_RELAYS } = options;

	if (!pubkey || !identifier) {
		return [];
	}

	const filter = { ...buildZapFilter(pubkey, identifier), limit: 100 };

	return watchEvents(filter, { relays, timeout }, onUpdate);
}

/**
 * Parse a zap receipt to extract sender, amount, comment, emoji tags (from zap request in description),
 * and zappedEventId (event id that was zapped, from zap request 'e' tag — for zaps on zaps).
 */
export function parseZapReceipt(event: NostrEvent): {
	senderPubkey: string | null;
	recipientPubkey: string | null;
	amountSats: number;
	comment: string;
	emojiTags: { shortcode: string; url: string }[];
	createdAt: number;
	/** Event id that was zapped (parent zap receipt or other event); from zap request e-tag. */
	zappedEventId: string | null;
} {
	const result = {
		senderPubkey: null as string | null,
		recipientPubkey: null as string | null,
		amountSats: 0,
		comment: '',
		emojiTags: [] as { shortcode: string; url: string }[],
		createdAt: event.created_at,
		zappedEventId: null as string | null
	};

	// Get recipient pubkey from 'p' tag
	const pTag = event.tags.find(t => t[0] === 'p');
	if (pTag && pTag[1]) {
		result.recipientPubkey = pTag[1];
	}

	// Parse the bolt11 invoice from the 'bolt11' tag to get amount
	const bolt11Tag = event.tags.find(t => t[0] === 'bolt11');
	if (bolt11Tag && bolt11Tag[1]) {
		// Simple extraction of amount from bolt11 - look for 'lnbc' prefix and amount
		const bolt11 = bolt11Tag[1].toLowerCase();
		const amountMatch = bolt11.match(/^lnbc(\d+)([munp]?)/);
		if (amountMatch) {
			const num = parseInt(amountMatch[1]!, 10);
			const unit = amountMatch[2] || '';
			// Convert to satoshis based on unit
			switch (unit) {
				case 'm': result.amountSats = num * 100000; break; // milli-bitcoin
				case 'u': result.amountSats = num * 100; break; // micro-bitcoin
				case 'n': result.amountSats = Math.round(num / 10); break; // nano-bitcoin
				case 'p': result.amountSats = Math.round(num / 10000); break; // pico-bitcoin
				default: result.amountSats = num * 100000000; break; // bitcoin
			}
		}
	}

	// e-tag: event that was zapped (comment or zap receipt id). Normalize to lowercase so threadZapsByRootId matching works.
	const receiptETag = event.tags.find((t): t is [string, string, ...string[]] => (t[0]?.toLowerCase() === 'e') && !!t[1]);
	if (receiptETag?.[1]) result.zappedEventId = receiptETag[1].toLowerCase();

	// Parse the description tag which contains the original zap request (NIP-57)
	const descTag = event.tags.find(t => t[0] === 'description');
	if (descTag && descTag[1]) {
		try {
			const zapRequest = JSON.parse(descTag[1]) as NostrEvent;
			result.senderPubkey = zapRequest.pubkey;
			result.comment = zapRequest.content || '';
			// e-tag from zap request if not already set from receipt
			if (result.zappedEventId == null) {
				const eTag = zapRequest.tags?.find((t): t is [string, string, ...string[]] => t[0] === 'e' && !!t[1]);
				if (eTag?.[1]) result.zappedEventId = eTag[1].toLowerCase();
			}
			// Extract NIP-30 emoji tags from zap request (same as comments)
			const seen = new Set<string>();
			for (const tag of zapRequest.tags ?? []) {
				if (tag[0] === 'emoji' && tag[1] && tag[2] && !seen.has(tag[1])) {
					seen.add(tag[1]);
					result.emojiTags.push({ shortcode: tag[1], url: tag[2] });
				}
			}
		} catch {
			// Failed to parse zap request, leave sender as null
		}
	}

	return result;
}

/**
 * Publish a NIP-22 comment (kind 1111).
 * Local-first: adds to EventStore (and persist) then publishes to relays.
 * NIP-30 emoji tags are added when emojiTags are provided.
 *
 * @param content - Plain text comment content
 * @param target - App or stack being commented on (contentType + pubkey + identifier)
 * @param signEvent - Auth signer (e.g. from auth store)
 * @param emojiTags - Optional custom emoji shortcode/url for NIP-30 tags
 * @param parentEventId - Optional parent event id (e-tag) for replies
 * @param replyToPubkey - Optional pubkey to p-tag (e.g. zapper when commenting on a zap so they get notified)
 * @param parentKind - Optional parent event kind for NIP-22; use 9735 when commenting on a zap receipt so E,K,k,P tags are emitted and other clients can discover the comment
 * @returns The signed event (already in store and sent to relays)
 */
export async function publishComment(
	content: string,
	target: { contentType: 'app' | 'stack'; pubkey: string; identifier: string },
	signEvent: (template: EventTemplate) => Promise<NostrEvent>,
	emojiTags?: { shortcode: string; url: string }[],
	parentEventId?: string,
	replyToPubkey?: string,
	parentKind?: number
): Promise<NostrEvent> {
	if (!content?.trim()) {
		throw new Error('Comment content is required');
	}
	if (!target?.pubkey?.trim() || !target?.identifier?.trim()) {
		throw new Error('Comment target (pubkey, identifier) is required so the event has an a-tag (kind 1111 / NIP-22).');
	}

	const kind = 32267; // app
	const stackKind = 30267; // stack
	const aTagValue =
		target.contentType === 'app'
			? `${kind}:${target.pubkey}:${target.identifier}`
			: `${stackKind}:${target.pubkey}:${target.identifier}`;
	if (!aTagValue || aTagValue.length < 10) {
		throw new Error('Invalid comment target: a-tag is required for kind 1111.');
	}

	// NIP-22 kind 1111: root scope (a), root kind (K), root pubkey (P); then parent (e, k, p) if reply. Lowercase a/e only.
	const rootKind = target.contentType === 'app' ? kind : stackKind;
	const tags: [string, string, ...string[]][] = [
		['a', aTagValue],
		['K', String(rootKind)],
		['P', target.pubkey.trim().toLowerCase()]
	];

	if (parentEventId) {
		const eId = parentEventId.trim().toLowerCase();
		if (!/^[a-f0-9]{64}$/.test(eId)) {
			throw new Error(
				`Invalid parent event id for comment (expected 64 hex chars): ${parentEventId.slice(0, 20)}...`
			);
		}
		tags.push(['e', eId]);
		tags.push(['k', String(parentKind ?? 1111)]);
		if (replyToPubkey) {
			tags.push(['p', replyToPubkey.trim().toLowerCase()]);
		}
	}
	const emojiList = emojiTags ?? [];
	if (emojiList.length > 0) {
		const seen = new Set<string>();
		for (const { shortcode, url } of emojiList) {
			if (shortcode && url && !seen.has(shortcode)) {
				seen.add(shortcode);
				tags.push(['emoji', shortcode, url]);
			}
		}
	}

	const template: EventTemplate = {
		kind: 1111,
		content: content.trim(),
		tags,
		created_at: Math.floor(Date.now() / 1000)
	};

	const signed = (await signEvent(template)) as NostrEvent;

	await initNostrService();
	const p = getPool();
	const results = await p.publish([...SOCIAL_RELAYS], signed, { timeout: 10000 });
	const accepted = results.filter((r) => r.ok);
	if (accepted.length === 0) {
		const messages = results.map((r) => `${r.from}: ${r.message ?? 'rejected'}`).join('; ');
		throw new Error(`Comment was not accepted by any relay. ${messages}`);
	}

	const store = getEventStore();
	store.add(signed);
	return signed;
}

/**
 * Parse a comment event to extract useful fields.
 * Includes NIP-30 emoji tags when present for use with ShortTextRenderer.
 * Threading: parent id follows NIP-10 — use e tag with marker "reply" if present,
 * otherwise the last e/E tag (direct reply). So replies from other clients nest correctly.
 */
export function parseComment(event: NostrEvent): {
	id: string;
	pubkey: string;
	content: string;
	contentHtml: string;
	emojiTags: { shortcode: string; url: string }[];
	createdAt: number;
	parentId: string | null;
	isReply: boolean;
} {
	const eTags = event.tags.filter((t): t is [string, string, ...string[]] =>
		(t[0] === 'e' || t[0] === 'E') && !!t[1]
	);
	const replyTag = eTags.find((t) => t[3] === 'reply');
	const parentId =
		(replyTag?.[1] ?? eTags[eTags.length - 1]?.[1]) ?? null;

	// NIP-30 emoji tags for custom emoji in content
	const emojiTags: { shortcode: string; url: string }[] = [];
	for (const tag of event.tags) {
		if (tag[0] === 'emoji' && tag[1] && tag[2]) {
			emojiTags.push({ shortcode: tag[1], url: tag[2] });
		}
	}

	// Simple content to HTML conversion (escape HTML, convert newlines) for fallback
	const contentHtml = event.content
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\n/g, '<br>');

	return {
		id: event.id,
		pubkey: event.pubkey,
		content: event.content,
		contentHtml: `<p>${contentHtml}</p>`,
		emojiTags,
		createdAt: event.created_at,
		parentId,
		isReply: parentId !== null
	};
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
