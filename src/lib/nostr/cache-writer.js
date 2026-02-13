/**
 * Cache Writer — Background event persistence
 *
 * Simple wrapper around Dexie putEvents for backward compatibility.
 * No more Web Worker — Dexie handles IndexedDB writes efficiently.
 */
import { browser } from '$app/environment';
import { putEvents } from './dexie';

/**
 * Persist events to Dexie in the background.
 * Non-blocking: errors are swallowed.
 */
export function persistEventsInBackground(events) {
	if (!browser || !Array.isArray(events) || events.length === 0) return;
	putEvents(events).catch((err) =>
		console.error('[CacheWriter] Background persist failed:', err)
	);
}
