/**
 * Profile Search Service — Local-First
 *
 * Follows ARCHITECTURE.md: UI renders from local data (EventStore) immediately.
 * Network is used only in the background to populate the store.
 *
 * - Empty query: default profiles (Zapstore + 3 npubs) from store or placeholders
 * - Non-empty query: filter profiles from EventStore (kind 0) + contacts (kind 3/30000)
 * - Background: watchEvents for kind 0 (defaults), kind 3 & 30000 (user), then fetch kind 0 for contacts
 */

import { writable } from 'svelte/store';
import { queryStore, queryStoreOne, watchEvents, fetchEvents } from '$lib/nostr';
import { parseProfile } from '$lib/nostr/models';
import { PROFILE_RELAYS } from '$lib/config';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '$lib/nostr';

const KIND_PROFILE = 0;
const KIND_CONTACT_LIST = 3;
const KIND_FOLLOW_SET = 30000;

export interface SearchResult {
	pubkey: string;
	name: string;
	displayName: string;
	picture: string;
	nip05: string;
}

/** Default npubs for empty query. Kind 0 loaded in background into EventStore. */
const DEFAULT_NPUBS = [
	'npub10r8xl2njyepcw2zwv3a6dyufj4e4ajx86hz6v4ehu4gnpupxxp7stjt2p8', // Zapstore
	'npub1wf4pufsucer5va8g9p0rj5dnhvfeh6d8w0g6eayaep5dhps6rsgs43dgh9',
	'npub176p7sup477k5738qhxx0hk2n0cty2k5je5uvalzvkvwmw4tltmeqw7vgup',
	'npub149p5act9a5qm9p47elp8w8h3wpwn2d7s2xecw2ygnrxqp4wgsklq9g722q'
] as const;

const ZAPSTORE_ICON = 'https://zapstore.dev/zapstore-icon.png';

function npubToPubkey(npub: string): string | null {
	try {
		const decoded = nip19.decode(npub);
		return decoded.type === 'npub' ? decoded.data : null;
	} catch {
		return null;
	}
}

const DEFAULT_PUBKEYS = DEFAULT_NPUBS.map(npubToPubkey).filter((pk): pk is string => !!pk);

/** Zapstore pubkey (first default profile) — one of the first cached profiles in the app */
export const ZAPSTORE_PUBKEY = DEFAULT_PUBKEYS[0]!;

export interface ZapstoreProfile {
	picture: string;
	name: string;
}

/** Reactive store: Zapstore profile (picture, name) when loaded from EventStore/relays. Null until then. */
export const zapstoreProfileStore = writable<ZapstoreProfile | null>(null);

function setZapstoreProfileFromEvent(event: NostrEvent | null): void {
	if (!event) return;
	const p = parseProfile(event);
	zapstoreProfileStore.set({
		picture: p.picture ?? ZAPSTORE_ICON,
		name: p.displayName ?? p.name ?? 'Zapstore'
	});
}

/** Started once so default kind 0 events populate EventStore in background */
let defaultProfilesWatchStarted = false;
function startWatchDefaultProfiles(): void {
	if (defaultProfilesWatchStarted) return;
	defaultProfilesWatchStarted = true;

	// Sync: if Zapstore profile already in EventStore (e.g. from cache), set store immediately
	const zapstoreEvent = queryStoreOne({
		kinds: [KIND_PROFILE],
		authors: [ZAPSTORE_PUBKEY],
		limit: 1
	});
	setZapstoreProfileFromEvent(zapstoreEvent);

	const zapstoreLower = ZAPSTORE_PUBKEY.toLowerCase();
	watchEvents(
		{ kinds: [KIND_PROFILE], authors: [...DEFAULT_PUBKEYS], limit: 10 },
		{ relays: PROFILE_RELAYS, timeout: 8000 },
		(events) => {
			const zapstore = events.find((e) => e.pubkey?.toLowerCase() === zapstoreLower);
			if (zapstore) setZapstoreProfileFromEvent(zapstore);
		}
	);
}

