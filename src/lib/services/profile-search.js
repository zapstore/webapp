/**
 * Profile Search Service — Local-First
 *
 * Follows ARCHITECTURE.md: UI renders from local data (Dexie) first.
 * Network is used only in the background to populate Dexie.
 *
 * - Empty query: default profiles (Zapstore + 3 npubs) from Dexie or placeholders
 * - Non-empty query: filter profiles from Dexie (kind 0) + contacts
 * - Background: fetch profiles from relays, write to Dexie
 */
import { writable } from 'svelte/store';
import { queryEvents, queryEvent, fetchProfilesBatch, fetchFromRelays } from '$lib/nostr';
import { parseProfile } from '$lib/nostr/models';
import { nip19 } from 'nostr-tools';
import { DEFAULT_SOCIAL_RELAYS } from '$lib/config';

const KIND_PROFILE = 0;
const KIND_CONTACT_LIST = 3;
const KIND_FOLLOW_SET = 30000;

/** Default npubs for empty query. */
const DEFAULT_NPUBS = [
	'npub10r8xl2njyepcw2zwv3a6dyufj4e4ajx86hz6v4ehu4gnpupxxp7stjt2p8', // Zapstore
	'npub1wf4pufsucer5va8g9p0rj5dnhvfeh6d8w0g6eayaep5dhps6rsgs43dgh9',
	'npub176p7sup477k5738qhxx0hk2n0cty2k5je5uvalzvkvwmw4tltmeqw7vgup',
	'npub149p5act9a5qm9p47elp8w8h3wpwn2d7s2xecw2ygnrxqp4wgsklq9g722q'
];
const ZAPSTORE_ICON = 'https://zapstore.dev/zapstore-icon.png';

function npubToPubkey(npub) {
	try {
		const decoded = nip19.decode(npub);
		return decoded.type === 'npub' ? decoded.data : null;
	} catch {
		return null;
	}
}

const DEFAULT_PUBKEYS = DEFAULT_NPUBS.map(npubToPubkey).filter((pk) => !!pk);

/** Zapstore pubkey (first default profile) */
export const ZAPSTORE_PUBKEY = DEFAULT_PUBKEYS[0];

/** Reactive store: Zapstore profile when loaded. Null until then. */
export const zapstoreProfileStore = writable(null);

function setZapstoreProfileFromEvent(event) {
	if (!event) return;
	const p = parseProfile(event);
	zapstoreProfileStore.set({
		picture: p.picture ?? ZAPSTORE_ICON,
		name: p.displayName ?? p.name ?? 'Zapstore'
	});
}

/** Started once so default profiles populate Dexie in background */
let defaultProfilesStarted = false;

function startFetchDefaultProfiles() {
	if (defaultProfilesStarted) return;
	defaultProfilesStarted = true;

	// Async: check Dexie for Zapstore profile, then fetch missing from relays
	void (async () => {
		try {
			const zapstoreEvent = await queryEvent({
				kinds: [KIND_PROFILE],
				authors: [ZAPSTORE_PUBKEY],
				limit: 1
			});
			setZapstoreProfileFromEvent(zapstoreEvent);

			const batch = await fetchProfilesBatch(DEFAULT_PUBKEYS, { timeout: 8000 });
			const zapstore = batch.get(ZAPSTORE_PUBKEY) ?? null;
			if (zapstore) setZapstoreProfileFromEvent(zapstore);
		} catch {
			// keep local-first state
		}
	})();
}

/** Per-user: fetch contacts and their profiles in background */
const userFetchStarted = new Set();

function startFetchUserContacts(userPubkey) {
	if (userFetchStarted.has(userPubkey)) return;
	userFetchStarted.add(userPubkey);

	void (async () => {
		try {
			// Local-first: try Dexie, then relay fallback so contacts load on first visit
			let kind3 = await queryEvents({ kinds: [KIND_CONTACT_LIST], authors: [userPubkey], limit: 1 });
			if ((!kind3 || kind3.length === 0) && typeof window !== 'undefined') {
				kind3 = await fetchFromRelays(DEFAULT_SOCIAL_RELAYS, { kinds: [KIND_CONTACT_LIST], authors: [userPubkey], limit: 1 }, { timeout: 5000 });
			}
			const pubkeys = new Set();

			for (const ev of kind3) {
				ev.tags.filter((t) => t[0] === 'p' && t[1]?.length === 64).forEach((t) => pubkeys.add(t[1]));
			}

			let kind30k = await queryEvents({ kinds: [KIND_FOLLOW_SET], authors: [userPubkey], limit: 50 });
			if ((!kind30k || kind30k.length === 0) && typeof window !== 'undefined') {
				kind30k = await fetchFromRelays(DEFAULT_SOCIAL_RELAYS, { kinds: [KIND_FOLLOW_SET], authors: [userPubkey], limit: 50 }, { timeout: 5000 });
			}
			for (const ev of kind30k) {
				ev.tags.filter((t) => t[0] === 'p' && t[1]?.length === 64).forEach((t) => pubkeys.add(t[1]));
			}

			if (pubkeys.size > 0) {
				await fetchProfilesBatch([...pubkeys], { timeout: 5000 }).catch(() => {});
			}
		} catch {
			// best effort
		}
	})();
}

/**
 * Get profile from Dexie (async). Returns SearchResult or null.
 */
