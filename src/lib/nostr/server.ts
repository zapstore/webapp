/**
 * Server-side Nostr utilities backed by relay.db (SQLite).
 *
 * This module intentionally avoids request-time relay websocket fetching.
 * It reads catalog data from SQLite only (Option A).
 */
export {
	fetchAppsByReleases,
	fetchApp,
	fetchLatestReleaseForApp,
	closeServerDb as closeServerPool
} from './server-db';