/** Per-user: start watching kind 3 & 30000, then fetch kind 0 for contact pubkeys in background */
const userWatchStarted = new Set<string>();
function startWatchUserContacts(userPubkey: string): void {
	if (userWatchStarted.has(userPubkey)) return;
	userWatchStarted.add(userPubkey);

	// Load kind 3 and 30000 into store (background)
	watchEvents(
		{ kinds: [KIND_CONTACT_LIST], authors: [userPubkey], limit: 1 },
		{ relays: PROFILE_RELAYS, timeout: 6000 },
		(contactEvents) => {
			const contactList = contactEvents[0];
			if (!contactList) return;
			const pubkeys = contactList.tags
				.filter((t) => t[0] === 'p' && t[1]?.length === 64)
				.map((t) => t[1] as string);
			if (pubkeys.length === 0) return;
			// Fetch kind 0 for contacts so they appear in store
			fetchEvents(
				{ kinds: [KIND_PROFILE], authors: pubkeys, limit: 500 },
				{ relays: PROFILE_RELAYS, timeout: 5000 }
			).catch(() => { });
		}
	);

	watchEvents(
		{ kinds: [KIND_FOLLOW_SET], authors: [userPubkey], limit: 50 },
		{ relays: PROFILE_RELAYS, timeout: 6000 },
		(followEvents) => {
			const allP: string[] = [];
			for (const ev of followEvents) {
				ev.tags
					.filter((t) => t[0] === 'p' && t[1]?.length === 64)
					.forEach((t) => allP.push(t[1] as string));
			}
			if (allP.length === 0) return;
			fetchEvents(
				{ kinds: [KIND_PROFILE], authors: allP, limit: 500 },
				{ relays: PROFILE_RELAYS, timeout: 5000 }
			).catch(() => { });
		}
	);
}

/**
 * Get profile from EventStore (sync). Returns SearchResult or null.
 */
