/**
 * Server hooks — runs once on server startup.
 *
 * Starts the relay polling cache immediately so seed data is available
 * for server-rendered pages. The cache warms up from upstream relays,
 * then polling timers keep it fresh (runtime only, not during build).
 *
 * Registers graceful shutdown handlers so the process exits promptly
 * when SIGTERM/SIGINT is received (clears timers, closes WebSockets).
 */
import { startPolling, stopPolling } from '$lib/nostr/relay-cache';

startPolling();

// Register shutdown handler after module init (deferred so Vite
// bundling doesn't interfere with the process.on binding).
setTimeout(() => {
	const shutdown = () => {
		console.log('[Server] Shutdown signal received, cleaning up…');
		stopPolling();
		process.exit(0);
	};
	process.on('SIGTERM', shutdown);
	process.on('SIGINT', shutdown);
}, 0);
