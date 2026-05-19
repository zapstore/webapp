import { nip19 } from 'nostr-tools';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import {
	DEFAULT_CATALOG_RELAYS,
	EVENT_KINDS,
	PLATFORM_FILTER,
	PROFILE_FETCH_RELAYS
} from '$lib/config.js';
import { queryEvent, queryEvents } from '$lib/nostr/dexie.js';
import { decodeNaddr, parseApp, parseAppStack, parseProfile } from '$lib/nostr/models.js';
import { createDetailQuery } from './createDetailQuery.svelte.js';

/**
 * @param {{ pubkey: string }} stack
 * @param {ReturnType<typeof parseProfile> | null} profile
 */
function buildCreator(stack, profile) {
	if (!stack?.pubkey) return null;
	let npub;
	try {
		npub = nip19.npubEncode(stack.pubkey);
	} catch {
		npub = '';
	}
	return {
		name: profile?.displayName || profile?.name,
		picture: profile?.picture,
		pubkey: stack.pubkey,
		npub
	};
}

/**
 * @param {import('nostr-tools').Event[]} appEvents
 */
function dedupeAppEvents(appEvents) {
	const byKey = new SvelteMap();
	for (const event of appEvents ?? []) {
		const dTag = event.tags?.find((t) => t[0] === 'd')?.[1];
		if (!dTag) continue;
		const key = `${event.pubkey}:${dTag}`;
		const existing = byKey.get(key);
		if (!existing || event.created_at > existing.created_at) {
			byKey.set(key, event);
		}
	}
	return [...byKey.values()];
}

/**
 * Decode the stack pointer once. Returns null for app naddrs and bare
 * package ids — those are caller's redirect responsibility.
 *
 * @param {string} naddr
 */
function stackPointer(naddr) {
	const pointer = decodeNaddr(naddr);
	return pointer?.kind === EVENT_KINDS.APP_STACK ? pointer : null;
}

/**
 * @param {{ naddr?: string }} input
 */
async function loadStackDetail(input) {
	const naddr = input?.naddr ?? '';
	const pointer = naddr ? stackPointer(naddr) : null;
	if (!pointer) {
		return { stack: null, creator: null, apps: [] };
	}

	const stackEvent = await queryEvent({
		kinds: [EVENT_KINDS.APP_STACK],
		authors: [pointer.pubkey],
		'#d': [pointer.identifier],
		limit: 1
	});
	const parsedStack = stackEvent ? parseAppStack(stackEvent) : null;
	if (!parsedStack) {
		return { stack: null, creator: null, apps: [] };
	}

	const [profileEvent, appEvents] = await Promise.all([
		queryEvent({ kinds: [EVENT_KINDS.PROFILE], authors: [parsedStack.pubkey], limit: 1 }),
		(async () => {
			const refs = (parsedStack.appRefs ?? []).filter((r) => r.kind === EVENT_KINDS.APP);
			const ids = [...new Set(refs.map((r) => r.identifier).filter(Boolean))];
			if (ids.length === 0) return [];
			return queryEvents({ kinds: [EVENT_KINDS.APP], '#d': ids });
		})()
	]);

	const profile = profileEvent ? parseProfile(profileEvent) : null;
	const creator = buildCreator(parsedStack, profile);
	const apps = dedupeAppEvents(appEvents).map(parseApp);

	// Match the legacy shape: route code reads `stack.creator.*`.
	return {
		stack: { ...parsedStack, creator },
		creator,
		apps
	};
}

/**
 * Stack detail query — consumes URL/seed input, returns reactive `$state`.
 *
 * Same contract as `createAppDetailQuery`: SSR seed populates initial state,
 * Dexie liveQuery drives reactive updates, and the hydration plan refills
 * any missing pieces from the catalog and profile relays.
 *
 * @param {() => { naddr?: string, seedStack?: any, seedApps?: any[], seedEvents?: import('nostr-tools').Event[], error?: string | null }} getInput
 * @param {{ hydrate?: boolean, timeout?: number }} [options]
 */
export function createStackDetailQuery(getInput, options = {}) {
	const shouldHydrate = options.hydrate !== false;

	return createDetailQuery({
		initial: { stack: null, creator: null, apps: [] },
		notFoundMessage: 'Stack not found',
		timeout: options.timeout ?? 5000,
		featurePrefix: 'purpleweb-stack-detail',
		getInput,
		getSeed: (input) => ({
			stack: input?.seedStack ?? null,
			creator: input?.seedStack?.creator ?? null,
			apps: input?.seedApps ?? []
		}),
		getSeedEvents: (input) => input?.seedEvents ?? [],
		getInitialError: (input) => input?.error ?? '',
		load: loadStackDetail,
		isPresent: (value) => value?.stack != null,
		hydrate({ input, value, hydrateOnce }) {
			if (!shouldHydrate) return;
			const naddr = input?.naddr ?? '';
			if (!naddr) return;
			const pointer = stackPointer(naddr);
			if (!pointer) return;

			// 1. Hydrate the stack event itself.
			hydrateOnce(
				`stack:${naddr}`,
				DEFAULT_CATALOG_RELAYS,
				{
					kinds: [EVENT_KINDS.APP_STACK],
					authors: [pointer.pubkey],
					'#d': [pointer.identifier],
					...PLATFORM_FILTER,
					limit: 1
				},
				'purpleweb-stack-detail'
			);

			const stack = value?.stack;
			if (!stack) return;

			// 2. Hydrate the creator profile from the profile relay.
			hydrateOnce(
				`profile:${stack.pubkey}`,
				PROFILE_FETCH_RELAYS,
				{ kinds: [EVENT_KINDS.PROFILE], authors: [stack.pubkey], limit: 2 },
				'purpleweb-stack-profile'
			);

			// 3. Hydrate any referenced apps not yet in Dexie. Single batch
			//    request — the relay returns whatever it has, the rest stays
			//    missing (acceptable: stacks can reference cross-platform apps).
			const refs = (stack.appRefs ?? []).filter(
				(/** @type {any} */ r) => r.kind === EVENT_KINDS.APP && r.pubkey && r.identifier
			);
			if (refs.length === 0) return;
			const ids = [...new SvelteSet(refs.map((/** @type {any} */ r) => r.identifier))];
			const authors = [...new SvelteSet(refs.map((/** @type {any} */ r) => r.pubkey))];
			hydrateOnce(
				`apps:${ids.sort().join(',')}`,
				DEFAULT_CATALOG_RELAYS,
				{
					kinds: [EVENT_KINDS.APP],
					authors,
					'#d': ids,
					...PLATFORM_FILTER,
					limit: ids.length + 5
				},
				'purpleweb-stack-apps'
			);
		}
	});
}
