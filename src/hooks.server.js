/**
 * Server hooks — runs once on server startup.
 *
 * Starts the relay polling cache immediately so seed data is available
 * for server-rendered pages. The cache warms up from upstream relays,
 * then polling timers keep it fresh (runtime only, not during build).
 */
import { startPolling } from '$lib/nostr/relay-cache';

startPolling();
