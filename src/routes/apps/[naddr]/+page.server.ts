/**
 * App detail page - server-side data loading
 *
 * Prerenders all app detail pages at build time.
 * entries() generates the list of all naddrs to prerender.
 */

import { fetchAllApps, fetchApp, fetchLatestReleaseForApp } from '$lib/nostr/server';
import { decodeNaddr } from '$lib/nostr/models';
import type { PageServerLoad, EntryGenerator } from './$types';

export const prerender = true;

/**
 * Generate entries for all app detail pages
 */
export const entries: EntryGenerator = async () => {
	const apps = await fetchAllApps();
	return apps.map((app) => ({ naddr: app.naddr }));
};

export const load: PageServerLoad = async ({ params }) => {
	const pointer = decodeNaddr(params.naddr);

	if (!pointer) {
		return {
			app: null,
			latestRelease: null,
			error: 'Invalid app URL'
		};
	}

	const { pubkey, identifier } = pointer;

	const [app, latestRelease] = await Promise.all([
		fetchApp(pubkey, identifier),
		fetchLatestReleaseForApp(pubkey, identifier)
	]);

	if (!app) {
		return {
			app: null,
			latestRelease: null,
			error: 'App not found'
		};
	}

	return {
		app,
		latestRelease,
		error: null
	};
};
