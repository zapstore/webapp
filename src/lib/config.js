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
// Event kinds
export const EVENT_KINDS = {
    PROFILE: 0,
    RELAY_LIST: 10002, // NIP-65
    COMMENT: 1111,
    FILE_METADATA: 1063,
    ZAP_REQUEST: 9734,
    ZAP_RECEIPT: 9735,
    RELEASE: 30063,
    APP: 32267,
    APP_STACK: 30267
};
// Platform filter — only Android arm64 is supported for now.
// Spread into every APP / RELEASE relay filter so the relay only returns matching events.
export const PLATFORM_FILTER = { '#f': ['android-arm64-v8a'] };
// Subscription prefixes (for relay backend identification)
export const SUB_PREFIX = 'web-';
