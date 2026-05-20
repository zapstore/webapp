/**
 * Server hooks — minimal, no polling needed.
 *
 * The server queries relay.zapstore.dev directly at SSR time.
 * No in-memory cache, no warm-up, no polling timers.
 *
 * SIGTERM handler: closes the relay pool so the process exits quickly
 * instead of waiting for open WebSocket connections to drain.
 */
import { destroyServerPool } from '$lib/purpleweb/server.js';

process.on('SIGTERM', () => {
	destroyServerPool();
});