function profileFromStore(pubkey: string): SearchResult | null {
	const event = queryStoreOne({ kinds: [KIND_PROFILE], authors: [pubkey], limit: 1 });
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
 * Default profile row for a default npub: from store if present, else placeholder.
 */
function defaultProfileRow(pubkey: string, isZapstore: boolean): SearchResult {
	const fromStore = profileFromStore(pubkey);
	if (fromStore) return fromStore;
	return {
		pubkey,
		name: isZapstore ? 'Zapstore' : '',
		displayName: isZapstore ? 'Zapstore' : `${pubkey.slice(0, 8)}…`,
		picture: isZapstore ? ZAPSTORE_ICON : '',
		nip05: ''
	};
}

/**
 * Get candidate pubkeys for suggestion list: defaults + (if user) contacts/follows from store.
 * Sync only — reads EventStore.
 */
function getCandidatePubkeys(userPubkey: string | null): string[] {
	const out = new Set<string>(DEFAULT_PUBKEYS);

	if (userPubkey) {
		const kind3 = queryStore({ kinds: [KIND_CONTACT_LIST], authors: [userPubkey], limit: 1 });
		for (const ev of kind3) {
			ev.tags.filter((t) => t[0] === 'p' && t[1]?.length === 64).forEach((t) => out.add(t[1] as string));
		}
		const kind30k = queryStore({ kinds: [KIND_FOLLOW_SET], authors: [userPubkey], limit: 50 });
		for (const ev of kind30k) {
			ev.tags.filter((t) => t[0] === 'p' && t[1]?.length === 64).forEach((t) => out.add(t[1] as string));
		}
	}

	return Array.from(out);
}

/**
 * Search profiles from EventStore only (sync). Returns up to 10 results.
 * Empty query: default 4 first, then any other candidates with profile in store.
 * Non-empty: filter candidates by query (name, displayName, nip05, pubkey).
 */
function searchFromStore(userPubkey: string | null, query: string): SearchResult[] {
	startWatchDefaultProfiles();
	if (userPubkey) startWatchUserContacts(userPubkey);

	const candidates = getCandidatePubkeys(userPubkey);
	const normalizedQuery = (query ?? '').toLowerCase().trim();

	// Build searchable list: each candidate -> SearchResult from store or default placeholder
	const defaultSet = new Set(DEFAULT_PUBKEYS);
	const withResults: SearchResult[] = [];
	for (const pubkey of candidates) {
		const isDefault = defaultSet.has(pubkey);
		const isZapstore = pubkey === DEFAULT_PUBKEYS[0];
		const row = isDefault
			? defaultProfileRow(pubkey, isZapstore)
			: profileFromStore(pubkey);
		if (row) withResults.push(row);
	}

	if (normalizedQuery === '') {
		// Empty query: strict default order first (Zapstore + 3 npubs), then rest (max 10)
		const inDefaultOrder = DEFAULT_PUBKEYS.map((pk) => withResults.find((r) => r.pubkey === pk)).filter(
			(r): r is SearchResult => !!r
		);
		const rest = withResults.filter((r) => !defaultSet.has(r.pubkey));
		return [...inDefaultOrder, ...rest].slice(0, 10);
	}

	// Filter by query
	const matches: Array<{ result: SearchResult; score: number }> = [];
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

// ---------------------------------------------------------------------------
// Legacy service interface (for any code that still uses getProfileSearch)
// ---------------------------------------------------------------------------

interface ProfileSearchService {
	init: () => Promise<void>;
	search: (query: string) => Promise<SearchResult[]>;
	getProfileCount: () => number;
	getPubkeyCount: () => number;
	isInLists: (pubkey: string) => boolean;
	addProfile: (pubkey: string, profile: { name?: string; displayName?: string; picture?: string; nip05?: string }) => void;
}

export function createProfileSearch(userPubkey: string): ProfileSearchService {
	const contactPubkeys = new Set<string>();

	return {
		init: async () => {
			startWatchDefaultProfiles();
			startWatchUserContacts(userPubkey);
		},
		search: async (query: string) => searchFromStore(userPubkey, query),
		getProfileCount: () => 0,
		getPubkeyCount: () => contactPubkeys.size,
		isInLists: (pubkey: string) => contactPubkeys.has(pubkey),
		addProfile: () => { }
	};
}

const profileSearchCache = new Map<string, ProfileSearchService>();

export function getProfileSearch(userPubkey: string | null): ProfileSearchService {
	if (!userPubkey) {
		return {
			init: async () => { },
			search: async (query: string) => searchFromStore(null, query),
			getProfileCount: () => 0,
			getPubkeyCount: () => 0,
			isInLists: () => false,
			addProfile: () => { }
		};
	}
	if (!profileSearchCache.has(userPubkey)) {
		profileSearchCache.set(userPubkey, createProfileSearch(userPubkey));
	}
	return profileSearchCache.get(userPubkey)!;
}

export function clearProfileSearchCache(): void {
	profileSearchCache.clear();
	userWatchStarted.clear();
}

/**
 * Create the search function for ShortTextInput / mention suggestion.
 * Local-first: returns immediately from EventStore; background watch populates more data.
 */
export function createSearchProfilesFunction(
	getUserPubkey: () => string | null
): (query: string) => Promise<SearchResult[]> {
	return (query: string) => {
		const userPubkey = getUserPubkey();
		// Resolve immediately with local data (no await on network)
		const results = searchFromStore(userPubkey, query?.trim() ?? '');
		return Promise.resolve(results);
	};
}

/**
 * Call early (e.g. from layout) to start background loading of default profiles
 * so that by the time the user types @, kind 0 may already be in EventStore.
 */
export function startProfileSearchBackground(): void {
	startWatchDefaultProfiles();
}
