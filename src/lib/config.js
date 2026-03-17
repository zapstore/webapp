/**
 * Application configuration
 */
// Catalog relays — the two sources for app/release/stack data
export const DEFAULT_CATALOG_RELAYS = [
    'wss://relay.zapstore.dev',
    'wss://relay.vertexlab.io'
];
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
    RELAY_LIST: 10002, // NIP-65
    COMMENT: 1111,
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

/** Forum relay override — set to a different relay for testing (e.g. Damus). Leave null to use ZAPSTORE_COMMUNITY_RELAY. */
export const FORUM_RELAY_OVERRIDE = null; // e.g. 'wss://relay.damus.io' for testing
// Platform filter — only Android arm64 is supported for now.
// Spread into every APP / RELEASE relay filter so the relay only returns matching events.
export const PLATFORM_FILTER = { '#f': ['android-arm64-v8a'] };
// Subscription prefixes (for relay backend identification)
export const SUB_PREFIX = 'web-';
