import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import {
	EVENT_KINDS,
	PROFILE_FETCH_RELAYS,
	SAVED_APPS_STACK_D_TAG,
	ZAPSTORE_RELAY
} from '$lib/config.js';
import { queryEvent, queryEvents } from '../storage/dexie.js';
import { parseApp, parseAppStack, parseProfile } from '$lib/nostr/models.js';
import { createDetailQuery } from './createDetailQuery.svelte.js';

/**
 * Dexie read for a profile page: profile + all apps + all stacks + per-stack
 * resolved apps. Pure Dexie composition; relay hydration lives in `hydrate`.
 *
 * Apps are filtered server-side by author (no platform filter — profile pages
 * show every app the developer has published, on any platform). When the URL
 * carries an `appFilterPrefix` (e.g. a curated developer subset) it's applied
 * after parsing.
 *
 * @param {{ pubkey?: string, appFilterPrefix?: string | null }} input
 */
async function loadProfileDetail(input) {
	const pubkey = input?.pubkey ?? '';
	if (!pubkey) {
		return { profile: null, apps: [], stacks: [], resolvedStacks: [] };
	}
	const prefix = input?.appFilterPrefix ?? null;

	const [profileEvent, appEvents, stackEvents] = await Promise.all([
		queryEvent({ kinds: [EVENT_KINDS.PROFILE], authors: [pubkey], limit: 1 }),
		queryEvents({ kinds: [EVENT_KINDS.APP], authors: [pubkey] }),
		queryEvents({ kinds: [EVENT_KINDS.APP_STACK], authors: [pubkey] })
	]);

	const profile = profileEvent ? parseProfile(profileEvent) : null;

	// Dedupe apps by (pubkey, dTag) — kind 32267 is addressable so newest wins.
	const appsByKey = new SvelteMap();
	for (const ev of appEvents) {
		const dTag = ev.tags?.find((t) => t[0] === 'd')?.[1];
		if (!dTag) continue;
		const key = `${ev.pubkey}:${dTag}`;
		const existing = appsByKey.get(key);
		if (!existing || ev.created_at > existing.created_at) appsByKey.set(key, ev);
	}
	const parsedApps = [...appsByKey.values()].map(parseApp);
	const apps = prefix ? parsedApps.filter((a) => a.dTag?.startsWith(prefix)) : parsedApps;

	// Public stacks only — hide private Saved Apps + private (non-empty content).
	const stacks = stackEvents
		.map(parseAppStack)
		.filter((s) => s && s.dTag !== SAVED_APPS_STACK_D_TAG && !s.event?.content);

	// Batch-resolve referenced apps for all stacks in a single Dexie query.
	// Replaces the legacy N+1 loop that fetched each missing ref one at a time.
	const refsByKey = new SvelteMap();
	for (const stack of stacks) {
		for (const ref of stack.appRefs ?? []) {
			if (ref.kind !== EVENT_KINDS.APP || !ref.pubkey || !ref.identifier) continue;
			refsByKey.set(`${ref.pubkey}:${ref.identifier}`, ref);
		}
	}
	const stackAppsByKey = new SvelteMap();
	if (refsByKey.size > 0) {
		const ids = [...new SvelteSet([...refsByKey.values()].map((r) => r.identifier))];
		const stackAppEvents = await queryEvents({ kinds: [EVENT_KINDS.APP], '#d': ids });
		for (const ev of stackAppEvents) {
			const dTag = ev.tags?.find((t) => t[0] === 'd')?.[1];
			if (!dTag) continue;
			const key = `${ev.pubkey}:${dTag}`;
			const existing = stackAppsByKey.get(key);
			if (!existing || ev.created_at > existing.created_at) stackAppsByKey.set(key, ev);
		}
	}

	const resolvedStacks = stacks.map((stack) => {
		const stackApps = (stack.appRefs ?? [])
			.filter((r) => r.kind === EVENT_KINDS.APP)
			.map((r) => {
				const ev = stackAppsByKey.get(`${r.pubkey}:${r.identifier}`);
				return ev ? parseApp(ev) : null;
			})
			.filter(Boolean);
		return { stack, apps: stackApps };
	});

	return { profile, apps, stacks, resolvedStacks };
}

