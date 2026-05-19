/**
 * Tiny helpers shared by purpleweb storage reads.
 *
 * Read functions live next to their use site (see `storage/social.js`).
 * Earlier versions of this file also exposed generic `queryModels`,
 * `queryRelationship`, and `queryModelGraph` builders driven by model
 * relationship specs — they had no consumers and were removed.
 */

/**
 * @param {import('nostr-tools').Event[]} events
 */
export function dedupeEvents(events) {
	const byId = new Map();
	for (const event of events ?? []) {
		if (event?.id && !byId.has(event.id)) byId.set(event.id, event);
	}
	return [...byId.values()].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
}
