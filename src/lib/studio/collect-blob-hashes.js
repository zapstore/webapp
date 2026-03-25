/**
 * Resolve Blossom / content hashes for analytics downloads API (kind 30063 + 1063, URLs, tags).
 * Mirrors app detail release discovery: #a, #i, and author — not author-only.
 */
import { nip19 } from 'nostr-tools';
import { DEFAULT_CATALOG_RELAYS, EVENT_KINDS } from '$lib/config.js';
import { queryEvents, putEvents } from '$lib/nostr/dexie.js';
import { parseFileMetadata, parseRelease } from '$lib/nostr/models.js';
import { fetchFromRelays } from '$lib/nostr/service.js';
import { extractHashFromUrl } from '$lib/studio/analytics-http.js';

const HEX64 = /^[a-f0-9]{64}$/i;

/**
 * @param {import('nostr-tools').NostrEvent} event
 * @returns {string[]}
 */
function artifactIdsFromRelease(event) {
	const tags = event.tags ?? [];
	return [
		...new Set(
			tags.filter((t) => t[0] === 'e' || t[0] === 'E').map((t) => t[1]).filter(Boolean)
		)
	];
}

/**
 * @param {import('nostr-tools').NostrEvent} event
 * @returns {Set<string>}
 */
function inlineHashesFromRelease(event) {
	/** @type {Set<string>} */
	const out = new Set();
	const pr = parseRelease(event);
	if (pr.url) {
		const u = extractHashFromUrl(pr.url);
		if (u) out.add(u);
	}
	for (const t of event.tags ?? []) {
		const v = t[1];
		if (v && HEX64.test(v)) out.add(v.toLowerCase());
	}
	if (event.content?.trim()) {
		try {
			const j = JSON.parse(event.content);
			const walk = (/** @type {unknown} */ o) => {
				if (o == null) return;
				if (typeof o === 'string') {
					if (HEX64.test(o)) out.add(o.toLowerCase());
					return;
				}
				if (Array.isArray(o)) {
					for (const x of o) walk(x);
					return;
				}
				if (typeof o === 'object') {
					for (const val of Object.values(o)) walk(val);
				}
			};
			walk(j);
		} catch {
			/* not JSON */
		}
	}
	return out;
}

/**
 * Lowercase d-tag that exists in the Studio app list, or null.
 * @param {string} raw
 * @param {Array<{ id: string }>} apps
 */
function matchStudioAppDTag(raw, apps) {
	const r = String(raw ?? '').trim().toLowerCase();
	if (!r) return null;
	for (const a of apps) {
		if (a.id.toLowerCase() === r) return a.id.toLowerCase();
	}
	return null;
}

/** @param {string | undefined} iTag */
function identifierFromITag(iTag) {
	const s = String(iTag ?? '').trim();
	if (!s) return null;
	if (s.startsWith('naddr1')) {
		try {
			const d = nip19.decode(s);
			if (d.type === 'naddr' && d.data && typeof d.data === 'object' && 'identifier' in d.data) {
				return String(/** @type {{ identifier: string }} */ (d.data).identifier);
			}
		} catch {
			return s;
		}
	}
	return s;
}

/**
 * Studio chart keys by app `d` tag (lowercase). Must match an app in the sidebar —
 * otherwise hashes were previously bucketed under a raw #a string that never matched `userApps`.
 * @param {import('nostr-tools').NostrEvent} rel
 * @param {Array<{ id: string }>} apps
 */
function resolveAppDTagForRelease(rel, apps) {
	if (apps.length === 0) return '';

	const pr = parseRelease(rel);
	/** @type {string[]} */
	const candidates = [];
	if (pr.appDTag) candidates.push(pr.appDTag);
	const aTag = rel.tags?.find((t) => t[0] === 'a' || t[0] === 'A')?.[1];
	if (aTag) {
		const parts = aTag.split(':');
		if (parts.length >= 3 && parts[2]) candidates.push(parts[2]);
	}
	const iRaw = rel.tags?.find((t) => t[0] === 'i' || t[0] === 'I')?.[1];
	const fromI = identifierFromITag(iRaw);
	if (fromI) candidates.push(fromI);

	for (const c of candidates) {
		const m = matchStudioAppDTag(c, apps);
		if (m) return m;
	}

	if (apps.length === 1) return apps[0].id.toLowerCase();
	return '';
}

function hashFromFileEvent(fe) {
	const parsed = parseFileMetadata(fe);
	if (parsed.hash && HEX64.test(parsed.hash)) return parsed.hash.toLowerCase();
	const x = fe.tags?.find((t) => t[0]?.toLowerCase() === 'x')?.[1];
	if (x && HEX64.test(x)) return x.toLowerCase();
	if (parsed.url) {
		const u = extractHashFromUrl(parsed.url);
		if (u) return u;
	}
	return null;
}

