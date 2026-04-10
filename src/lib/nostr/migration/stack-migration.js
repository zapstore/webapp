/**
 * Stack migration logic.
 * Detects and fixes public stacks missing required tags (h, f).
 */

import {
	ZAPSTORE_COMMUNITY_PUBKEY,
	PLATFORM_FILTER,
	SAVED_APPS_STACK_D_TAG
} from '$lib/config.js';

/**
 * Check if a stack needs migration.
 * A public stack needs migration if it's missing:
 * - h tag with ZAPSTORE_COMMUNITY_PUBKEY
 * - f tag with platform filter (android-arm64-v8a)
 *
 * @param {import('nostr-tools').NostrEvent} stackEvent - Stack event (kind 30267)
 * @returns {boolean}
 */
export function stackNeedsMigration(stackEvent) {
	// Skip private/encrypted stacks (non-empty content)
	if (stackEvent.content && stackEvent.content.trim() !== '') return false;

	// Skip user's saved-apps bookmark stack
	const dTag = stackEvent.tags.find((t) => t[0] === 'd')?.[1];
	if (dTag === SAVED_APPS_STACK_D_TAG) return false;

	// Skip installed-apps backup stack
	if (dTag === 'zapstore-installed-backup') return false;

	const hTags = stackEvent.tags.filter((t) => t[0] === 'h').map((t) => t[1]);
	const fTags = stackEvent.tags.filter((t) => t[0] === 'f').map((t) => t[1]);

	const platform = PLATFORM_FILTER['#f'][0]; // android-arm64-v8a

	const hasH = hTags.includes(ZAPSTORE_COMMUNITY_PUBKEY);
	const hasF = fTags.includes(platform);

	return !hasH || !hasF;
}

/**
 * Get missing tags for a stack that needs migration.
 * Useful for UI display.
 *
 * @param {import('nostr-tools').NostrEvent} stackEvent
 * @returns {{ missingH: boolean, missingF: boolean }}
 */
export function getStackMissingTags(stackEvent) {
	const hTags = stackEvent.tags.filter((t) => t[0] === 'h').map((t) => t[1]);
	const fTags = stackEvent.tags.filter((t) => t[0] === 'f').map((t) => t[1]);

	const platform = PLATFORM_FILTER['#f'][0];

	return {
		missingH: !hTags.includes(ZAPSTORE_COMMUNITY_PUBKEY),
		missingF: !fTags.includes(platform)
	};
}

/**
 * Transform a stack event for migration by adding missing tags.
 * Does NOT sign - returns unsigned template.
 *
 * @param {import('nostr-tools').NostrEvent} stackEvent - Original stack event
 * @returns {{ kind: number, created_at: number, tags: string[][], content: string }}
 */
export function transformStackForMigration(stackEvent) {
	const tags = stackEvent.tags.map((t) => [...t]);
	const platform = PLATFORM_FILTER['#f'][0];

	// Add h tag if missing
	const hasH = tags.some((t) => t[0] === 'h' && t[1] === ZAPSTORE_COMMUNITY_PUBKEY);
	if (!hasH) {
		tags.push(['h', ZAPSTORE_COMMUNITY_PUBKEY]);
	}

	// Add f tag if missing
	const hasF = tags.some((t) => t[0] === 'f' && t[1] === platform);
	if (!hasF) {
		tags.push(['f', platform]);
	}

	return {
		kind: 30267,
		created_at: stackEvent.created_at + 1, // +1s for relay replacement acceptance
		tags,
		content: stackEvent.content || ''
	};
}

/**
 * @typedef {Object} StackMigrationResult
 * @property {boolean} success
 * @property {string} [stackId] - ID of migrated stack
 * @property {string} [error] - Error message if failed
 */

/**
 * Migrate a single stack by adding missing tags and re-publishing.
 *
 * @param {import('nostr-tools').NostrEvent} stackEvent - Stack to migrate
 * @param {function} signEvent - NIP-07 signer function
 * @param {function} publishToRelays - Function to publish event to relays
 * @returns {Promise<StackMigrationResult>}
 */
export async function migrateStack(stackEvent, signEvent, publishToRelays) {
	if (!stackNeedsMigration(stackEvent)) {
		return { success: false, error: 'Stack does not need migration' };
	}

	try {
		const template = transformStackForMigration(stackEvent);
		const signed = await signEvent(template);
		await publishToRelays(signed);

		return {
			success: true,
			stackId: signed.id
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
