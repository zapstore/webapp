import { decodeNaddr } from '$lib/nostr';
import { fetchApp, fetchAppByIdentifier, fetchLatestReleaseForApp, fetchReleasesForApp } from '$lib/nostr/server';

export const prerender = false;

export const load = async ({ params }) => {
	const appid = params.appid;

	// Try naddr decode first; if it fails treat as plain d-tag identifier
	const pointer = decodeNaddr(appid);

	let pubkey, identifier;

	if (pointer) {
		pubkey = pointer.pubkey;
		identifier = pointer.identifier;
		const result = fetchApp(pubkey, identifier);
		if (!result) {
			return { app: null, latestRelease: null, releases: [], error: 'App not found' };
		}
		const { app, seedEvents } = result;
		const latestRelease = fetchLatestReleaseForApp(pubkey, identifier);
		const releases = fetchReleasesForApp(pubkey, identifier, 50);
		return { app, latestRelease, releases, seedEvents: seedEvents ?? [], error: null };
	}

	// Plain d-tag identifier path
	const result = fetchAppByIdentifier(appid);
	if (!result) {
		return { app: null, latestRelease: null, releases: [], error: 'App not found' };
	}
	pubkey = result.app.pubkey;
	identifier = result.app.dTag;
	const latestRelease = fetchLatestReleaseForApp(pubkey, identifier);
	const releases = fetchReleasesForApp(pubkey, identifier, 50);
	return {
		app: result.app,
		latestRelease,
		releases,
		seedEvents: result.seedEvents ?? [],
		error: null
	};
};
