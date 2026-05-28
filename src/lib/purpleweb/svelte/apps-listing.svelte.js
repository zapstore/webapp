import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { EVENT_KINDS, PLATFORM_FILTER, ZAPSTORE_RELAY } from '$lib/config.js';
import { APPS_PAGE_SIZE } from '$lib/constants.js';
import { queryEvents } from '../storage/dexie.js';
import { parseApp } from '$lib/nostr/models.js';
import { fetchFromRelays } from '../sync/service.js';
import { createListingQuery } from './createListingQuery.svelte.js';

const platformTag = PLATFORM_FILTER['#f']?.[0];

/**
 * Extract the package identifier from a release event — `i` tag wins, then
 * the d-tag prefix (`identifier@version`). Used to map releases to apps.
 *
 * @param {{ tags?: string[][] }} event
 */
function getReleaseIdentifier(event) {
	const iTag = event.tags?.find((t) => t[0] === 'i' && typeof t[1] === 'string');
	if (iTag) return iTag[1];
	const dTag = event.tags?.find((t) => t[0] === 'd' && typeof t[1] === 'string');
	if (!dTag) return null;
	const [identifier] = dTag[1].split('@');
	return identifier || null;
}

/**
 * @param {{ pubkey?: string, tags?: string[][] }} event
 */
function getReleaseAppKey(event) {
	const aTag = event.tags?.find(
		(t) =>
			(t[0] === 'a' || t[0] === 'A') &&
			typeof t[1] === 'string' &&
			t[1].startsWith(`${EVENT_KINDS.APP}:`)
	)?.[1];
	if (aTag) {
		const [, pubkey, ...identifierParts] = aTag.split(':');
		const identifier = identifierParts.join(':');
		if (pubkey && identifier) return `${pubkey}:${identifier}`;
	}

	const identifier = getReleaseIdentifier(event);
	return identifier && event.pubkey ? `${event.pubkey}:${identifier}` : null;
}

/**
 * Dexie read for the apps listing: latest app per (pubkey, dTag), ordered by
 * latest release when release events are available. Falls back to app
 * `created_at` for cold/offline caches that only have app metadata.
 */
async function loadApps() {
	const filter = { kinds: [EVENT_KINDS.APP] };
	if (platformTag) filter['#f'] = [platformTag];
	const events = await queryEvents(filter);

	const byKey = new SvelteMap();
	for (const ev of events) {
		const dTag = ev.tags?.find((t) => t[0] === 'd')?.[1];
		if (!dTag) continue;
		const key = `${ev.pubkey}:${dTag}`;
		const existing = byKey.get(key);
		if (!existing || ev.created_at > existing.created_at) {
			byKey.set(key, ev);
		}
	}

	const releaseFilter = { kinds: [EVENT_KINDS.RELEASE], limit: Math.max(APPS_PAGE_SIZE * 4, 100) };
	if (platformTag) releaseFilter['#f'] = [platformTag];
	const releases = await queryEvents(releaseFilter);
	const releaseRankByKey = new SvelteMap();
	let rank = 0;
	for (const release of releases) {
		const key = getReleaseAppKey(release);
		if (!key || releaseRankByKey.has(key)) continue;
		releaseRankByKey.set(key, {
			rank: rank++,
			created_at: release.created_at ?? 0
		});
	}

	return [...byKey.values()]
		.sort((a, b) => {
			const aDTag = a.tags?.find((t) => t[0] === 'd')?.[1];
			const bDTag = b.tags?.find((t) => t[0] === 'd')?.[1];
			const aRelease = aDTag ? releaseRankByKey.get(`${a.pubkey}:${aDTag}`) : null;
			const bRelease = bDTag ? releaseRankByKey.get(`${b.pubkey}:${bDTag}`) : null;
			if (aRelease && bRelease) return aRelease.rank - bRelease.rank;
			if (aRelease) return -1;
			if (bRelease) return 1;
			return b.created_at - a.created_at;
		})
		.map(parseApp);
}

/**
 * Apps listing query — local-first reactive list + relay-backed pagination.
 *
 * Pagination pattern (unchanged from the legacy store): query releases for
 * ordering, extract package identifiers, batch-query apps. All events land
 * in Dexie, the listing's liveQuery picks them up automatically.
 *
 * @param {() => { seedEvents?: import('nostr-tools').Event[] }} [getInput]
 */
export function createAppsListingQuery(getInput) {
	const state = createListingQuery({
		cacheKey: 'apps',
		load: loadApps,
		getInput,
		getSeedEvents: (input) => input?.seedEvents,
		featurePrefix: 'purpleweb-apps-listing'
	});

	/**
	 * Fetch the next page of apps from the catalog relay. Events write to
	 * Dexie, which re-fires liveQuery and updates `state.items`. Cursor lives
	 * on `state.cursor` so it survives the closure's lifetime.
	 */
	async function loadMore() {
		if (state.loadingMore || !state.hasMore) return;
		if (typeof window === 'undefined' || !navigator.onLine) return;

		state.loadingMore = true;
		try {
			const filter = {
				kinds: [EVENT_KINDS.RELEASE],
				...PLATFORM_FILTER,
				limit: APPS_PAGE_SIZE
			};
			if (state.cursor != null) filter.until = state.cursor;

			const releaseEvents = await fetchFromRelays([ZAPSTORE_RELAY], filter, {
				feature: 'purpleweb-apps-listing-page'
			});

			if (releaseEvents.length === 0) {
				state.hasMore = false;
				return;
			}

			const seen = new SvelteSet();
			const orderedIdentifiers = [];
			for (const ev of releaseEvents) {
				const id = getReleaseIdentifier(ev);
				if (!id || seen.has(id)) continue;
				seen.add(id);
				orderedIdentifiers.push(id);
			}

			if (orderedIdentifiers.length > 0) {
				await fetchFromRelays(
					[ZAPSTORE_RELAY],
					{
						kinds: [EVENT_KINDS.APP],
						'#d': orderedIdentifiers,
						...PLATFORM_FILTER,
						limit: orderedIdentifiers.length + 10
					},
					{ feature: 'purpleweb-apps-listing-fill' }
				);
			}

			state.cursor = Math.min(...releaseEvents.map((e) => e.created_at)) - 1;
			state.hasMore = releaseEvents.length >= APPS_PAGE_SIZE;
		} catch (err) {
			console.error('[purpleweb-apps-listing] loadMore failed:', err);
		} finally {
			state.loadingMore = false;
		}
	}

	return Object.assign(state, { loadMore });
}
