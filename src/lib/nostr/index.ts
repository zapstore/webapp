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
	fetchAppStacks,
	fetchAppStacksParsed,
	fetchApp,
	fetchProfile,
	fetchProfilesBatch,
	cleanup,
	// Low-level query (single source)
	queryStore,
	queryStoreOne,
	queryCache,
	// Unified query API (EventStore → IndexedDB → Relays)
	fetchEvents,
	fetchEvent,
	watchEvents,
	watchEvent,
	// Social features
	queryCommentsFromStore,
	fetchComments,
	watchComments,
	fetchZaps,
	watchZaps,
	parseZapReceipt,
	parseComment,
	publishComment
} from './service';

// Models (event parsing)
export {
	parseApp,
	parseRelease,
	parseFileMetadata,
	parseProfile,
	encodeAppNaddr,
	encodeStackNaddr,
	decodeNaddr
} from './models';

// Zap (stubs; implement when Lightning flow is ready)
export { createZap, subscribeToZapReceipt } from './zap';
export type { ZapTarget, CreateZapResult, SubscribeToZapReceiptOptions } from './zap';

// Types
export type { App, Release, FileMetadata, Profile, AppRef, AppStack } from './models';
export type { NostrEvent, Filter } from 'nostr-tools';
