import { EVENT_KINDS, ZAPSTORE_RELAY } from '$lib/config.js';
import { queryEvents } from '../storage/dexie.js';
import { fetchFromRelays } from './service.js';

const ASSET_KINDS = [EVENT_KINDS.ASSET, EVENT_KINDS.FILE_METADATA];

/**
 * Load file/artifact metadata events for release artifact ids.
 *
 * Relay fallback hydrates Dexie and returns the merged event list for the
 * caller's order-sensitive metadata extraction.
 *
 * @param {string[]} artifactIds
 * @param {string[]} relayHints
 */
export async function loadArtifactMetadataEvents(artifactIds, relayHints = []) {
	const ids = [...new Set((artifactIds ?? []).filter(Boolean))];
	if (ids.length === 0) return [];

	let fileEvents = await queryEvents({ kinds: ASSET_KINDS, ids });
	const have = new Set(fileEvents.map((event) => event.id));
	const missing = ids.filter((id) => !have.has(id));
	if (missing.length > 0) {
		const relays = [...new Set([ZAPSTORE_RELAY, ...(relayHints ?? []).filter(Boolean)])];
		await fetchFromRelays(
			relays,
			{ kinds: ASSET_KINDS, ids: missing, limit: missing.length },
			{ timeout: 10000, feature: 'details-tab-files' }
		);
		fileEvents = await queryEvents({ kinds: ASSET_KINDS, ids });
	}

	return fileEvents;
}
