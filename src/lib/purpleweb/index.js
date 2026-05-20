/**
 * Purpleweb — local-first data-loading framework for the Zapstore webapp.
 *
 * Single public surface for every read, write, and live subscription that
 * touches IndexedDB or a relay. Routes and components import data-loading
 * functions from here only; direct imports from `$lib/purpleweb/storage/*`
 * or `$lib/purpleweb/sync/*` are forbidden by ESLint.
 *
 * What lives outside the framework
 *   - `$lib/nostr/models.js`        — pure event parsers (no I/O)
 *   - `$lib/nostr/naddr.js`         — pure NIP-19 helpers
 *   - `$lib/nostr/thread-discussion.js`, `zap-thread.js` — pure algorithmic
 *     helpers for building threaded views from event maps
 *   - `$lib/nostr/migration/`       — release-format transforms
 *
 * Internal layout (do not import directly)
 *   storage/    IndexedDB + queries     (Dexie schema, queryEvents, putEvents)
 *   sync/       relay I/O               (fetch, subscribe, live, search, social)
 *   server.js   SSR loaders             (Node-side relay fetches)
 *   svelte/     Svelte query primitives (createDetailQuery, createListingQuery)
 *   models/     Per-kind model registry (purpleweb internals)
 */

// ============================================================================
// Storage — Dexie / IndexedDB
// ============================================================================
//
// `queryEvents` is the universal NIP-01 → Dexie query engine. Every read,
// inside liveQuery or one-shot, goes through it.

export {
	activityRootKeyMetaFromComment,
	addrTagFromComment,
	batchResolveAddrRootsFromDexie,
	batchResolveForumRootsByIdFromDexie,
	buildActivityRootLookupMaps,
	resolveActivityRootsFromDexie
} from './core/activity-roots.js';

export {
	db,
	putEvents,
	queryEvents,
	queryEvent,
	liveQuery,
	queryForumThreadCommentsByPostId,
	queryZapReceiptsByTargetEventId,
	evictOldEvents
} from './storage/dexie.js';

import { clearLocalData as clearDexieStorage } from './storage/dexie.js';

/** Clears Dexie + session listing caches (preview backfill dedupe, etc.). */
export async function clearLocalData() {
	const { resetStacksListingSession } = await import('./svelte/stacks-listing.svelte.js');
	resetStacksListingSession();
	const { clearListingCache } = await import('./svelte/createListingQuery.svelte.js');
	clearListingCache('stacks');
	await clearDexieStorage();
}

export { persistEventsInBackground } from './storage/cache-writer.js';

// ============================================================================
// Sync — Relay I/O
// ============================================================================
//
// Default mode: relay → Dexie (then UI reads from Dexie via liveQuery).
// Raw mode: search/order-sensitive callers consume events directly without
// going through liveQuery; results may still be written to Dexie as a side
// effect for back-nav, but the function's return value is the relay-ordered
// list. `searchApps`, `searchForumPosts`, `searchForumComments` use this mode.

export {
	// Generic relay I/O
	fetchFromRelays,
	publishToRelays,
	cleanup,
	startLiveSubscriptions,
	stopLiveSubscriptions,
	startUserInboxLiveUpdates,
	stopUserInboxLiveUpdates,
	syncDeletions,
	installZapstoreDebugHooks,
	subscribeAddressableSocialRoot,
	subscribeZapReceiptsForEventIds,

	// Catalog reads
	fetchAppsByAuthorFromRelays,
	fetchAllAppsByAuthorFromRelays,
	fetchAppFromRelays,
	fetchStacksByAuthorFromRelays,
	fetchStackFromRelays,
	resolveAppEventForNaddr,
	resolveStackEventForNaddr,
	fetchReleasesFromRelays,

	// Profiles
	fetchProfile,
	fetchProfilesBatch,

	// Search — raw-mode: returns events in relay order (relevance)
	searchApps,
	searchForumPosts,
	searchForumComments,

	// Social reads
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
	fetchLabelsForAddressable,

	// Social parsers / helpers
	parseZapReceipt,
	parseComment,
	parseZapFromCommentWrapper,
	groupLabelEventsToEntries,

	// Publishing
	publishComment,
	publishZapCommentWrapper,
	publishStack,
	updateStackApps,
	updateStack,
	deleteStack,
	updateAppMetadata,
	publishAddressableLabel,
	publishForumPostLabel,
	publishTopicLabelOnEvent,
	publishLabelDeletion,
	publishDeletionRequest,

	// Publish-relay resolution
	buildEventPublishRelayUrls
} from './sync/service.js';

// Zap flow (LNURL → invoice → receipt subscription)
export {
	createZap,
	subscribeToZapReceipt,
	fetchZapReceiptFallback
} from './sync/zap.js';

// ============================================================================
// Svelte query primitives & per-kind page wrappers
// ============================================================================

// Detail pages — one entity (app, stack, profile, forum post).
export { createAppDetailQuery } from './svelte/app-detail.svelte.js';
export { createStackDetailQuery } from './svelte/stack-detail.svelte.js';
export { createProfileDetailQuery } from './svelte/profile-detail.svelte.js';
export { createProfileActivityQuery } from './svelte/profile-activity.svelte.js';
export { createForumPostQuery } from './svelte/forum-post.svelte.js';

// Listings — reactive page lists with relay-backed pagination.
export { createAppsListingQuery } from './svelte/apps-listing.svelte.js';
export { createStacksListingQuery } from './svelte/stacks-listing.svelte.js';

// Social tabs (comments / zaps / labels) shared by detail pages.
export {
	createAddressableSocialQuery,
	createAppSocialQuery,
	createStackSocialQuery
} from './svelte/social.svelte.js';
