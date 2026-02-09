/**
 * Application configuration
 */

// Default catalog relays (app data)
export const DEFAULT_CATALOG_RELAYS = [
	'wss://relay.zapstore.dev'
] as const;

// Default social relays (profiles, comments, zaps) — align with Flutter zapstore app
export const DEFAULT_SOCIAL_RELAYS = [
	'wss://relay.damus.io',
	'wss://relay.primal.net',
	'wss://nos.lol',
] as const;

// Extra relay for profile lookups (Flutter uses social + vertex for profiles)
export const PROFILE_RELAYS = [
	...DEFAULT_SOCIAL_RELAYS,
	'wss://relay.vertexlab.io',
] as const;

// Relay subscription timeout (ms after first EOSE)
export const EOSE_TIMEOUT = 2500;

// IndexedDB configuration
export const IDB_NAME = 'zapstore-webapp';
export const IDB_VERSION = 3;

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
} as const;

// Subscription prefixes (for relay backend identification)
export const SUB_PREFIX = 'web-';
