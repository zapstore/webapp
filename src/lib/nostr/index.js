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
	searchForumPosts,
	fetchAppsByAuthorFromRelays,
	fetchAllAppsByAuthorFromRelays,
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
	fetchCommentsByRootATags,
	fetchCommentRepliesByE,
	fetchKind1111ByTagRef,
	fetchKind1111ReferencingEventIds,
	fetchKind9735MatchingRefs,
	fetchZapReceiptsByPubkeys,
	fetchZaps,
	fetchZapsByEventIds,
	fetchLabelEvents,
	parseZapReceipt,
	parseComment,
	publishComment,
	publishAddressableLabel,
	publishForumPostLabel,
	publishTopicLabelOnEvent,
	publishLabelDeletion,
	publishDeletionRequest,
	fetchLabelsForAddressable,
	groupLabelEventsToEntries,
	publishStack,
	updateStackApps,
	updateStack,
	deleteStack,
	updateAppMetadata
} from './service';

// Models (event parsing)
export {
	parseApp,
	parseRelease,
	parseFileMetadata,
	parseProfile,
	parseForumPost,
	parseAppStack,
	getEventOneliner,
	encodeAppNaddr,
	encodeStackNaddr,
	decodeNaddr
} from './models';

// Zap utilities
export { createZap, subscribeToZapReceipt } from './zap';
