import { browser } from '$app/environment';
import { EVENT_KINDS } from '$lib/config.js';
import { liveQuery, queryEvents } from '../storage/dexie.js';
import { parseZapReceipt } from '../sync/service.js';

/**
 * Reactive unread indicator for the app header inbox.
 *
 * @param {() => string | null | undefined} getPubkey
 * @param {() => unknown} getSignal
 * @param {(pubkey: string) => number | null | undefined} getOpenedAtSec
 * @param {(pubkey: string) => Set<string>} readSeenIds
 */
export function createInboxUnreadQuery(getPubkey, getSignal, getOpenedAtSec, readSeenIds) {
	const state = $state({ count: 0, hasUnread: false });

	$effect(() => {
		const pubkey = getPubkey?.();
		getSignal?.();
		if (!browser || !pubkey) {
			state.count = 0;
			state.hasUnread = false;
			return;
		}

		const obs = liveQuery(async () => {
			const [comments, zaps] = await Promise.all([
				queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#p': [pubkey], limit: 250 }),
				queryEvents({ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#p': [pubkey], limit: 250 })
			]);
			const headerOpenedAt = getOpenedAtSec(pubkey);
			const seen = readSeenIds(pubkey);
			let count = 0;

			if (headerOpenedAt != null) {
				for (const event of comments) {
					if (event.pubkey === pubkey) continue;
					if (event.created_at > headerOpenedAt) count++;
				}
				for (const event of zaps) {
					if (!event.tags?.some((tag) => tag[0] === 'p' && tag[1] === pubkey)) continue;
					try {
						const parsed = parseZapReceipt(event);
						if (parsed.senderPubkey === pubkey) continue;
						if (event.created_at > headerOpenedAt) count++;
					} catch {
						// skip malformed zap receipts
					}
				}
			} else {
				for (const event of comments) {
					if (event.pubkey === pubkey) continue;
					if (!seen.has(event.id)) count++;
				}
				for (const event of zaps) {
					if (!event.tags?.some((tag) => tag[0] === 'p' && tag[1] === pubkey)) continue;
					try {
						const parsed = parseZapReceipt(event);
						if (parsed.senderPubkey === pubkey) continue;
						if (!seen.has(event.id)) count++;
					} catch {
						// skip malformed zap receipts
					}
				}
			}

			return count;
		});

		const sub = obs.subscribe({
			next(value) {
				state.count = value ?? 0;
				state.hasUnread = state.count > 0;
			},
			error() {
				state.count = 0;
				state.hasUnread = false;
			}
		});

		return () => sub.unsubscribe();
	});

	return state;
}
