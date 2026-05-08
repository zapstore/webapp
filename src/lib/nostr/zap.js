/**
 * Zap utilities (Lightning/NIP-57)
 *
 * Create zap request (kind 9734), fetch invoice via LNURL.
 * Receipt (kind 9735) is published by the recipient's node;
 * we subscribe via relays and write to Dexie.
 *
 * The zap request `relays` tag includes {@link ZAPSTORE_RELAY} first so backends
 * publish receipts where Zapstore reads (see `zapReceiptPublishRelays`).
 */
import { SimplePool } from 'nostr-tools';
import { resolveLightningAddress, fetchInvoiceFromCallback, validateZapSupport } from '$lib/lnurl';
import { fetchProfile, fetchRecipientInboxRelayUrls } from './service';
import { putEvents } from './dexie';
import { DEFAULT_SOCIAL_RELAYS, SUB_PREFIX, ZAPSTORE_RELAY } from '$lib/config';

const subId = (feature) => `${SUB_PREFIX}${feature}-${Math.floor(Math.random() * 1e9)}`;

/** Relays LN backends should publish zap receipts to (NIP-57 `relays` tag). Zapstore first, then social fallbacks. */
function zapReceiptPublishRelays() {
	return [...new Set([ZAPSTORE_RELAY, ...DEFAULT_SOCIAL_RELAYS])];
}

/**
 * Create a zap request (NIP-57), fetch Lightning invoice from LNURL callback,
 * and return invoice + zap request id.
 */
export async function createZap(target, amountSats, comment, signEvent, emojiTags) {
	if (!target?.pubkey?.trim()) {
		throw new Error('Zap target must have a pubkey');
	}

	const recipientHex = target.pubkey.trim().toLowerCase();
	if (!/^[a-f0-9]{64}$/.test(recipientHex)) {
		throw new Error('Zap target pubkey must be a 64-character hex string');
	}

	const amountMillisats = Math.round(amountSats) * 1000;
	if (amountMillisats < 1000) {
		throw new Error('Amount must be at least 1 sat');
	}

	// 1. Get recipient profile for lud16 and inbox relays in parallel
	const [profileEvent, recipientInboxUrls] = await Promise.all([
		fetchProfile(recipientHex),
		fetchRecipientInboxRelayUrls(recipientHex)
	]);
	if (!profileEvent?.content) {
		throw new Error('Could not load recipient profile');
	}

	let profile;
	try {
		profile = JSON.parse(profileEvent.content);
	} catch {
		throw new Error('Invalid profile data');
	}

	const lud16 = profile.lud16 ?? profile.lud06;
	if (!lud16) {
		throw new Error('Recipient has no Lightning address (lud16) in their profile');
	}
	if (profile.lud06) {
		throw new Error('LNURL (lud06) is not supported. Recipient should use a Lightning address (lud16).');
	}

	// 2. Resolve LNURL and validate zap support
	const lnurlData = await resolveLightningAddress(lud16);
	validateZapSupport(lnurlData);

	if (amountMillisats < lnurlData.minSendable) {
		throw new Error(`Amount too small. Minimum: ${Math.ceil(lnurlData.minSendable / 1000)} sats`);
	}
	if (amountMillisats > lnurlData.maxSendable) {
		throw new Error(`Amount too large. Maximum: ${Math.floor(lnurlData.maxSendable / 1000)} sats`);
	}
	if (comment && lnurlData.commentAllowed != null && comment.length > lnurlData.commentAllowed) {
		throw new Error(`Comment too long. Maximum ${lnurlData.commentAllowed} characters.`);
	}

	// 3. Build zap request (kind 9734)
	const relays = [...new Set([...zapReceiptPublishRelays(), ...recipientInboxUrls])];
	const tags = [
		['p', recipientHex],
		['amount', amountMillisats.toString()],
		['relays', relays[0] ?? '', ...relays.slice(1)],
		['lnurl', lud16]
	];

	if (target.id?.trim()) {
		const eId = target.id.trim().toLowerCase();
		if (/^[a-f0-9]{64}$/.test(eId)) {
			tags.push(['e', eId, ZAPSTORE_RELAY]);
		}
	}

	if (target.aTag) {
		tags.push(['a', target.aTag, ZAPSTORE_RELAY]);
	} else if (target.dTag && recipientHex) {
		tags.push(['a', `32267:${recipientHex}:${target.dTag}`, ZAPSTORE_RELAY]);
	}

	if (emojiTags?.length) {
		const seen = new Set();
		for (const { shortcode, url } of emojiTags) {
			if (shortcode && url && !seen.has(shortcode)) {
				seen.add(shortcode);
				tags.push(['emoji', shortcode, url]);
			}
		}
	}

	const template = {
		kind: 9734,
		content: comment ?? '',
		tags,
		created_at: Math.floor(Date.now() / 1000)
	};

	const signed = await signEvent(template);
	if (!signed?.id) throw new Error('Failed to sign zap request');

	const serialized = JSON.stringify(signed);

	// 4. Fetch invoice from LNURL callback
	const invoiceResponse = await fetchInvoiceFromCallback(
		lnurlData.callback,
		amountMillisats,
		serialized,
		comment || undefined
	);

	return {
		invoice: invoiceResponse.pr,
		zapRequest: { id: signed.id },
		/** Exact relay list embedded in the zap request — the LN backend will publish the receipt to these. */
		relays,
		/** LN node pubkey from the LNURL endpoint — use this to validate the receipt's `pubkey` (NIP-57 Appendix F). */
		nostrPubkey: lnurlData.nostrPubkey
	};
}

