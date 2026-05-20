import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import {
	EVENT_KINDS,
	PLATFORM_FILTER,
	SAVED_APPS_STACK_D_TAG,
	ZAPSTORE_COMMUNITY_PUBKEY,
	ZAPSTORE_RELAY
} from '$lib/config.js';
import { STACKS_PAGE_SIZE } from '$lib/constants.js';
import { queryEvents } from '../storage/dexie.js';
import { parseApp, parseAppStack } from '$lib/nostr/models.js';
import { fetchFromRelays } from '../sync/service.js';
import { createListingQuery } from './createListingQuery.svelte.js';

const platformTag = PLATFORM_FILTER['#f']?.[0];

/**
 * Page-session memory of (pubkey:identifier) preview refs already sent to the relay.
 * Must reset when Dexie is cleared — otherwise backfill is skipped while Dexie is empty.
 *
 * @type {SvelteSet<string>}
 */
const fetchedPreviewKeys = new SvelteSet();

/** @param {import('$lib/nostr/models').AppStack[]} stacks */
async function resolvePreviewAppsInDexie(stacks) {
	const appsByKey = new SvelteMap();
	/** @type {SvelteMap<string, SvelteSet<string>>} */
	const byAuthor = new SvelteMap();

	for (const stack of stacks) {
		for (const ref of (stack.appRefs ?? []).filter(
			(r) => r.kind === EVENT_KINDS.APP && r.pubkey && r.identifier
		)) {
			if (!byAuthor.has(ref.pubkey)) byAuthor.set(ref.pubkey, new SvelteSet());
			byAuthor.get(ref.pubkey).add(ref.identifier);
		}
	}

	for (const [pubkey, dSet] of byAuthor) {
		const dTags = [...dSet];
		if (dTags.length === 0) continue;
		const filter = {
			kinds: [EVENT_KINDS.APP],
			authors: [pubkey],
			'#d': dTags,
			limit: Math.max(dTags.length, 24)
		};
		if (platformTag) filter['#f'] = [platformTag];
		const appEvents = await queryEvents(filter);
		for (const ev of appEvents) {
			const dTag = ev.tags?.find((t) => t[0] === 'd')?.[1];
			if (!dTag) continue;
			const key = `${ev.pubkey}:${dTag}`;
			const existing = appsByKey.get(key);
			if (!existing || ev.created_at > existing.created_at) appsByKey.set(key, ev);
		}
	}

	return appsByKey;
}

/**
 * Fire-and-forget relay fetch for preview app refs (authors + #d, same as SSR).
 *
 * @param {Array<{pubkey: string, identifier: string}>} refs
 */
async function backfillPreviewApps(refs) {
	if (typeof window === 'undefined' || !navigator.onLine || refs.length === 0) return;
	const authors = [...new SvelteSet(refs.map((r) => r.pubkey))];
	const identifiers = [...new SvelteSet(refs.map((r) => r.identifier))];
	await fetchFromRelays(
		[ZAPSTORE_RELAY],
		{
			kinds: [EVENT_KINDS.APP],
			authors,
			'#d': identifiers,
			...PLATFORM_FILTER,
			limit: Math.max(refs.length + 10, 40)
		},
		{ feature: 'purpleweb-stacks-listing-preview-fill', immediateFlush: true }
	);
}

/**
 * @param {{ communityOnly?: boolean }} [input]
 */
async function loadStacks(input = {}) {
	const communityOnly = !!input.communityOnly;
	const stackFilter = { kinds: [EVENT_KINDS.APP_STACK] };
	if (communityOnly) stackFilter.authors = [ZAPSTORE_COMMUNITY_PUBKEY];
	if (platformTag) stackFilter['#f'] = [platformTag];
	const stackEvents = await queryEvents(stackFilter);

	if (stackEvents.length === 0) return [];

	const stacksByKey = new SvelteMap();
	for (const ev of stackEvents) {
		const parsed = parseAppStack(ev);
		if (!parsed?.pubkey || !parsed?.dTag) continue;
		if (parsed.dTag === SAVED_APPS_STACK_D_TAG || !!parsed.event?.content) continue;
		const key = `${parsed.pubkey}:${parsed.dTag}`;
		const existing = stacksByKey.get(key);
		if (!existing || (parsed.createdAt ?? 0) > (existing.createdAt ?? 0)) {
			stacksByKey.set(key, parsed);
		}
	}

	let stacks = [...stacksByKey.values()].sort((a, b) => {
		const aCommunity = a.pubkey === ZAPSTORE_COMMUNITY_PUBKEY ? 0 : 1;
		const bCommunity = b.pubkey === ZAPSTORE_COMMUNITY_PUBKEY ? 0 : 1;
		if (aCommunity !== bCommunity) return aCommunity - bCommunity;
		return (b.createdAt ?? 0) - (a.createdAt ?? 0);
	});

	if (communityOnly) {
		stacks = stacks.filter((s) => s.pubkey === ZAPSTORE_COMMUNITY_PUBKEY);
	}

	const appsByKey = await resolvePreviewAppsInDexie(stacks);

	const pendingRefs = [];
	const result = stacks.map((stack) => {
		const apps = [];
		const previewRefs = (stack.appRefs ?? [])
			.filter((r) => r.kind === EVENT_KINDS.APP)
			.slice(0, 4);
		for (const ref of previewRefs) {
			const key = `${ref.pubkey}:${ref.identifier}`;
			const appEvent = appsByKey.get(key);
			if (appEvent) {
				apps.push(parseApp(appEvent));
			} else if (!fetchedPreviewKeys.has(key)) {
				fetchedPreviewKeys.add(key);
				pendingRefs.push(ref);
			}
		}
		return { stack, apps };
	});

	if (pendingRefs.length > 0) {
		backfillPreviewApps(pendingRefs).catch(() => {});
	}

	// /apps: always show Zapstore community stacks (icons fill in when backfill lands).
	if (communityOnly) return result;

	// /stacks browse: hide stacks with nothing to show until preview resolves.
	return result.filter(({ stack, apps }) => {
		if (apps.length > 0) return true;
		const previewRefs = (stack.appRefs ?? [])
			.filter((r) => r.kind === EVENT_KINDS.APP)
			.slice(0, 4);
		return previewRefs.some((r) => fetchedPreviewKeys.has(`${r.pubkey}:${r.identifier}`));
	});
}

