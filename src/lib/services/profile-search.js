/**
 * Profile Search Service
 *
 * Priority for @mention suggestions:
 *   1. Thread participants (direct parent author first, then root author, then other commenters)
 *   2. Logged-in user's contacts/follows from Dexie
 *   3. Vertexlab NIP-50 search — relay-side text matching, results appended after local ones
 *
 * Empty query: thread participants → defaults → contacts (all from Dexie, no relay call)
 * Non-empty query: local scored results first; Vertexlab races 1s and new-to-local results appended
 */
import { writable } from 'svelte/store';
import { queryEvents, queryEvent, fetchProfilesBatch, fetchFromRelays } from '$lib/purpleweb';
import { parseProfile } from '$lib/nostr/models';
import { nip19 } from 'nostr-tools';
import { ZAPSTORE_RELAY, VERTEXLAB_RELAY, SITE_ICON } from '$lib/config';

const KIND_PROFILE = 0;
const KIND_CONTACT_LIST = 3;
const KIND_FOLLOW_SET = 30000;

const DEFAULT_NPUBS = [
	'npub10r8xl2njyepcw2zwv3a6dyufj4e4ajx86hz6v4ehu4gnpupxxp7stjt2p8', // Zapstore
	'npub1wf4pufsucer5va8g9p0rj5dnhvfeh6d8w0g6eayaep5dhps6rsgs43dgh9',
	'npub176p7sup477k5738qhxx0hk2n0cty2k5je5uvalzvkvwmw4tltmeqw7vgup',
	'npub149p5act9a5qm9p47elp8w8h3wpwn2d7s2xecw2ygnrxqp4wgsklq9g722q'
];
const ZAPSTORE_ICON = SITE_ICON;

function npubToPubkey(npub) {
	try {
		const decoded = nip19.decode(npub);
		return decoded.type === 'npub' ? decoded.data : null;
	} catch {
		return null;
	}
}

const DEFAULT_PUBKEYS = DEFAULT_NPUBS.map(npubToPubkey).filter((pk) => !!pk);

export const ZAPSTORE_PUBKEY = DEFAULT_PUBKEYS[0];

export const zapstoreProfileStore = writable(null);

function setZapstoreProfileFromEvent(event) {
	if (!event) return;
	const p = parseProfile(event);
	zapstoreProfileStore.set({
		picture: p.picture ?? ZAPSTORE_ICON,
		name: p.displayName ?? p.name ?? 'Zapstore'
	});
}

let defaultProfilesStarted = false;

