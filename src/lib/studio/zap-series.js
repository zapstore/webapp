/**
 * Studio zap totals per app per day from kind 9735 on Zapstore (same read path as `fetchZaps`).
 * Batch filters only (no N+1): one #a query, one #e batch per pubkey's app event ids.
 */
import { COMMENT_AND_ZAP_READ_RELAYS, EVENT_KINDS } from '$lib/config.js';
import { queryEvents, putEvents } from '$lib/nostr/dexie.js';
import { fetchFromRelays, parseZapReceipt } from '$lib/nostr/service.js';
import { buildIsoDateList } from '$lib/studio/analytics-http.js';

const STUDIO_ZAP_RELAYS = [...COMMENT_AND_ZAP_READ_RELAYS];
/** Studio loads 2× the selected window for prior-period % tickers; cap must cover longer ranges. */
const ZAP_FETCH_LIMIT = 2500;

/**
 * @param {import('nostr-tools').NostrEvent} ev
 * @param {string} pkLower
 * @param {Array<{ id: string }>} apps
 * @param {Map<string, string>} dTagByEventId
 * @returns {string | null} app d-tag
 */
function resolveZapAppDtag(ev, pkLower, apps, dTagByEventId) {
	const dtags = new Set(apps.map((a) => a.id.toLowerCase()));
	const tags = ev.tags ?? [];
	for (const t of tags) {
		if (t[0] !== 'a' && t[0] !== 'A') continue;
		const v = t[1];
		if (!v) continue;
		const parts = String(v).split(':');
		if (parts.length < 3) continue;
		if (Number(parts[0]) !== EVENT_KINDS.APP) continue;
		const pub = (parts[1] ?? '').toLowerCase();
		const id = (parts[2] ?? '').toLowerCase();
		if (pub === pkLower && dtags.has(id)) return apps.find((a) => a.id.toLowerCase() === id)?.id ?? parts[2];
	}
	const eid = tags.find((x) => x[0]?.toLowerCase() === 'e')?.[1];
	if (eid) {
		const d = dTagByEventId.get(eid.toLowerCase());
		if (d) return d;
	}
	return null;
}

/**
 * @param {string} pubkeyHex — lowercase hex
 * @param {Array<{ id: string, name: string, icon: string, eventId?: string }>} apps
 * @param {number} days
 * @returns {Promise<Array<{ id: string, name: string, icon: string, counts: number[] }>>}
 */
export async function loadZapAppData(pubkeyHex, apps, days) {
	const pk = pubkeyHex.toLowerCase();
	if (!apps?.length) return [];

	const n = Math.max(1, days);
	const isoDates = buildIsoDateList(n);
	const fromKey = isoDates[0];
	const since = Math.floor(Date.parse(`${fromKey}T00:00:00.000Z`) / 1000) - 3600;

	const aTags = [
		...new Set(
			apps.flatMap((a) => [
				`${EVENT_KINDS.APP}:${pk}:${a.id}`,
				`${EVENT_KINDS.APP}:${pk.toUpperCase()}:${a.id}`
			])
		)
	];

	const eventIds = [
		...new Set(
			apps
				.map((a) => a.eventId)
				.filter((id) => typeof id === 'string' && /^[a-f0-9]{64}$/i.test(id))
				.map((id) => id.toLowerCase())
		)
	];

	const dTagByEventId = new Map();
	for (const a of apps) {
		if (a.eventId && /^[a-f0-9]{64}$/i.test(a.eventId)) {
			dTagByEventId.set(a.eventId.toLowerCase(), a.id);
		}
	}

	/** @type {Map<string, import('nostr-tools').NostrEvent>} */
	const byId = new Map();

	function merge(/** @type {import('nostr-tools').NostrEvent[]} */ list) {
		for (const ev of list) {
			if (ev?.id && !byId.has(ev.id)) byId.set(ev.id, ev);
		}
	}

	merge(
		await queryEvents({
			kinds: [9735],
			'#a': aTags,
			since,
			limit: ZAP_FETCH_LIMIT
		})
	);

	if (aTags.length > 0) {
		merge(
			await fetchFromRelays(
				STUDIO_ZAP_RELAYS,
				{ kinds: [9735], '#a': aTags, since, limit: ZAP_FETCH_LIMIT },
				{ timeout: 12_000, feature: 'studio-zaps-a' }
			)
		);
	}

	if (eventIds.length > 0) {
		merge(
			await queryEvents({
				kinds: [9735],
				'#e': eventIds,
				since,
				limit: ZAP_FETCH_LIMIT
			})
		);
		const fE = { kinds: [9735], '#e': eventIds, since, limit: ZAP_FETCH_LIMIT };
		const fEu = { kinds: [9735], '#E': eventIds, since, limit: ZAP_FETCH_LIMIT };
		const [r1, r2] = await Promise.all([
			fetchFromRelays(STUDIO_ZAP_RELAYS, fE, { timeout: 12_000, feature: 'studio-zaps-e' }),
			fetchFromRelays(STUDIO_ZAP_RELAYS, fEu, { timeout: 12_000, feature: 'studio-zaps-E' })
		]);
		merge(r1);
		merge(r2);
	}

	const collected = Array.from(byId.values());
	if (collected.length > 0) {
		await putEvents(collected).catch(() => {});
	}

	/** @type {Map<string, Map<string, number>>} */
	const byDtagDay = new Map();
	for (const a of apps) {
		byDtagDay.set(a.id.toLowerCase(), new Map());
	}

	const isoSet = new Set(isoDates);

	for (const ev of collected) {
		const dtag = resolveZapAppDtag(ev, pk, apps, dTagByEventId);
		if (!dtag) continue;
		const dayMap = byDtagDay.get(dtag.toLowerCase());
		if (!dayMap) continue;
		const parsed = parseZapReceipt(ev);
		const amount = Math.max(0, Math.round(Number(parsed.amountSats) || 0));
		const day = new Date(ev.created_at * 1000).toISOString().slice(0, 10);
		if (!isoSet.has(day)) continue;
		const inc = amount > 0 ? amount : 1;
		dayMap.set(day, (dayMap.get(day) ?? 0) + inc);
	}

	return apps.map((app) => {
		const m = byDtagDay.get(app.id.toLowerCase()) ?? new Map();
		return {
			id: app.id,
			name: app.name,
			icon: app.icon ?? '',
			counts: isoDates.map((iso) => m.get(iso) ?? 0)
		};
	});
}
