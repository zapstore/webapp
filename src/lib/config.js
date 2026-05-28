/**
 * Application configuration
 */
import { nip19 } from 'nostr-tools';

// Site identity — single source of truth for all meta tags, manifest, JSON-LD, llms.txt
export const SITE_URL = 'https://zapstore.dev';
export const SITE_NAME = 'Zapstore';
export const SITE_TITLE = 'Zapstore — The Open App Store';
export const SITE_DESCRIPTION =
	'The open app store where users meet builders. Curated by communities. Android apps.';
export const SITE_ICON = `${SITE_URL}/zapstore-icon.png`;
export const SITE_THEME_COLOR = '#7c3aed';
export const SITE_TWITTER = '@zapstore_';
export const SITE_GITHUB = 'https://github.com/zapstore/zapstore';
// Primary catalog relay — apps/releases/stacks/comments/zaps/labels/synced social are read & published here (see relay pipeline).
export const ZAPSTORE_RELAY = 'wss://relay.zapstore.dev';
/** Zapstore Blossom CDN — same as zsp `BLOSSOM_URL` default; kind 24242 auth + PUT `/upload`. */
export const ZAPSTORE_BLOSSOM_URL = 'https://cdn.zapstore.dev';
// Profile indexer relay — kind 0 (+ NIP-50 profile search). Not for catalog/comments/zaps reads.
export const VERTEXLAB_RELAY = 'wss://relay.vertexlab.io';
/** One-shot fetches for kind 0 by author / profile batch only. */
export const PROFILE_FETCH_RELAYS = [VERTEXLAB_RELAY];
/** Default publish targets for apps, stacks, releases, migrations, studio. */
export const DEFAULT_CATALOG_RELAYS = [ZAPSTORE_RELAY];
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
    ASSET: 3063,
    ZAP_REQUEST: 9734,
    ZAP_RECEIPT: 9735,
    RELEASE: 30063,
    APP: 32267,
    APP_STACK: 30267
};

// Zapstore community (kind 10222) — forum posts use #h tag with this pubkey's hex.
// Must match the community we target; all forum fetch/publish use this.
export const ZAPSTORE_NPUB = 'npub10r8xl2njyepcw2zwv3a6dyufj4e4ajx86hz6v4ehu4gnpupxxp7stjt2p8';
/** Hex form of {@link ZAPSTORE_NPUB} — author of indexer-catalog kind 32267 events used for indexer-access lookups. */
export const ZAPSTORE_INDEXER_PUBKEY = /** @type {string} */ (nip19.decode(ZAPSTORE_NPUB).data);
// Hex pubkey for the zapstore community — used in h/p tags on public stacks and forum posts.
export const ZAPSTORE_COMMUNITY_NPUB = 'npub14nl2afh9zsswsp5043zxe2w304afaa496gxe8z2w2rlw84ys92zqlnjx5u';
export const ZAPSTORE_COMMUNITY_PUBKEY = /** @type {string} */ (nip19.decode(ZAPSTORE_COMMUNITY_NPUB).data);
export const ZAPSTORE_COMMUNITY_RELAY = 'wss://relay.zapstore.dev';

/** Forum relay (kind 11 posts/comments) — same as community relay. */
export const FORUM_RELAY = ZAPSTORE_COMMUNITY_RELAY;

/**
 * Primary catalog target for kind 1111 — `publishComment()` awaits this set only (UI “accepted”).
 * Social + signer NIP-65 write relays are merged and published afterward without blocking the promise.
 *
 * **Inside each comment event**, NIP-22 `e` / `E` / `a` / `A` relay hints remain {@link ZAPSTORE_RELAY}.
 */
export const COMMENT_PUBLISH_RELAYS = [ZAPSTORE_RELAY];

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