/**
 * Profile detail query — local-first reactive read of a profile page's data.
 *
 * Returns `{ profile, apps, stacks, resolvedStacks, loading, error }`.
 *
 * Hydration plan:
 *   1. profile from `PROFILE_FETCH_RELAYS` (vertexlab seeds metadata).
 *   2. apps by author from `ZAPSTORE_RELAY` (no platform filter — profile pages
 *      show cross-platform).
 *   3. stacks by author from `ZAPSTORE_RELAY`.
 *   4. After liveQuery emits with stack data, a single batch relay fetch
 *      for any unreferenced stack apps (no N+1 — replaces the legacy loop
 *      that issued one request per missing ref).
 *
 * Profiles always render (no 404 timer) — `isPresent` always returns true.
 *
 * @param {() => { pubkey?: string, appFilterPrefix?: string | null, seedProfile?: any, seedApps?: any[], seedStacks?: any[], seedResolvedStacks?: any[], seedEvents?: import('nostr-tools').Event[], error?: string | null }} getInput
 * @param {{ hydrate?: boolean, timeout?: number }} [options]
 */
export function createProfileDetailQuery(getInput, options = {}) {
	const shouldHydrate = options.hydrate !== false;

	return createDetailQuery({
		initial: { profile: null, apps: [], stacks: [], resolvedStacks: [] },
		notFoundMessage: '',
		timeout: options.timeout ?? 5000,
		featurePrefix: 'purpleweb-profile-detail',
		getInput,
		getSeed: (input) => ({
			profile: input?.seedProfile ?? null,
			apps: input?.seedApps ?? [],
			stacks: input?.seedStacks ?? [],
			resolvedStacks: input?.seedResolvedStacks ?? []
		}),
		getSeedEvents: (input) => input?.seedEvents ?? [],
		getInitialError: (input) => input?.error ?? '',
		load: loadProfileDetail,
		// Profiles always "exist" — render whatever we have, never 404.
		isPresent: () => true,
		hydrate({ input, value, hydrateOnce }) {
			if (!shouldHydrate) return;
			const pubkey = input?.pubkey ?? '';
			if (!pubkey) return;

			hydrateOnce(
				`profile:${pubkey}`,
				PROFILE_FETCH_RELAYS,
				{ kinds: [EVENT_KINDS.PROFILE], authors: [pubkey], limit: 2 },
				'purpleweb-profile-detail-profile'
			);
			hydrateOnce(
				`profile-apps:${pubkey}`,
				[ZAPSTORE_RELAY],
				{ kinds: [EVENT_KINDS.APP], authors: [pubkey], limit: 100 },
				'purpleweb-profile-detail-apps'
			);
			hydrateOnce(
				`profile-stacks:${pubkey}`,
				[ZAPSTORE_RELAY],
				{ kinds: [EVENT_KINDS.APP_STACK], authors: [pubkey], limit: 100 },
				'purpleweb-profile-detail-stacks'
			);

			// Batch backfill any stack-referenced apps we don't have locally.
			const stacks = value?.stacks ?? [];
			if (stacks.length === 0) return;
			const haveKeys = new SvelteSet(
				(value?.resolvedStacks ?? [])
					.flatMap((/** @type {any} */ rs) => rs.apps ?? [])
					.map((/** @type {any} */ a) => `${a.pubkey}:${a.dTag}`)
			);
			const missingRefs = [];
			const seenKeys = new SvelteSet();
			for (const stack of stacks) {
				for (const ref of stack.appRefs ?? []) {
					if (ref.kind !== EVENT_KINDS.APP || !ref.pubkey || !ref.identifier) continue;
					const key = `${ref.pubkey}:${ref.identifier}`;
					if (haveKeys.has(key) || seenKeys.has(key)) continue;
					seenKeys.add(key);
					missingRefs.push(ref);
				}
			}
			if (missingRefs.length === 0) return;
			const authors = [...new SvelteSet(missingRefs.map((r) => r.pubkey))];
			const ids = [...new SvelteSet(missingRefs.map((r) => r.identifier))];
			hydrateOnce(
				`profile-stack-apps:${pubkey}:${ids.sort().join(',')}`,
				[ZAPSTORE_RELAY],
				{
					kinds: [EVENT_KINDS.APP],
					authors,
					'#d': ids,
					limit: missingRefs.length + 10
				},
				'purpleweb-profile-detail-stack-apps'
			);
		}
	});
}
