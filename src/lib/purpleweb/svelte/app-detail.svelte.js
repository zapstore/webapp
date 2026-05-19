import {
	DEFAULT_CATALOG_RELAYS,
	EVENT_KINDS,
	PLATFORM_FILTER,
	PROFILE_FETCH_RELAYS,
	ZAPSTORE_BLOSSOM_URL
} from '$lib/config.js';
import { queryEvent, queryEvents } from '$lib/nostr/dexie.js';
import { decodeNaddr, parseApp, parseProfile, parseRelease } from '$lib/nostr/models.js';
import { createDetailQuery } from './createDetailQuery.svelte.js';

/**
 * @param {unknown} value
 */
function isHexId(value) {
	return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

/**
 * @param {import('nostr-tools').Event[]} events
 */
function dedupeNewest(events) {
	const byId = Object.create(null);
	for (const event of events ?? []) {
		if (event?.id) byId[event.id] = event;
	}
	return Object.values(byId).sort(
		(/** @type {any} */ a, /** @type {any} */ b) => (b.created_at ?? 0) - (a.created_at ?? 0)
	);
}

/**
 * @param {string} appid
 * @param {any} seedApp
 */
function appLookup(appid, seedApp) {
	const pointer = decodeNaddr(appid);
	if (pointer?.kind === EVENT_KINDS.APP) {
		return {
			pointer,
			identifier: pointer.identifier,
			pubkey: pointer.pubkey,
			filter: {
				kinds: [EVENT_KINDS.APP],
				authors: [pointer.pubkey],
				'#d': [pointer.identifier],
				...PLATFORM_FILTER,
				limit: 1
			}
		};
	}

	const identifier = seedApp?.dTag ?? (pointer ? '' : appid);
	const pubkey = seedApp?.pubkey;
	return {
		pointer,
		identifier,
		pubkey,
		filter: identifier
			? {
					kinds: [EVENT_KINDS.APP],
					...(pubkey ? { authors: [pubkey] } : {}),
					'#d': [identifier],
					...PLATFORM_FILTER,
					limit: 1
				}
			: null
	};
}

/**
 * Prefer the Blossom CDN URL when available; otherwise fall back to whatever
 * URL the release advertises. Pure UI/business choice — kept next to the read
 * so it stays consistent with the asset events we just queried.
 *
 * @param {any} release
 * @param {import('nostr-tools').Event[]} assetEvents
 */
function directDownloadUrlForRelease(release, assetEvents) {
	if (!release) return null;
	if (release.url?.startsWith(ZAPSTORE_BLOSSOM_URL)) return release.url;
	const artifactIds = release.artifacts ?? [];
	if (!artifactIds.length) return release.url ?? null;

	for (const event of assetEvents ?? []) {
		const urls = (event.tags ?? []).filter((tag) => tag[0] === 'url' && tag[1]).map((tag) => tag[1]);
		const cdnUrl = urls.find((url) => url.startsWith(ZAPSTORE_BLOSSOM_URL));
		if (cdnUrl) return cdnUrl;
		const hash = event.tags?.find((tag) => tag[0] === 'x')?.[1];
		if (hash) return `${ZAPSTORE_BLOSSOM_URL}/${hash}`;
		if (urls[0]) return urls[0];
	}

	return release.url ?? null;
}

/**
 * @param {{ appid?: string, seedApp?: any }} input
 */
async function loadAppDetail(input) {
	const appid = input.appid ?? '';
	if (!appid) {
		return {
			app: null,
			publisherProfile: null,
			releases: [],
			latestRelease: null,
			directDownloadUrl: null,
			releasesLoading: false
		};
	}

	const lookup = appLookup(appid, input.seedApp);
	const appEvent = lookup.filter ? await queryEvent(lookup.filter) : null;
	const app = appEvent ? parseApp(appEvent) : null;
	if (!app) {
		return {
			app: null,
			publisherProfile: null,
			releases: [],
			latestRelease: null,
			directDownloadUrl: null,
			releasesLoading: false
		};
	}

	const aTagValue = `${EVENT_KINDS.APP}:${app.pubkey}:${app.dTag}`;
	const [profileEvent, byATag, byITag] = await Promise.all([
		queryEvent({ kinds: [EVENT_KINDS.PROFILE], authors: [app.pubkey], limit: 1 }),
		queryEvents({ kinds: [EVENT_KINDS.RELEASE], '#a': [aTagValue], limit: 50 }),
		queryEvents({ kinds: [EVENT_KINDS.RELEASE], '#i': [app.dTag], limit: 50 })
	]);
	const releaseEvents = dedupeNewest([...byATag, ...byITag]).slice(0, 50);
	const releases = releaseEvents.map(parseRelease);
	const latestRelease = releases[0] ?? null;
	const artifactIds = latestRelease?.artifacts?.filter(isHexId) ?? [];
	const assetEvents = artifactIds.length
		? await queryEvents({
				kinds: [EVENT_KINDS.ASSET, EVENT_KINDS.FILE_METADATA],
				ids: artifactIds,
				limit: artifactIds.length
			})
		: [];

	return {
		app,
		publisherProfile: profileEvent ? parseProfile(profileEvent) : null,
		releases,
		latestRelease,
		directDownloadUrl: directDownloadUrlForRelease(latestRelease, assetEvents),
		releasesLoading: false
	};
}

/**
 * App detail query — consumes URL/seed input, returns reactive `$state`.
 *
 * Layered on `createDetailQuery`: the primitive owns lifecycle, SSR seed,
 * not-found timer, and hydration dedup; this wrapper supplies the
 * Dexie-only read shape and the per-stage hydration plan.
 *
 * @param {() => { appid?: string, seedApp?: any, seedEvents?: import('nostr-tools').Event[], error?: string | null }} getInput
 * @param {{ hydrate?: boolean, timeout?: number }} [options]
 */
export function createAppDetailQuery(getInput, options = {}) {
	const shouldHydrate = options.hydrate !== false;

	return createDetailQuery({
		initial: {
			app: null,
			publisherProfile: null,
			releases: [],
			latestRelease: null,
			directDownloadUrl: null,
			releasesLoading: false
		},
		notFoundMessage: 'App not found',
		timeout: options.timeout ?? 5000,
		featurePrefix: 'purpleweb-app-detail',
		getInput,
		getSeed: (input) => ({ app: input?.seedApp ?? null }),
		getSeedEvents: (input) => {
			const events = [...(input?.seedEvents ?? [])];
			if (input?.seedApp?.event) events.push(input.seedApp.event);
			return events;
		},
		getInitialError: (input) => input?.error ?? '',
		load: loadAppDetail,
		isPresent: (value) => value?.app != null,
		hydrate({ input, value, hydrateOnce }) {
			if (!shouldHydrate) return;
			const appid = input?.appid ?? '';
			if (!appid) return;

			// 1. Hydrate the app event itself — only stage we can run before
			//    liveQuery emits, because we need the URL pointer or seed dTag.
			const lookup = appLookup(appid, input.seedApp);
			if (lookup.filter) {
				hydrateOnce(`app:${appid}`, DEFAULT_CATALOG_RELAYS, lookup.filter, 'purpleweb-app-detail');
			}

			// 2..4 require the parsed app — only fire after liveQuery resolves.
			const app = value?.app;
			if (!app) return;

			const aTagValue = `${EVENT_KINDS.APP}:${app.pubkey}:${app.dTag}`;
			hydrateOnce(
				`profile:${app.pubkey}`,
				PROFILE_FETCH_RELAYS,
				{ kinds: [EVENT_KINDS.PROFILE], authors: [app.pubkey], limit: 2 },
				'purpleweb-app-profile'
			);
			hydrateOnce(
				`releases:${aTagValue}`,
				DEFAULT_CATALOG_RELAYS,
				[
					{ kinds: [EVENT_KINDS.RELEASE], '#a': [aTagValue], limit: 50 },
					{ kinds: [EVENT_KINDS.RELEASE], '#i': [app.dTag], limit: 50 }
				],
				'purpleweb-app-releases'
			);

			const artifactIds = value?.latestRelease?.artifacts?.filter(isHexId) ?? [];
			if (artifactIds.length > 0) {
				hydrateOnce(
					`assets:${artifactIds.join(',')}`,
					DEFAULT_CATALOG_RELAYS,
					{ ids: artifactIds, limit: artifactIds.length },
					'purpleweb-app-assets'
				);
			}
		}
	});
}