function startFetchDefaultProfiles() {
	if (defaultProfilesStarted) return;
	defaultProfilesStarted = true;
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

const userFetchStarted = new Set();
const threadProfileFetchStarted = new Set();

/** Pubkeys found via Vertexlab search — kept so subsequent keystrokes hit Dexie instead of relay. */
const relayDiscoveredPubkeys = new Set();

function startFetchThreadProfiles(pubkeys) {
	const toFetch = pubkeys.filter((pk) => pk?.length === 64 && !threadProfileFetchStarted.has(pk));
	if (toFetch.length === 0) return;
	for (const pk of toFetch) threadProfileFetchStarted.add(pk);
	void fetchProfilesBatch(toFetch, { timeout: 5000 }).catch(() => {});
}

function startFetchUserContacts(userPubkey) {
	if (userFetchStarted.has(userPubkey)) return;
	userFetchStarted.add(userPubkey);
	void (async () => {
		try {
			let kind3 = await queryEvents({ kinds: [KIND_CONTACT_LIST], authors: [userPubkey], limit: 1 });
			if ((!kind3 || kind3.length === 0) && typeof window !== 'undefined') {
				kind3 = await fetchFromRelays([ZAPSTORE_RELAY], { kinds: [KIND_CONTACT_LIST], authors: [userPubkey], limit: 1 }, { timeout: 5000, feature: 'profile-search' });
			}
			const pubkeys = new Set();
			for (const ev of kind3) {
				ev.tags.filter((t) => t[0] === 'p' && t[1]?.length === 64).forEach((t) => pubkeys.add(t[1]));
			}
			let kind30k = await queryEvents({ kinds: [KIND_FOLLOW_SET], authors: [userPubkey], limit: 50 });
			if ((!kind30k || kind30k.length === 0) && typeof window !== 'undefined') {
				kind30k = await fetchFromRelays([ZAPSTORE_RELAY], { kinds: [KIND_FOLLOW_SET], authors: [userPubkey], limit: 50 }, { timeout: 5000, feature: 'profile-search' });
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
 * Thread participants always appear even before their kind-0 profile arrives in Dexie,
 * because the user is actively in a conversation with them.
 */
async function threadParticipantRow(pubkey) {
	const fromDexie = await profileFromDexie(pubkey);
	if (fromDexie) return fromDexie;
	return {
		pubkey,
		name: '',
		displayName: `${pubkey.slice(0, 8)}…`,
		picture: '',
		nip05: ''
	};
}

async function getCandidatePubkeys(userPubkey, threadPubkeys = []) {
	const out = new Set();
	for (const pk of threadPubkeys) {
		if (pk?.length === 64) out.add(pk);
	}
	for (const pk of DEFAULT_PUBKEYS) out.add(pk);
	for (const pk of relayDiscoveredPubkeys) out.add(pk);
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

async function searchFromDexie(userPubkey, query, threadPubkeys = []) {
	startFetchDefaultProfiles();
	if (userPubkey) startFetchUserContacts(userPubkey);
	if (threadPubkeys.length > 0) startFetchThreadProfiles(threadPubkeys);

	const candidates = await getCandidatePubkeys(userPubkey, threadPubkeys);
	const normalizedQuery = (query ?? '').toLowerCase().trim();
	const defaultSet = new Set(DEFAULT_PUBKEYS);
	const threadSet = new Set(threadPubkeys.filter((pk) => pk?.length === 64));
	const withResults = [];

	for (const pubkey of candidates) {
		const isDefault = defaultSet.has(pubkey);
		const isZapstore = pubkey === DEFAULT_PUBKEYS[0];
		const isThread = threadSet.has(pubkey);
		const row = isDefault
			? await defaultProfileRow(pubkey, isZapstore)
			: isThread
				? await threadParticipantRow(pubkey)
				: await profileFromDexie(pubkey);
		if (row) withResults.push(row);
	}

	if (normalizedQuery === '') {
		const inThreadOrder = threadPubkeys
			.map((pk) => withResults.find((r) => r.pubkey === pk))
			.filter((r) => !!r);
		const seenThread = new Set(threadPubkeys);
		const inDefaultOrder = DEFAULT_PUBKEYS.filter((pk) => !seenThread.has(pk))
			.map((pk) => withResults.find((r) => r.pubkey === pk))
			.filter((r) => !!r);
		const rest = withResults.filter(
			(r) => !defaultSet.has(r.pubkey) && !seenThread.has(r.pubkey)
		);
		return [...inThreadOrder, ...inDefaultOrder, ...rest].slice(0, 10);
	}

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
			let score = threadSet.has(result.pubkey) ? 200 : 0;
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

async function fetchVertexlabProfiles(query) {
	if (!query || typeof window === 'undefined') return [];
	try {
		const events = await fetchFromRelays(
			[VERTEXLAB_RELAY],
			{ kinds: [KIND_PROFILE], search: query, limit: 10 },
			{ timeout: 3000, feature: 'profile-mention-search' }
		);
		return events.map((event) => {
			const p = parseProfile(event);
			if (p.pubkey) relayDiscoveredPubkeys.add(p.pubkey);
			return {
				pubkey: p.pubkey,
				name: p.name ?? '',
				displayName: p.displayName ?? p.name ?? '',
				picture: p.picture ?? '',
				nip05: p.nip05 ?? ''
			};
		});
	} catch {
		return [];
	}
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
	threadProfileFetchStarted.clear();
	relayDiscoveredPubkeys.clear();
}

/**
 * Creates the search function used by ShortTextInput for @mention suggestions.
 *
 * @param {() => string | null} getUserPubkey
 * @param {(() => string[]) | null} getThreadPubkeys
 */
export function createSearchProfilesFunction(getUserPubkey, getThreadPubkeys = null) {
	return async (query) => {
		const userPubkey = getUserPubkey?.() ?? null;
		const threadPubkeys = getThreadPubkeys ? (getThreadPubkeys() ?? []) : [];
		const q = query?.trim() ?? '';

		if (q === '') {
			return searchFromDexie(userPubkey, q, threadPubkeys);
		}

		const [localResults, relayResults] = await Promise.all([
			searchFromDexie(userPubkey, q, threadPubkeys),
			Promise.race([
				fetchVertexlabProfiles(q),
				new Promise((res) => setTimeout(() => res([]), 1000))
			])
		]);

		if (relayResults.length === 0) return localResults;

		const seen = new Set(localResults.map((r) => r.pubkey));
		const newFromRelay = relayResults.filter((r) => !seen.has(r.pubkey));
		return [...localResults, ...newFromRelay].slice(0, 10);
	};
}

export function startProfileSearchBackground() {
	startFetchDefaultProfiles();
}
