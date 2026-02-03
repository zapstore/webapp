/**
 * Nostr module exports
 *
 * Main entry point for Nostr functionality using Applesauce patterns.
 */

// Service layer (Applesauce integration)
export {
	getEventStore,
	getPool,
	initNostrService,
	loadCacheIntoStore,
	isInitialized,
	hasCachedEvents,
	fetchFromRelays,
	fetchAppsByReleases,
	cleanup,
	// Low-level query (single source)
	queryStore,
	queryStoreOne,
	queryCache,
	// Unified query API (EventStore → IndexedDB → Relays)
	fetchEvents,
	fetchEvent,
	watchEvents,
	watchEvent
} from './service';

// Models (event parsing)
export {
	parseApp,
	parseRelease,
	parseFileMetadata,
	parseProfile,
	encodeAppNaddr,
	decodeNaddr
} from './models';

// Types
export type { App, Release, FileMetadata, Profile } from './models';
export type { NostrEvent, Filter } from 'nostr-tools';
