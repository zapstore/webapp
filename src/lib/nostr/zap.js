/**
 * Zap utilities (NIP-57)
 *
 * Flow:
 *   1. createZap       — build kind 9734, fetch LNURL invoice
 *   2. subscribeToZapReceipt — listen for kind 9735 on all zap-request relays
 *   3. ensureReceiptOnZapstoreRelay — republish receipt to zapstore.dev on receipt
 *   4. fetchZapReceiptFallback — one-shot search when live sub timed out (manual close)
 *
 * relay.zapstore.dev is the canonical store. The LN backend publishes there directly
 * (it's first in the relays tag). We also republish from the client as a safety net.
 */
import { SimplePool } from 'nostr-tools';
import { resolveLightningAddress, fetchInvoiceFromCallback, validateZapSupport } from '$lib/lnurl';
import { fetchProfile, fetchRecipientInboxRelayUrls } from './service';
import { putEvents } from './dexie';
import { DEFAULT_SOCIAL_RELAYS, SUB_PREFIX, ZAPSTORE_RELAY } from '$lib/config';

const subId = (feature) => `${SUB_PREFIX}${feature}-${Math.floor(Math.random() * 1e9)}`;

/**
 * Relays included in the zap request's `relays` tag.
 * zapstore.dev is first — highest priority signal to the LN backend.
 * Social relays follow for broad fan-out. Recipient inbox relays are appended per-zap.
 */
function zapReceiptPublishRelays() {
	return [ZAPSTORE_RELAY, ...DEFAULT_SOCIAL_RELAYS];
}

/**
 * Republish a caught zap receipt to relay.zapstore.dev.
 * Safety net for LN backends that skip zapstore.dev in their fan-out.
 * Fire-and-forget — never blocks the receipt callback.
 */
function ensureReceiptOnZapstoreRelay(pool, event) {
	if (!event?.id) return;
	try {
		const results = pool.publish([ZAPSTORE_RELAY], event);
		const promises = Array.isArray(results) ? results : [results];
		for (const p of promises) {
			p?.catch?.((err) => {
				console.warn('[zap] relay.zapstore.dev rejected receipt:', String(err?.message ?? err), { eventId: event.id });
			});
		}
	} catch (err) {
		console.warn('[zap] ensureReceiptOnZapstoreRelay error:', err);
	}
}

/**
 * Build a NIP-57 kind 9734 zap request, fetch the LNURL invoice, and return both.
 *
 * @param {{ pubkey: string, dTag?: string, aTag?: string, id?: string, name?: string }} target
 */
export async function createZap(target, amountSats, comment, signEvent, emojiTags) {
	if (!target?.pubkey?.trim()) throw new Error('Zap target must have a pubkey');

	const recipientHex = target.pubkey.trim().toLowerCase();
	if (!/^[a-f0-9]{64}$/.test(recipientHex)) {
		throw new Error('Zap target pubkey must be a 64-character hex string');
	}

	const amountMillisats = Math.round(amountSats) * 1000;
	if (amountMillisats < 1000) throw new Error('Amount must be at least 1 sat');

	const [profileEvent, recipientInboxUrls] = await Promise.all([
		fetchProfile(recipientHex),
		fetchRecipientInboxRelayUrls(recipientHex)
	]);
	if (!profileEvent?.content) throw new Error('Could not load recipient profile');

	let profile;
	try {
		profile = JSON.parse(profileEvent.content);
	} catch {
		throw new Error('Invalid profile data');
	}

	const lud16 = profile.lud16 ?? profile.lud06;
	if (!lud16) throw new Error('Recipient has no Lightning address (lud16) in their profile');
	if (profile.lud06) throw new Error('LNURL (lud06) is not supported. Recipient must use a Lightning address (lud16).');

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

	// Build kind 9734 tags
	const relays = [...new Set([...zapReceiptPublishRelays(), ...recipientInboxUrls])];
	const tags = [
		['p', recipientHex],
		['amount', amountMillisats.toString()],
		['relays', relays[0] ?? '', ...relays.slice(1)],
		['lnurl', lud16]
	];

	// e tag: only for non-replaceable event targets (comments, specific events).
	// App zaps use only the a tag — apps are addressable (kind 32267).
	if (target.id?.trim()) {
		const eId = target.id.trim().toLowerCase();
		if (/^[a-f0-9]{64}$/.test(eId)) tags.push(['e', eId, ZAPSTORE_RELAY]);
	}

	// a tag: addressable event reference (app, stack, etc.)
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

	const signed = await signEvent({ kind: 9734, content: comment ?? '', tags, created_at: Math.floor(Date.now() / 1000) });
	if (!signed?.id) throw new Error('Failed to sign zap request');

	const invoiceResponse = await fetchInvoiceFromCallback(
		lnurlData.callback,
		amountMillisats,
		JSON.stringify(signed),
		comment || undefined
	);

	return {
		invoice: invoiceResponse.pr,
		zapRequest: { id: signed.id },
		/** Relays embedded in the zap request — the LN backend publishes the receipt here. */
		relays
	};
}

