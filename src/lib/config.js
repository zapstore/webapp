/**
 * Application configuration
 */
// Primary catalog relay — source of app/release/stack events
export const ZAPSTORE_RELAY = 'wss://relay.zapstore.dev';
// Profile relay — kind 0 profiles only
export const VERTEXLAB_RELAY = 'wss://relay.vertexlab.io';
// Both catalog relays (used for publishing and profile resolution)
export const DEFAULT_CATALOG_RELAYS = [ZAPSTORE_RELAY, VERTEXLAB_RELAY];
// Social relays (profiles, comments, zaps) — align with Flutter zapstore app
export const DEFAULT_SOCIAL_RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://nos.lol',
];
// Profile relays (social + catalog for broad coverage)
export const PROFILE_RELAYS = [
    ...DEFAULT_SOCIAL_RELAYS,
    ...DEFAULT_CATALOG_RELAYS,
];
// Server-side poll interval (ms) — how often the server polls upstream relays
export const POLL_INTERVAL_MS = 60_000;
// Relay subscription timeout (ms after first EOSE)
export const EOSE_TIMEOUT = 2500;
// Dexie database name (used for clear-local-data fallback)
export const IDB_NAME = 'zapstore';
// Reserved d-tag for private "Saved Apps" stack (kind 30267). Excluded from public discover/stacks/profile listings.
export const SAVED_APPS_STACK_D_TAG = 'zapstore-bookmarks';

// Event kinds
export const EVENT_KINDS = {
    PROFILE: 0,
    DELETION: 5, // NIP-09
    RELAY_LIST: 10002, // NIP-65
    COMMENT: 1111,
    LABEL: 1985,
    FORUM_POST: 11,
    COMMUNITY: 10222,
    FILE_METADATA: 1063,
    ZAP_REQUEST: 9734,
    ZAP_RECEIPT: 9735,
    RELEASE: 30063,
    APP: 32267,
    APP_STACK: 30267
};

// Zapstore community (kind 10222) — forum posts use #h tag with this pubkey's hex.
// Must match the community we target; all forum fetch/publish use this.
export const ZAPSTORE_COMMUNITY_NPUB = 'npub10r8xl2njyepcw2zwv3a6dyufj4e4ajx86hz6v4ehu4gnpupxxp7stjt2p8';
export const ZAPSTORE_COMMUNITY_RELAY = 'wss://relay.zapstore.dev';

/** Forum relay (kind 11 posts/comments) — same as community relay. */
export const FORUM_RELAY = ZAPSTORE_COMMUNITY_RELAY;

/**
 * Read path for kind 1111 / 9735 — Zapstore only. Comments use `since` + `limit` + NIP-22 `#K` where useful;
 * zap receipts are often read via `kinds`+`since`+`limit` buckets + in-tag filter (`service.js`).
 */
export const COMMENT_AND_ZAP_READ_RELAYS = [ZAPSTORE_RELAY];

/**
 * Wide lookback for relay `since` and Dexie windows; eviction caps IndexedDB volume.
 */
export const COMMENT_ZAP_RELAY_READ_LOOKBACK_SEC = 5 * 365 * 24 * 3600;

/**
 * Default lookback for **nak-style** one-shot comment/zap buckets (`nak req -k 1111 -s $SINCE -l N`).
 * Matches a typical CLI window; widen via `options.since` / `commentZapRelayReadSince()` where needed.
 */
export const COMMENT_ZAP_NAK_LOOKBACK_SEC = 90 * 24 * 3600;

/** Max events per one-shot global 1111 / 9735 bucket before client-side filter to an app/thread. */
export const COMMENT_ZAP_NAK_FETCH_LIMIT = 500;

/** `since` for nak-style one-shot fetches (unix seconds). */
export function commentZapNakReadSince(nowSec = Math.floor(Date.now() / 1000)) {
	return nowSec - COMMENT_ZAP_NAK_LOOKBACK_SEC;
}

/** Default `since` (unix seconds) for **scoped** relay reads and deep fallbacks. */
export function commentZapRelayReadSince(nowSec = Math.floor(Date.now() / 1000)) {
	return nowSec - COMMENT_ZAP_RELAY_READ_LOOKBACK_SEC;
}

/**
 * Human-readable noun for “Delete your …” / reporting copy on own content (ActionsModal, etc.).
 * Keys match BottomBar `contentType` for app, stack, forum.
 */
export const ACTIONS_DELETABLE_CONTENT_LABELS = {
	app: 'App',
	stack: 'Stack',
	forum: 'Forum Post'
};

/** Forum feed categories / post labels — same list for feed filter chips and ForumPostLabelsModal. */
export const FORUM_CATEGORIES = [
	'General',
	'Dev Support',
	'User Support',
	'Feature Request',
	'Ideas',
	'Bugs',
	'Announcements',
	'News',
	'Showcase',
	'Off-Topic'
];

// Platform filter — only Android arm64 is supported for now.
// Spread into every APP / RELEASE relay filter so the relay only returns matching events.
export const PLATFORM_FILTER = { '#f': ['android-arm64-v8a'] };
// Subscription prefixes (for relay backend identification)
export const SUB_PREFIX = 'web-';
