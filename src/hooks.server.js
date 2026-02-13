/**
 * Server hooks — runs once on server startup.
 *
 * Starts the relay polling cache immediately so seed data
 * is available before any request arrives.
 */
import { startPolling } from '$lib/nostr/relay-cache';

startPolling();
