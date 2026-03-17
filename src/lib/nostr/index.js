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
	publishToRelays,
	cleanup,
	// Social features
	queryCommentsFromStore,
	fetchComments,
	fetchCommentRepliesByE,
	fetchZapReceiptsByPubkeys,
	fetchZaps,
	parseZapReceipt,
	parseComment,
	publishComment,
	publishStack,
	updateStackApps,
	updateStack,
	deleteStack
} from './service';

// Models (event parsing)
export {
	parseApp,
	parseRelease,
	parseFileMetadata,
	parseProfile,
	parseForumPost,
	parseAppStack,
	encodeAppNaddr,
	encodeStackNaddr,
	decodeNaddr
} from './models';

// Zap utilities
export { createZap, subscribeToZapReceipt } from './zap';