/**
 * Subscribe for the kind 9735 receipt for a specific zap request.
 * Listens on all relays from the zap request plus the base set.
 * Writes to Dexie and calls onReceipt when matched.
 * Auto-reconnects if the relay closes the subscription unexpectedly.
 * Returns an unsubscribe function.
 */
export function subscribeToZapReceipt(recipientPubkey, zapRequestId, onReceipt, options) {
	const pool = new SimplePool();
	let sub = null;
	let closed = false;
	let reconnectTimer = null;

	const readRelays = [...new Set([
		...(options?.relays ?? []),
		...zapReceiptPublishRelays()
	])];

	// Anchor `since` to before createZap ran so relay latency doesn't shrink the window.
	const zapStartedAt = options?.zapStartedAt ?? Math.floor(Date.now() / 1000);
	const since = zapStartedAt - 300; // 5-minute lookback

	const run = () => {
		if (closed) return;
		sub = pool.subscribeMany(
			readRelays,
			{ kinds: [9735], '#p': [recipientPubkey], since, limit: 100 },
			{
				id: subId('zap'),
				onevent(event) {
					const descTag = event.tags?.find((t) => t[0] === 'description')?.[1];
					if (!descTag) return;
					let zapReq;
					try { zapReq = JSON.parse(descTag); } catch { return; }
					if (zapReq.id !== zapRequestId) return;
					ensureReceiptOnZapstoreRelay(pool, event);
					void putEvents([event])
						.then(() => onReceipt(event))
						.catch(() => onReceipt(event));
				},
				onclose() {
					// Do NOT call sub?.close() in run() — it would trigger this callback
					// again and create an infinite reconnect loop.
					if (!closed) reconnectTimer = setTimeout(run, 2000);
				}
			}
		);
	};

	run();

	return () => {
		closed = true;
		if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
		try { sub?.close(); } catch { /* noop */ }
		pool.close(readRelays);
	};
}

/**
 * One-shot fallback search for a receipt across all zap-request relays.
 * Used after the user manually confirms payment ("I've paid, close this").
 * Resolves with the receipt event or null within 10 seconds.
 */
export async function fetchZapReceiptFallback(recipientPubkey, zapRequestId, zapRelays, since) {
	const pool = new SimplePool();
	const readRelays = [...new Set([ZAPSTORE_RELAY, ...(zapRelays ?? [])])];
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
			{ kinds: [9735], '#p': [recipientPubkey], since: searchSince, limit: 200 },
			{
				id: subId('zap-fallback'),
				onevent(event) {
					if (found) return;
					const descTag = event.tags?.find((t) => t[0] === 'description')?.[1];
					if (!descTag) return;
					let zapReq;
					try { zapReq = JSON.parse(descTag); } catch { return; }
					if (zapReq.id !== zapRequestId) return;
					found = true;
					ensureReceiptOnZapstoreRelay(pool, event);
					finish(event);
				},
				oneose() { if (!found) finish(null); },
				onclose() { if (!settled) finish(null); }
			}
		);

		setTimeout(() => finish(null), 10000);
	});
}
