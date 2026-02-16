/**
 * Nostr module exports
 *
 * Main entry point for Nostr functionality.
 */

// Dexie database and helpers
export { db, putEvents, queryEvents, queryEvent, liveQuery } from './dexie';

// Service layer (client-side)
export {
	searchApps,
	fetchAppsByAuthorFromRelays,
	fetchAppFromRelays,
	fetchReleasesFromRelays,
	fetchFromRelays,
	fetchProfile,
	fetchProfilesBatch,
	cleanup,
	// Social features
	queryCommentsFromStore,
	fetchComments,
	fetchCommentRepliesByE,
	fetchZapReceiptsByPubkeys,
	fetchZaps,
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
	parseAppStack,
	encodeAppNaddr,
	encodeStackNaddr,
	decodeNaddr
} from './models';

// Zap utilities
export { createZap, subscribeToZapReceipt } from './zap';
