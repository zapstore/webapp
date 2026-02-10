/**
 * App detail page - universal data loading
 *
 * NOT prerendered - loads data client-side using the fetch cascade:
 * EventStore → IndexedDB → Relays
 */

import { browser } from '$app/environment';
import { DEFAULT_CATALOG_RELAYS, EVENT_KINDS, PLATFORM_FILTER } from '$lib/config';
import { decodeNaddr, parseApp, parseRelease, fetchEvent } from '$lib/nostr';
import type { PageLoad } from './$types';

export const prerender = false;

export const load: PageLoad = async ({ params }) => {
	const pointer = decodeNaddr(params.naddr);

	if (!pointer) {
		return {
			app: null,
			latestRelease: null,
			error: 'Invalid app URL'
		};
	}

	const { pubkey, identifier } = pointer;

	// On server (shouldn't happen with prerender=false + static adapter), return empty
	// On client, fetch via the cascade
	if (!browser) {
		return {
			app: null,
			latestRelease: null,
			error: null,
			// Pass pointer so component can fetch client-side
			pointer: { pubkey, identifier }
		};
	}

	const aTagValue = `${EVENT_KINDS.APP}:${pubkey}:${identifier}`;

	const [appEvent, releaseEvent] = await Promise.all([
		fetchEvent(
			{ kinds: [EVENT_KINDS.APP], authors: [pubkey], '#d': [identifier], ...PLATFORM_FILTER },
			{ relays: [...DEFAULT_CATALOG_RELAYS], timeout: 10000 }
		),
		fetchEvent(
			{ kinds: [EVENT_KINDS.RELEASE], '#a': [aTagValue], ...PLATFORM_FILTER, limit: 1 },
			{ relays: [...DEFAULT_CATALOG_RELAYS], timeout: 10000 }
		)
	]);

	if (!appEvent) {
		return {
			app: null,
			latestRelease: null,
			error: 'App not found'
		};
	}

	return {
		app: parseApp(appEvent),
		latestRelease: releaseEvent ? parseRelease(releaseEvent) : null,
		error: null
	};
};
