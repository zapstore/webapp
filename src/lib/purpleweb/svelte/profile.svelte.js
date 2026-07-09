import { browser } from '$app/environment';
import { liveQuery } from 'dexie';
import { SvelteMap } from 'svelte/reactivity';
import { EVENT_KINDS, PROFILE_FETCH_RELAYS } from '$lib/config.js';
import { isOnline } from '$lib/stores/online.svelte.js';
import { parseModels } from '../core/registry.js';
import { Profile } from '../models/index.js';
import { queryEvents } from '../storage/dexie.js';
import { hydrateFilters } from '../sync/hydrate.js';

/**
 * @param {unknown[] | unknown} value
 */
function normalizePubkeys(value) {
	const input = Array.isArray(value) ? value : value ? [value] : [];
	return [
		...new Set(
			input
				.map((pk) => String(pk ?? '').trim().toLowerCase())
				.filter((pk) => /^[a-f0-9]{64}$/.test(pk))
		)
	].sort();
}

/** @param {string[]} pubkeys */
async function queryProfileBundle(pubkeys) {
	if (pubkeys.length === 0) {
		return {
			profiles: {},
			profileEvents: {},
			profileMap: new SvelteMap(),
			profileEventMap: new SvelteMap(),
			missingProfilePubkeys: []
		};
	}

	const events = await queryEvents({
		kinds: [EVENT_KINDS.PROFILE],
		authors: pubkeys,
		limit: pubkeys.length
	});

	/** @type {SvelteMap<string, import('nostr-tools').NostrEvent>} */
	const latestByPubkey = new SvelteMap();
	for (const event of events) {
		const pk = event.pubkey?.toLowerCase();
		if (!pk) continue;
		const existing = latestByPubkey.get(pk);
		if (!existing || event.created_at > existing.created_at) latestByPubkey.set(pk, event);
	}

	const profiles = {};
	const profileEvents = {};
	for (const event of latestByPubkey.values()) {
		const [profile] = parseModels([event], Profile);
		const pk = event.pubkey?.toLowerCase();
		if (!pk) continue;
		if (profile) profiles[pk] = profile;
		profileEvents[pk] = event;
	}

	return {
		profiles,
		profileEvents,
		profileMap: new SvelteMap(Object.entries(profiles)),
		profileEventMap: new SvelteMap(Object.entries(profileEvents)),
		missingProfilePubkeys: pubkeys.filter((pk) => !profiles[pk])
	};
}

/**
 * Reactive, local-first profile query.
 *
 * UI reads kind-0 profiles from Dexie via liveQuery. Relay hydration is only a
 * background fill for missing profiles; fetched events flow through Dexie and
 * trigger the liveQuery again.
 *
 * @param {() => unknown[] | unknown} getPubkeys
 * @param {{ hydrate?: boolean, hydrateEnabled?: () => boolean, timeout?: number }} [options]
 */
export function createProfilesQuery(getPubkeys, options = {}) {
	const state = $state({
		profiles: {},
		profileEvents: {},
		profileMap: new SvelteMap(),
		profileEventMap: new SvelteMap(),
		missingProfilePubkeys: [],
		loading: true,
		error: ''
	});

	const pubkeyKey = $derived(normalizePubkeys(getPubkeys?.()).join(','));

	$effect(() => {
		if (!browser) {
			state.loading = false;
			return;
		}

		const pubkeys = pubkeyKey ? pubkeyKey.split(',') : [];
		if (pubkeys.length === 0) {
			state.profiles = {};
			state.profileEvents = {};
			state.profileMap = new SvelteMap();
			state.profileEventMap = new SvelteMap();
			state.missingProfilePubkeys = [];
			state.loading = false;
			state.error = '';
			return;
		}

		let cancelled = false;
		const hydrated = Object.create(null);
		const observable = liveQuery(() => queryProfileBundle(pubkeys));
		const sub = observable.subscribe({
			next(value) {
				if (cancelled) return;
				state.profiles = value.profiles;
				state.profileEvents = value.profileEvents;
				state.profileMap = value.profileMap;
				state.profileEventMap = value.profileEventMap;
				state.missingProfilePubkeys = value.missingProfilePubkeys;
				state.loading = false;
				state.error = '';

				const canHydrate = options.hydrate !== false && (options.hydrateEnabled?.() ?? isOnline());
				if (!canHydrate) return;
				const missing = value.missingProfilePubkeys.filter((pk) => !hydrated[pk]);
				if (missing.length === 0) return;
				for (const pk of missing) hydrated[pk] = true;
				hydrateFilters(
					PROFILE_FETCH_RELAYS,
					{ kinds: [EVENT_KINDS.PROFILE], authors: missing, limit: missing.length * 2 },
					{ timeout: options.timeout ?? 5000, feature: 'purpleweb-profiles' }
				).catch(() => {});
			},
			error(err) {
				if (cancelled) return;
				state.loading = false;
				state.error = err instanceof Error ? err.message : 'Failed to read profiles';
			}
		});

		return () => {
			cancelled = true;
			sub.unsubscribe();
		};
	});

	return state;
}

/**
 * @param {() => unknown} getPubkey
 * @param {{ hydrate?: boolean, hydrateEnabled?: () => boolean, timeout?: number }} [options]
 */
export function createProfileQuery(getPubkey, options = {}) {
	const many = createProfilesQuery(() => {
		const pk = getPubkey?.();
		return pk ? [pk] : [];
	}, options);

	return {
		get profile() {
			const pk = normalizePubkeys(getPubkey?.())[0];
			return pk ? (many.profiles[pk] ?? null) : null;
		},
		get event() {
			const pk = normalizePubkeys(getPubkey?.())[0];
			return pk ? (many.profileEvents[pk] ?? null) : null;
		},
		get loading() {
			return many.loading;
		},
		get error() {
			return many.error;
		}
	};
}