/**
 * @param {import('nostr-tools').Event[]} events
 */
function publicStackEvents(events) {
	return events.filter(
		(e) =>
			e.kind !== EVENT_KINDS.APP_STACK ||
			(e.tags?.find((t) => t[0] === 'd')?.[1] !== SAVED_APPS_STACK_D_TAG && !e.content)
	);
}

/** Call after clearLocalData() so preview backfill and listing cache restart clean. */
export function resetStacksListingSession() {
	fetchedPreviewKeys.clear();
}

/**
 * @param {() => { seedEvents?: import('nostr-tools').Event[], communityOnly?: boolean }} [getInput]
 */
export function createStacksListingQuery(getInput) {
	const state = createListingQuery({
		cacheKey: 'stacks',
		load: (input) => loadStacks(input ?? {}),
		getInput,
		getSeedEvents: (input) => publicStackEvents(input?.seedEvents ?? []),
		hydrate: ({ input, hydrateOnce }) => {
			const seed = publicStackEvents(input?.seedEvents ?? []).filter(
				(e) => e.kind === EVENT_KINDS.APP_STACK
			);
			if (seed.length > 0 && state.cursor == null) {
				const oldest = seed.reduce(
					(min, e) => (e.created_at < min ? e.created_at : min),
					Infinity
				);
				if (Number.isFinite(oldest)) {
					state.cursor = oldest - 1;
					state.hasMore = seed.length >= STACKS_PAGE_SIZE;
				}
			}

			if (input?.communityOnly) {
				hydrateOnce(
					'stacks-community-catalog',
					[ZAPSTORE_RELAY],
					{
						kinds: [EVENT_KINDS.APP_STACK],
						authors: [ZAPSTORE_COMMUNITY_PUBKEY],
						...(platformTag ? { '#f': [platformTag] } : {}),
						limit: 48
					},
					'purpleweb-stacks-listing-community-hydrate'
				);
			}
		},
		featurePrefix: 'purpleweb-stacks-listing'
	});

	async function loadMore() {
		if (state.loadingMore || !state.hasMore) return;
		if (typeof window === 'undefined' || !navigator.onLine) return;

		const input = getInput?.() ?? {};
		const communityOnly = !!input.communityOnly;

		state.loadingMore = true;
		const RELAY_BATCH = 100;
		const accumulated = [];

		try {
			let localCursor = state.cursor;
			while (accumulated.length < STACKS_PAGE_SIZE) {
				/** @type {import('$lib/nostr').NostrFilter} */
				const filter = {
					kinds: [EVENT_KINDS.APP_STACK],
					limit: RELAY_BATCH
				};
				if (localCursor != null) filter.until = localCursor;
				if (platformTag) filter['#f'] = [platformTag];
				if (communityOnly) filter.authors = [ZAPSTORE_COMMUNITY_PUBKEY];

				const events = await fetchFromRelays([ZAPSTORE_RELAY], filter, {
					feature: communityOnly
						? 'purpleweb-stacks-listing-community-page'
						: 'purpleweb-stacks-listing-page',
					immediateFlush: true
				});
				if (events.length === 0) {
					state.hasMore = false;
					break;
				}

				const publicStacks = publicStackEvents(events).filter(
					(e) => e.kind === EVENT_KINDS.APP_STACK
				);
				if (communityOnly) {
					accumulated.push(
						...publicStacks.filter((e) => e.pubkey === ZAPSTORE_COMMUNITY_PUBKEY)
					);
				} else {
					accumulated.push(...publicStacks);
				}

				localCursor = Math.min(...events.map((e) => e.created_at)) - 1;
				if (events.length < RELAY_BATCH) {
					state.hasMore = false;
					break;
				}
			}

			if (accumulated.length > 0) {
				state.cursor = localCursor;
				const previewRefs = [];
				const seen = new SvelteSet();
				for (const ev of accumulated) {
					const stack = parseAppStack(ev);
					if (!stack?.appRefs) continue;
					for (const ref of stack.appRefs
						.filter((r) => r.kind === EVENT_KINDS.APP && r.pubkey && r.identifier)
						.slice(0, 4)) {
						const key = `${ref.pubkey}:${ref.identifier}`;
						if (fetchedPreviewKeys.has(key) || seen.has(key)) continue;
						seen.add(key);
						previewRefs.push(ref);
					}
				}
				if (previewRefs.length > 0) {
					for (const r of previewRefs) {
						fetchedPreviewKeys.add(`${r.pubkey}:${r.identifier}`);
					}
					backfillPreviewApps(previewRefs).catch(() => {});
				}
			}
		} catch (err) {
			console.error('[purpleweb-stacks-listing] loadMore failed:', err);
		} finally {
			state.loadingMore = false;
		}
	}

	return Object.assign(state, { loadMore });
}
