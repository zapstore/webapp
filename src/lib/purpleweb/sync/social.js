import { browser } from '$app/environment';
import { subscribeAddressableSocialRoot } from '$lib/nostr/service.js';

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
