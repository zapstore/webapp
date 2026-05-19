import { browser } from '$app/environment';
import { liveQuery } from 'dexie';
import {
	DEFAULT_CATALOG_RELAYS,
	EVENT_KINDS,
	PLATFORM_FILTER,
	PROFILE_FETCH_RELAYS,
	ZAPSTORE_BLOSSOM_URL
} from '$lib/config.js';
import { putEvents, queryEvent, queryEvents } from '$lib/nostr/dexie.js';
import { decodeNaddr, parseApp, parseProfile, parseRelease } from '$lib/nostr/models.js';
import { hydrateFilters } from '../sync/hydrate.js';

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
	return Object.values(byId).sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
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
async function queryAppDetail(input) {
	const appid = input.appid ?? '';
	if (!appid) {
		return {
			app: null,
			publisherProfile: null,
			releases: [],
			latestRelease: null,
			directDownloadUrl: null
		};
	}

	const lookup = appLookup(appid, input.seedApp);
	let appEvent = null;
	if (lookup.filter) {
		appEvent = await queryEvent(lookup.filter);
	}
	const app = appEvent ? parseApp(appEvent) : null;
	if (!app) {
		return {
			app: null,
			publisherProfile: null,
			releases: [],
			latestRelease: null,
			directDownloadUrl: null
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
		directDownloadUrl: directDownloadUrlForRelease(latestRelease, assetEvents)
	};
}

/**
 * App detail query. Consumers provide URL/seed input; purpleweb owns Dexie reads,
 * seed persistence, and relay hydration.
 *
 * @param {() => { appid?: string, seedApp?: any, seedEvents?: import('nostr-tools').Event[], error?: string | null }} getInput
 * @param {{ hydrate?: boolean, timeout?: number }} [options]
 */
export function createAppDetailQuery(getInput, options = {}) {
	const initialInput = getInput?.() ?? {};
	const state = $state({
		app: browser ? null : (initialInput.seedApp ?? null),
		publisherProfile: null,
		releases: [],
		latestRelease: null,
		directDownloadUrl: null,
		loading: false,
		releasesLoading: false,
		error: browser ? '' : (initialInput.error ?? '')
	});

	$effect(() => {
		const input = getInput?.() ?? {};
		const appid = input.appid ?? '';
		if (!browser) {
			state.app = input.seedApp ?? null;
			state.error = input.error ?? '';
			return;
		}
		if (!appid) {
			state.app = null;
			state.publisherProfile = null;
			state.releases = [];
			state.latestRelease = null;
			state.directDownloadUrl = null;
			state.loading = false;
			state.releasesLoading = false;
			state.error = input.error ?? '';
			return;
		}

		let cancelled = false;
		let notFoundTimer = null;
		const hydrated = Object.create(null);
		const shouldHydrate = options.hydrate !== false;
		const lookup = appLookup(appid, input.seedApp);

		if (input.seedEvents?.length) {
			putEvents(input.seedEvents).catch((err) =>
				console.error('[purpleweb] failed to persist app detail seed events:', err)
			);
		}
		if (input.seedApp?.event) {
			putEvents([input.seedApp.event]).catch(() => {});
		}

		function hydrateOnce(key, relays, filters, feature) {
			if (!shouldHydrate || hydrated[key]) return;
			hydrated[key] = true;
			hydrateFilters(relays, filters, {
				timeout: options.timeout ?? 5000,
				feature
			}).catch(() => {});
		}

		if (lookup.filter) {
			hydrateOnce(`app:${appid}`, DEFAULT_CATALOG_RELAYS, lookup.filter, 'purpleweb-app-detail');
		}

		state.loading = true;
		state.releasesLoading = true;
		notFoundTimer = setTimeout(() => {
			if (!cancelled && !state.app) {
				state.loading = false;
				state.error = input.error ?? 'App not found';
			}
		}, options.timeout ?? 5000);

		const sub = liveQuery(() => queryAppDetail(input)).subscribe({
			next(value) {
				if (cancelled) return;
				state.app = value.app;
				state.publisherProfile = value.publisherProfile;
				state.releases = value.releases;
				state.latestRelease = value.latestRelease;
				state.directDownloadUrl = value.directDownloadUrl;
				state.loading = false;
				state.releasesLoading = false;
				state.error = value.app ? '' : (input.error ?? '');
				if (value.app && notFoundTimer) {
					clearTimeout(notFoundTimer);
					notFoundTimer = null;
				}

				if (!value.app) return;
				const aTagValue = `${EVENT_KINDS.APP}:${value.app.pubkey}:${value.app.dTag}`;
				hydrateOnce(
					`profile:${value.app.pubkey}`,
					PROFILE_FETCH_RELAYS,
					{ kinds: [EVENT_KINDS.PROFILE], authors: [value.app.pubkey], limit: 2 },
					'purpleweb-app-profile'
				);
				hydrateOnce(
					`releases:${aTagValue}`,
					DEFAULT_CATALOG_RELAYS,
					[
						{ kinds: [EVENT_KINDS.RELEASE], '#a': [aTagValue], limit: 50 },
						{ kinds: [EVENT_KINDS.RELEASE], '#i': [value.app.dTag], limit: 50 }
					],
					'purpleweb-app-releases'
				);

				const artifactIds = value.latestRelease?.artifacts?.filter(isHexId) ?? [];
				if (artifactIds.length > 0) {
					hydrateOnce(
						`assets:${artifactIds.join(',')}`,
						DEFAULT_CATALOG_RELAYS,
						{ ids: artifactIds, limit: artifactIds.length },
						'purpleweb-app-assets'
					);
				}
			},
			error(err) {
				if (cancelled) return;
				state.loading = false;
				state.releasesLoading = false;
				state.error = err instanceof Error ? err.message : 'Failed to read app detail';
			}
		});

		return () => {
			cancelled = true;
			if (notFoundTimer) clearTimeout(notFoundTimer);
			sub.unsubscribe();
		};
	});

	return state;
}
