import { EVENT_KINDS, FORUM_RELAY, ZAPSTORE_COMMUNITY_PUBKEY } from '$lib/config.js';
import { queryEvents } from '../storage/dexie.js';
import { fetchFromRelays } from '../sync/service.js';

/**
 * Load the Zapstore community event for the details modal.
 *
 * Relay fallback hydrates Dexie first; the returned event comes from the local
 * re-read to preserve the local-first display path.
 */
export async function loadZapstoreCommunityEvent() {
	let [event] = await queryEvents({
		kinds: [EVENT_KINDS.COMMUNITY],
		authors: [ZAPSTORE_COMMUNITY_PUBKEY],
		limit: 1
	});

	if (!event) {
		await fetchFromRelays(
			[FORUM_RELAY],
			{ kinds: [EVENT_KINDS.COMMUNITY], authors: [ZAPSTORE_COMMUNITY_PUBKEY], limit: 1 },
			{ timeout: 5000, feature: 'community-details' }
		);
		[event] = await queryEvents({
			kinds: [EVENT_KINDS.COMMUNITY],
			authors: [ZAPSTORE_COMMUNITY_PUBKEY],
			limit: 1
		});
	}

	return event ?? null;
}