/**
 * @param {string} pubkeyHex
 * @param {Array<{ id: string }>} apps — Studio sidebar apps (`id` = app d-tag)
 * @param {string[]} [catalogRelays]
 * @returns {Promise<Map<string, string>>} hash (lowercase hex) → app d-tag
 */
export async function collectBlobHashesForDeveloper(pubkeyHex, apps, catalogRelays = DEFAULT_CATALOG_RELAYS) {
	const pk = pubkeyHex.toLowerCase();

	/** @type {Map<string, import('nostr-tools').NostrEvent>} */
	const releaseById = new Map();

	function merge(/** @type {import('nostr-tools').NostrEvent[]} */ list) {
		for (const ev of list) {
			if (ev?.id) releaseById.set(ev.id, ev);
		}
	}

	merge(await queryEvents({ kinds: [EVENT_KINDS.RELEASE], authors: [pk], limit: 250 }));

	if (apps.length > 0) {
		// Do NOT spread PLATFORM_FILTER here — most Zapstore releases omit #f; Dexie would drop every row.
		const aTagsLower = apps.map((a) => `${EVENT_KINDS.APP}:${pk}:${a.id}`);
		const aTagsUpperPk = apps.map(
			(a) => `${EVENT_KINDS.APP}:${pk.toUpperCase()}:${a.id}`
		);
		merge(
			await queryEvents({
				kinds: [EVENT_KINDS.RELEASE],
				'#a': [...aTagsLower, ...aTagsUpperPk],
				limit: 200
			})
		);
		const iTags = apps.map((a) => a.id);
		merge(await queryEvents({ kinds: [EVENT_KINDS.RELEASE], '#i': iTags, limit: 200 }));
	}

	// Always merge fresh releases from both catalog relays — many releases live only on vertexlab;
	// Dexie often lacks #a/#i rows or full #e → 1063.
	if (apps.length > 0) {
		const aRelayTags = apps.flatMap((a) => [
			`${EVENT_KINDS.APP}:${pk}:${a.id}`,
			`${EVENT_KINDS.APP}:${pk.toUpperCase()}:${a.id}`
		]);
		merge(
			await fetchFromRelays(
				catalogRelays,
				{
					kinds: [EVENT_KINDS.RELEASE],
					'#a': aRelayTags,
					limit: Math.min(300, 50 * apps.length)
				},
				{ timeout: 12000, feature: 'studio-rel-a-batch' }
			)
		);
		const iRelayTags = apps.map((a) => a.id);
		merge(
			await fetchFromRelays(
				catalogRelays,
				{
					kinds: [EVENT_KINDS.RELEASE],
					'#i': iRelayTags,
					limit: Math.min(300, 50 * apps.length)
				},
				{ timeout: 12000, feature: 'studio-rel-i-batch' }
			)
		);
	}

	merge(
		await fetchFromRelays(
			catalogRelays,
			{ kinds: [EVENT_KINDS.RELEASE], authors: [pk], limit: 250 },
			{ timeout: 12000, feature: 'studio-rel-auth-catalog' }
		)
	);

	const releases = [...releaseById.values()];

	const artifactIds = [...new Set(releases.flatMap((r) => artifactIdsFromRelease(r)))];
	let fileEvents = artifactIds.length ? await queryEvents({ kinds: [1063], ids: artifactIds }) : [];
	const have = new Set(fileEvents.map((e) => e.id));
	const missing = artifactIds.filter((id) => !have.has(id));
	if (missing.length > 0) {
		const fetched = await fetchFromRelays(
			catalogRelays,
			{ kinds: [1063], ids: missing, limit: missing.length },
			{ timeout: 8000, feature: 'studio-files' }
		);
		if (fetched.length > 0) await putEvents(fetched);
		fileEvents = [...fileEvents, ...fetched];
	}

	const fileById = new Map(fileEvents.map((e) => [e.id, e]));

	/** @type {Map<string, string>} */
	const hashToApp = new Map();

	for (const rel of releases) {
		const appDTag = resolveAppDTagForRelease(rel, apps);
		if (!appDTag) continue;
		const appKey = appDTag;

		for (const fid of artifactIdsFromRelease(rel)) {
			const fe = fileById.get(fid);
			if (!fe) continue;
			const h = hashFromFileEvent(fe);
			if (h) hashToApp.set(h, appKey);
		}
		for (const h of inlineHashesFromRelease(rel)) {
			hashToApp.set(h, appKey);
		}
	}

	if (hashToApp.size === 0 && releases.length > 0) {
		console.warn(
			`[Studio] Found ${releases.length} release(s) but no blob hashes (no 1063 x-tag, no 64-hex in tags/URL/content). Downloads chart will stay at zero.`
		);
	}

	return hashToApp;
}