async function profileFromDexie(pubkey) {
	const event = await queryEvent({ kinds: [KIND_PROFILE], authors: [pubkey], limit: 1 });
	if (!event) return null;
	const p = parseProfile(event);
	return {
		pubkey: p.pubkey,
		name: p.name ?? '',
		displayName: p.displayName ?? p.name ?? '',
		picture: p.picture ?? '',
		nip05: p.nip05 ?? ''
	};
}

/**
 * Default profile row: from Dexie if present, else placeholder.
 */
async function defaultProfileRow(pubkey, isZapstore) {
	const fromDexie = await profileFromDexie(pubkey);
	if (fromDexie) return fromDexie;
	return {
		pubkey,
		name: isZapstore ? 'Zapstore' : '',
		displayName: isZapstore ? 'Zapstore' : `${pubkey.slice(0, 8)}…`,
		picture: isZapstore ? ZAPSTORE_ICON : '',
		nip05: ''
	};
}

/**
 * Get candidate pubkeys: defaults + (if user) contacts/follows from Dexie.
 */
async function getCandidatePubkeys(userPubkey) {
	const out = new Set(DEFAULT_PUBKEYS);
	if (userPubkey) {
		const kind3 = await queryEvents({ kinds: [KIND_CONTACT_LIST], authors: [userPubkey], limit: 1 });
		for (const ev of kind3) {
			ev.tags.filter((t) => t[0] === 'p' && t[1]?.length === 64).forEach((t) => out.add(t[1]));
		}
		const kind30k = await queryEvents({ kinds: [KIND_FOLLOW_SET], authors: [userPubkey], limit: 50 });
		for (const ev of kind30k) {
			ev.tags.filter((t) => t[0] === 'p' && t[1]?.length === 64).forEach((t) => out.add(t[1]));
		}
	}
	return Array.from(out);
}

/**
 * Search profiles from Dexie. Returns up to 10 results.
 */
async function searchFromDexie(userPubkey, query) {
	startFetchDefaultProfiles();
	if (userPubkey) startFetchUserContacts(userPubkey);

	const candidates = await getCandidatePubkeys(userPubkey);
	const normalizedQuery = (query ?? '').toLowerCase().trim();

	const defaultSet = new Set(DEFAULT_PUBKEYS);
	const withResults = [];

	for (const pubkey of candidates) {
		const isDefault = defaultSet.has(pubkey);
		const isZapstore = pubkey === DEFAULT_PUBKEYS[0];
		const row = isDefault
			? await defaultProfileRow(pubkey, isZapstore)
			: await profileFromDexie(pubkey);
		if (row) withResults.push(row);
	}

	if (normalizedQuery === '') {
		const inDefaultOrder = DEFAULT_PUBKEYS.map((pk) =>
			withResults.find((r) => r.pubkey === pk)
		).filter((r) => !!r);
		const rest = withResults.filter((r) => !defaultSet.has(r.pubkey));
		return [...inDefaultOrder, ...rest].slice(0, 10);
	}

	// Filter by query
	const matches = [];
	for (const result of withResults) {
		const name = (result.name || '').toLowerCase();
		const displayName = (result.displayName || '').toLowerCase();
		const nip05 = (result.nip05 || '').toLowerCase();
		const pubkeyLower = result.pubkey.toLowerCase();

		if (
			name.includes(normalizedQuery) ||
			displayName.includes(normalizedQuery) ||
			nip05.includes(normalizedQuery) ||
			pubkeyLower.startsWith(normalizedQuery)
		) {
			let score = 0;
			if (name.startsWith(normalizedQuery)) score += 100;
			else if (name.includes(normalizedQuery)) score += 50;
			if (displayName.startsWith(normalizedQuery)) score += 100;
			else if (displayName.includes(normalizedQuery)) score += 50;
			if (nip05.startsWith(normalizedQuery)) score += 80;
			else if (nip05.includes(normalizedQuery)) score += 30;
			if (pubkeyLower.startsWith(normalizedQuery)) score += 20;
			matches.push({ result, score });
		}
	}

	matches.sort((a, b) => b.score - a.score);
	return matches.slice(0, 10).map((m) => m.result);
}

export function createProfileSearch(userPubkey) {
	const contactPubkeys = new Set();
	return {
		init: async () => {
			startFetchDefaultProfiles();
			startFetchUserContacts(userPubkey);
		},
		search: async (query) => searchFromDexie(userPubkey, query),
		getProfileCount: () => 0,
		getPubkeyCount: () => contactPubkeys.size,
		isInLists: (pubkey) => contactPubkeys.has(pubkey),
		addProfile: () => {}
	};
}

const profileSearchCache = new Map();

export function getProfileSearch(userPubkey) {
	if (!userPubkey) {
		return {
			init: async () => {},
			search: async (query) => searchFromDexie(null, query),
			getProfileCount: () => 0,
			getPubkeyCount: () => 0,
			isInLists: () => false,
			addProfile: () => {}
		};
	}
	if (!profileSearchCache.has(userPubkey)) {
		profileSearchCache.set(userPubkey, createProfileSearch(userPubkey));
	}
	return profileSearchCache.get(userPubkey);
}

export function clearProfileSearchCache() {
	profileSearchCache.clear();
	userFetchStarted.clear();
}

/**
 * Create the search function for ShortTextInput / mention suggestion.
 */
export function createSearchProfilesFunction(getUserPubkey) {
	return async (query) => {
		const userPubkey = getUserPubkey();
		return searchFromDexie(userPubkey, query?.trim() ?? '');
	};
}

/**
 * Call early to start background loading of default profiles.
 */
export function startProfileSearchBackground() {
	startFetchDefaultProfiles();
}
