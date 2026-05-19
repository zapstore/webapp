import { browser } from '$app/environment';
import {
	subscribeAddressableSocialRoot,
	subscribeZapReceiptsForEventIds
} from '$lib/nostr/service.js';

/**
 * Open a persistent root-scoped social subscription for an app or stack.
 * Events stream into Dexie; liveQuery remains the UI source of truth.
 *
 * @param {{ kind: number, pubkey: string, identifier: string, mainEventIds?: string[] }} root
 * @param {{ enabled?: boolean, limit?: number, onInitialEose?: () => void }} [options]
 * @returns {{ close: () => void }}
 */
export function subscribeAddressableSocial(root, options = {}) {
	if (!browser || options.enabled === false || !root?.kind || !root?.pubkey || !root?.identifier) {
		return { close() {} };
	}
	return subscribeAddressableSocialRoot(root, {
		limit: options.limit ?? 500,
		feature: 'social-root',
		onInitialEose: options.onInitialEose
	});
}

/**
 * Open persistent zap receipt subscriptions for event ids in a thread.
 * Events stream into Dexie; liveQuery remains the UI source of truth.
 *
 * @param {string[]} eventIds
 * @param {{ enabled?: boolean, limit?: number, onInitialEose?: () => void }} [options]
 * @returns {{ close: () => void }}
 */
export function subscribeEventZaps(eventIds, options = {}) {
	if (!browser || options.enabled === false || !eventIds?.length) {
		return { close() {} };
	}
	return subscribeZapReceiptsForEventIds(eventIds, {
		limit: options.limit ?? 400,
		feature: 'event-zaps',
		onInitialEose: options.onInitialEose
	});
}
