/**
 * Profile page — universal load
 *
 * SSR: queries relay.zapstore.dev directly for profile, apps, stacks.
 * Client-side navigation: returns npub/pubkey (from URL) + empty data — component queries Dexie.
 * Offline: no server round-trip needed, component loads from IndexedDB.
 */
import { browser } from '$app/environment';
import { nip19 } from 'nostr-tools';

export const prerender = false;

/** Profiles whose apps list is restricted to a specific dTag prefix */
const PROFILE_APP_FILTERS = {
	'npub10r8xl2njyepcw2zwv3a6dyufj4e4ajx86hz6v4ehu4gnpupxxp7stjt2p8': 'dev.zapstore'
};

export const load = async ({ params }) => {
	const npub = params.npub ?? '';
	let pubkey = null;
	try {
		const decoded = nip19.decode(npub);
		if (decoded.type === 'npub') {
			pubkey = decoded.data;
		}
	} catch {
		pubkey = null;
	}

	if (!pubkey) {
		return { npub, pubkey: null, profile: null, apps: [], stacks: [], resolvedStacks: [], appFilterPrefix: null };
	}

	const appFilterPrefix = PROFILE_APP_FILTERS[npub] ?? null;

	if (browser) {
		return { npub, pubkey, profile: null, apps: [], stacks: [], resolvedStacks: [], appFilterPrefix };
	}

	const { fetchProfilesServer, fetchAppsByAuthor, fetchStacksByAuthor } = await import(
		'$lib/nostr/server.js'
	);
	const { parseProfile } = await import('$lib/nostr/models.js');

	const [profileMap, apps, stacksResult] = await Promise.all([
		fetchProfilesServer([pubkey]),
		fetchAppsByAuthor(pubkey, 50),
		fetchStacksByAuthor(pubkey, 50)
	]);

	const profileEvent = profileMap.get(pubkey) ?? null;
	const profile = profileEvent ? parseProfile(profileEvent) : null;

	const filteredApps = appFilterPrefix ? apps.filter((app) => app.dTag?.startsWith(appFilterPrefix)) : apps;

	return {
		npub,
		pubkey,
		profile,
		apps: filteredApps,
		stacks: stacksResult.stacks,
		resolvedStacks: stacksResult.resolvedStacks,
		appFilterPrefix
	};
};