/**
 * Subscribe for a zap receipt (kind 9735).
 * When received, writes to Dexie and calls onReceipt.
 *
 * `options.zapStartedAt` (unix seconds) anchors `since` to the moment the user
 * initiated the zap — before createZap's LNURL network latency eats into the window.
 * Falls back to now if not provided. A generous 5-minute lookback is added on top to
 * survive slow WebSocket handshakes, slow LN backends, and clock skew.
 * Auto-reconnects when the relay closes the subscription (SimplePool does not reconnect on its own).
 */
export function subscribeToZapReceipt(recipientPubkey, zapRequestId, onReceipt, options) {
	const pool = new SimplePool();
	let sub = null;
	let closed = false;
	let reconnectTimer = null;
	// Merge caller-supplied relays (from the actual zap request) with the base set.
	// The LN backend publishes to all relays in the zap request's `relays` tag — we must
	// subscribe to all of them, not just the hardcoded base set.
	const readRelays = [...new Set([
		...(options?.relays ?? []),
		...zapReceiptPublishRelays()
	])];
	// Use the caller-supplied start time so the window isn't shortened by createZap latency.
	const zapStartedAt = options?.zapStartedAt ?? Math.floor(Date.now() / 1000);
	const since = zapStartedAt - 300;

	const run = () => {
		if (closed) return;
		try { sub?.close(); } catch { /* noop */ }
		sub = pool.subscribeMany(
			readRelays,
			{
				kinds: [9735],
				'#p': [recipientPubkey],
				since,
				limit: 100
			},
			{
				id: subId('zap'),
				onevent(event) {
					const descTag = event.tags?.find((t) => t[0] === 'description')?.[1];
					if (!descTag) return;
					try {
						const zapReq = JSON.parse(descTag);
						if (zapReq.id === zapRequestId) {
							void putEvents([event])
								.then(() => onReceipt(event))
								.catch(() => onReceipt(event));
						}
					} catch {
						/* ignore parse errors from non-compliant backends */
					}
				},
				onclose() {
					// Relay closed the sub (timeout, disconnect, etc.) — reconnect unless
					// we've been intentionally cleaned up via the returned unsubscribe fn.
					if (!closed) {
						reconnectTimer = setTimeout(run, 2000);
					}
				}
			}
		);
	};

	run();

	return () => {
		closed = true;
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		try { sub?.close(); } catch { /* noop */ }
		pool.close(readRelays);
	};
}

/**
 * One-shot fallback: search all known relays for a specific zap receipt.
 * Used when the live subscription timed out (user clicked "I've paid, close this").
 * Resolves with the receipt event if found, or null if not found within the timeout.
 *
 * @param {string} recipientPubkey - hex pubkey of the zap recipient
 * @param {string} zapRequestId - id of the kind 9734 zap request event
 * @param {string[]} zapRelays - relays from the original zap request (merged with base set)
 * @param {number} since - unix timestamp to search from (zapStartedAt)
 * @returns {Promise<import('nostr-tools').NostrEvent | null>}
 */
export async function fetchZapReceiptFallback(recipientPubkey, zapRequestId, zapRelays, since) {
	const pool = new SimplePool();
	const readRelays = [...new Set([...(zapRelays ?? []), ...zapReceiptPublishRelays()])];
	const searchSince = (since ?? Math.floor(Date.now() / 1000)) - 300;

	return new Promise((resolve) => {
		let found = false;
		let settled = false;
		let sub = null;

		const finish = (result = null) => {
			if (settled) return;
			settled = true;
			try { sub?.close(); } catch { /* noop */ }
			pool.close(readRelays);
			resolve(result);
		};

		sub = pool.subscribeMany(
			readRelays,
			{
				kinds: [9735],
				'#p': [recipientPubkey],
				since: searchSince,
				limit: 200
			},
			{
				id: subId('zap-fallback'),
				onevent(event) {
					if (found) return;
					const descTag = event.tags?.find((t) => t[0] === 'description')?.[1];
					if (!descTag) return;
					try {
						const zapReq = JSON.parse(descTag);
						if (zapReq.id === zapRequestId) {
							found = true;
							finish(event);
						}
					} catch { /* ignore */ }
				},
				oneose() {
					if (!found) finish(null);
				},
				onclose() {
					if (!settled) finish(null);
				}
			}
		);

		// Hard timeout: 10s
		setTimeout(() => finish(null), 10000);
	});
}
