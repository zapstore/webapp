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
 * Page-session memory of (pubkey:identifier) keys we've already dispatched to
 * the relay for preview-app backfill. Kept module-scoped so multiple liveQuery
 * re-runs (or remounts via back-nav) don't refetch the same refs.
 *
 * @type {SvelteSet<string>}
 */
const fetchedPreviewKeys = new SvelteSet();

/**
 * Fire-and-forget relay fetch for the given app refs. `fetchFromRelays`
 * writes results to Dexie, which re-fires the listing's liveQuery.
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
			limit: refs.length + 5
		},
		{ feature: 'purpleweb-stacks-listing-preview-fill' }
	);
}

/**
 * Dexie read for the stacks listing: latest public stack per (pubkey, dTag),
 * with up to 4 preview apps resolved per stack. Stacks with no resolved
 * preview apps yet AND no pending backfill are excluded (kept hidden until
 * something to show).
 */
async function loadStacks() {
	const stackFilter = { kinds: [EVENT_KINDS.APP_STACK] };
	if (platformTag) stackFilter['#f'] = [platformTag];
	const stackEvents = await queryEvents(stackFilter);

	if (stackEvents.length === 0) return [];

	const stacksByKey = new SvelteMap();
	for (const ev of stackEvents) {
		const parsed = parseAppStack(ev);
		if (!parsed?.pubkey || !parsed?.dTag) continue;
		// Skip the private Saved Apps stack and private stacks (non-empty content).
		if (parsed.dTag === SAVED_APPS_STACK_D_TAG || !!parsed.event?.content) continue;
		const key = `${parsed.pubkey}:${parsed.dTag}`;
		const existing = stacksByKey.get(key);
		if (!existing || (parsed.createdAt ?? 0) > (existing.createdAt ?? 0)) {
			stacksByKey.set(key, parsed);
		}
	}

	const stacks = [...stacksByKey.values()].sort((a, b) => {
		const aCommunity = a.pubkey === ZAPSTORE_COMMUNITY_PUBKEY ? 0 : 1;
		const bCommunity = b.pubkey === ZAPSTORE_COMMUNITY_PUBKEY ? 0 : 1;
		if (aCommunity !== bCommunity) return aCommunity - bCommunity;
		return (b.createdAt ?? 0) - (a.createdAt ?? 0);
	});

	const previewIdentifiers = new SvelteSet();
	for (const stack of stacks) {
		const refs = (stack.appRefs ?? []).filter(
			(r) => r.kind === EVENT_KINDS.APP && r.identifier
		);
		for (const ref of refs.slice(0, 4)) previewIdentifiers.add(ref.identifier);
	}

	const appsByKey = new SvelteMap();
	if (previewIdentifiers.size > 0) {
		const appFilter = { kinds: [EVENT_KINDS.APP], '#d': [...previewIdentifiers] };
		if (platformTag) appFilter['#f'] = [platformTag];
		const appEvents = await queryEvents(appFilter);
		for (const ev of appEvents) {
			const dTag = ev.tags?.find((t) => t[0] === 'd')?.[1];
			if (!dTag) continue;
			const key = `${ev.pubkey}:${dTag}`;
			const existing = appsByKey.get(key);
			if (!existing || ev.created_at > existing.created_at) appsByKey.set(key, ev);
		}
	}

	// Queue any refs that didn't resolve so background hydration fetches them.
	// `fetchedPreviewKeys` dedups across re-runs so we never double-fetch.
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

	// Hide stacks that have neither resolved apps nor pending refs — there's
	// nothing visual to show. (A pending stack stays in the list so it can
	// appear once the backfill writes preview apps into Dexie.)
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
			((e.tags?.find((t) => t[0] === 'd')?.[1] !== SAVED_APPS_STACK_D_TAG) && !e.content)
	);
}

/**
 * Stacks listing query — local-first reactive list + relay-backed pagination
 * with preview-app backfill.
 *
 * @param {() => { seedEvents?: import('nostr-tools').Event[] }} [getInput]
 */
export function createStacksListingQuery(getInput) {
	const state = createListingQuery({
		cacheKey: 'stacks',
		load: loadStacks,
		getInput,
		getSeedEvents: (input) => publicStackEvents(input?.seedEvents ?? []),
		hydrate: ({ input }) => {
			// Initialise cursor from the oldest seeded stack so the first
			// loadMore() call advances correctly.
			const seed = publicStackEvents(input?.seedEvents ?? []).filter(
				(e) => e.kind === EVENT_KINDS.APP_STACK
			);
			if (seed.length === 0 || state.cursor != null) return;
			const oldest = seed.reduce(
				(min, e) => (e.created_at < min ? e.created_at : min),
				Infinity
			);
			if (Number.isFinite(oldest)) {
				state.cursor = oldest - 1;
				state.hasMore = seed.length >= STACKS_PAGE_SIZE;
			}
		},
		featurePrefix: 'purpleweb-stacks-listing'
	});

	/**
	 * Fetch the next page of stacks from the catalog relay. The relay mixes
	 * public and private stacks (capped at 100/request), so we paginate in
	 * 100-event batches until we accumulate enough public events.
	 */
	async function loadMore() {
		if (state.loadingMore || !state.hasMore) return;
		if (typeof window === 'undefined' || !navigator.onLine) return;

		state.loadingMore = true;
		const RELAY_BATCH = 100;
		const accumulated = [];

		try {
			let localCursor = state.cursor;
			while (accumulated.length < STACKS_PAGE_SIZE) {
				const filter = {
					kinds: [EVENT_KINDS.APP_STACK],
					limit: RELAY_BATCH
				};
				if (localCursor != null) filter.until = localCursor;
				if (platformTag) filter['#f'] = [platformTag];

				const events = await fetchFromRelays([ZAPSTORE_RELAY], filter, {
					feature: 'purpleweb-stacks-listing-page'
				});
				if (events.length === 0) {
					state.hasMore = false;
					break;
				}

				accumulated.push(...publicStackEvents(events).filter((e) => e.kind === EVENT_KINDS.APP_STACK));
				// Advance cursor across ALL events so we don't re-fetch the page,
				// even when public events were a small fraction of the batch.
				localCursor = Math.min(...events.map((e) => e.created_at)) - 1;
				if (events.length < RELAY_BATCH) {
					state.hasMore = false;
					break;
				}
			}

			if (accumulated.length > 0) {
				state.cursor = localCursor;
				// fetchFromRelays already wrote events to Dexie; trigger preview
				// app backfill so newly-arrived stacks can populate their cards.
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
