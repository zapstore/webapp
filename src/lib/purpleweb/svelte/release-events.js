/**
 * Release-list helpers for the app-detail read path.
 *
 * The catalog relay keeps a copy of every release under the indexer's own key
 * next to the app author's original event. Both copies share the `d` tag
 * (`package@version`), so the same release address can be present twice with
 * different event ids and pubkeys. The apps listing already collapses releases
 * per app identifier; the detail path needs the same collapse keyed on the
 * release address.
 */

/**
 * Collapse release events down to one event per release address.
 *
 * The address is the `d` tag (`package@version`); events without a `d` tag are
 * keyed by their event id. When both an author copy and a mirrored copy exist
 * for one address, the author's event (`event.pubkey === appPubkey`) wins; a
 * mirrored copy is kept only when it is the only event for that address.
 *
 * @param {import('nostr-tools').Event[]} events
 * @param {string} [appPubkey]
 */
export function collapseReleaseEvents(events, appPubkey) {
	/** @type {Map<string, import('nostr-tools').Event>} */
	const byAddress = new Map();

	for (const event of events ?? []) {
		if (!event?.id) continue;

		const dTag = event.tags?.find((tag) => tag[0] === 'd' && typeof tag[1] === 'string')?.[1];
		const key = dTag ? `d:${dTag}` : `id:${event.id}`;
		const current = byAddress.get(key);

		if (!current) {
			byAddress.set(key, event);
			continue;
		}

		const isAuthor = event.pubkey === appPubkey;
		const currentIsAuthor = current.pubkey === appPubkey;
		if (isAuthor !== currentIsAuthor) {
			if (isAuthor) byAddress.set(key, event);
		} else if ((event.created_at ?? 0) > (current.created_at ?? 0)) {
			byAddress.set(key, event);
		}
	}

	return [...byAddress.values()].sort(
		(/** @type {any} */ a, /** @type {any} */ b) => (b.created_at ?? 0) - (a.created_at ?? 0)
	);
}
