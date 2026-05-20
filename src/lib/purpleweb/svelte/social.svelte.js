import { browser } from '$app/environment';
import { liveQuery } from 'dexie';
import { untrack } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { EVENT_KINDS, PROFILE_FETCH_RELAYS } from '$lib/config.js';
import { isOnline } from '$lib/stores/online.svelte.js';
import { queryAddressableSocial } from '../storage/social.js';
import { hydrateFilters } from '../sync/hydrate.js';
import { subscribeAddressableSocial, subscribeEventZaps } from '../sync/social.js';

/**
 * Local-first social query for addressable roots (apps and stacks).
 *
 * @param {() => null | { kind: number, pubkey: string, identifier: string, mainEventIds?: string[] }} getRoot
 * @param {{ hydrate?: boolean, hydrateEnabled?: () => boolean, enabled?: () => boolean, limit?: number, timeout?: number }} [options]
 */
export function createAddressableSocialQuery(getRoot, options = {}) {
	const state = $state({
		comments: [],
		commentEvents: [],
		commentsLoading: false,
		commentsSyncing: false,
		commentsError: '',
		zaps: [],
		zapEvents: [],
		zapsLoading: false,
		labelEntries: [],
		labelEvents: [],
		labelsLoading: false,
		profiles: {},
		profilesLoading: false,
		missingProfilePubkeys: [],
		zapperProfiles: new SvelteMap()
	});

	// Depend ONLY on the stable identity key. Parent detail queries re-emit on
	// every Dexie write (parseApp returns a new object each time) — without
	// this guard the effect tore down + re-opened relay subscriptions in a
	// loop, and each fresh subscription wrote more events into Dexie, feeding
	// the loop. The key collapses identical roots to the same string so
	// $derived's Object.is dedup skips the re-run.
	const rootKey = $derived.by(() => {
		const root = getRoot?.();
		const enabled = options.enabled ? options.enabled() : true;
		if (!browser || !enabled || !root?.kind || !root?.pubkey || !root?.identifier) return null;
		return `${root.kind}:${root.pubkey}:${root.identifier}:${(root.mainEventIds ?? []).slice().sort().join(',')}`;
	});

	$effect(() => {
		if (rootKey === null) {
			state.comments = [];
			state.commentEvents = [];
			state.zaps = [];
			state.zapEvents = [];
			state.labelEntries = [];
			state.labelEvents = [];
			state.profiles = {};
			state.missingProfilePubkeys = [];
			state.zapperProfiles = new SvelteMap();
			state.commentsLoading = false;
			state.commentsSyncing = false;
			state.zapsLoading = false;
			state.labelsLoading = false;
			state.profilesLoading = false;
			return;
		}

		const root = /** @type {{ kind: number, pubkey: string, identifier: string, mainEventIds?: string[] }} */ (
			untrack(() => getRoot())
		);

		const hasLocalSnapshot = untrack(
			() => state.comments.length > 0 || state.zaps.length > 0 || state.labelEntries.length > 0
		);
		state.commentsLoading = !hasLocalSnapshot;
		state.zapsLoading = !hasLocalSnapshot;
		state.labelsLoading = !hasLocalSnapshot;
		state.profilesLoading = untrack(() => Object.keys(state.profiles).length === 0);

		const canHydrate = options.hydrateEnabled ? options.hydrateEnabled() : isOnline();
		let syncTimeout = null;
		function stopSyncing() {
			state.commentsSyncing = false;
			if (syncTimeout) clearTimeout(syncTimeout);
			syncTimeout = null;
		}
		const shouldHydrate = options.hydrate !== false && canHydrate;
		state.commentsSyncing = shouldHydrate;
		const socialSub = shouldHydrate
			? subscribeAddressableSocial(root, {
					enabled: canHydrate,
					limit: options.limit,
					onInitialEose: stopSyncing
				})
			: null;
		if (shouldHydrate) {
			syncTimeout = setTimeout(stopSyncing, options.timeout ?? 5500);
		}
		let eventZapSub = null;
		let eventZapKey = '';
		const hydratedProfiles = Object.create(null);

		const observable = liveQuery(() => queryAddressableSocial(root));
		const sub = observable.subscribe({
			next(value) {
				state.comments = value.comments;
				state.commentEvents = value.commentEvents;
				state.zaps = value.zaps;
				state.zapEvents = value.zapEvents;
				state.labelEntries = value.labelEntries;
				state.labelEvents = value.labelEvents;
				state.profiles = value.profiles;
				state.missingProfilePubkeys = value.missingProfilePubkeys ?? [];
				state.zapperProfiles = value.zapperProfiles;
				state.commentsLoading = false;
				state.zapsLoading = false;
				state.labelsLoading = false;
				state.profilesLoading = false;
				state.commentsError = '';

				if (shouldHydrate) {
					const targetIds = value.eventZapTargetIds ?? [];
					const nextEventZapKey = targetIds.slice().sort().join(',');
					if (nextEventZapKey !== eventZapKey) {
						eventZapSub?.close();
						eventZapKey = nextEventZapKey;
						eventZapSub = targetIds.length
							? subscribeEventZaps(targetIds, { limit: options.limit })
							: null;
					}

					const missing = (value.missingProfilePubkeys ?? []).filter(
						(pubkey) => !hydratedProfiles[pubkey]
					);
					if (missing.length > 0) {
						for (const pubkey of missing) hydratedProfiles[pubkey] = true;
						hydrateFilters(
							PROFILE_FETCH_RELAYS,
							{ kinds: [EVENT_KINDS.PROFILE], authors: missing, limit: missing.length * 2 },
							{ timeout: options.timeout ?? 5000, feature: 'purpleweb-profiles' }
						).catch(() => {});
					}
				}
			},
			error(err) {
				state.commentsLoading = false;
				state.commentsSyncing = false;
				state.zapsLoading = false;
				state.labelsLoading = false;
				state.profilesLoading = false;
				state.commentsError = err instanceof Error ? err.message : 'Failed to read social data';
			}
		});

		return () => {
			stopSyncing();
			eventZapSub?.close();
			sub.unsubscribe();
			socialSub?.close();
		};
	});

	return state;
}

/**
 * App social query. Consumers describe the app; purpleweb handles local reads,
 * online/offline hydration, subscriptions, and syncing state.
 *
 * @param {() => null | { pubkey?: string, dTag?: string, id?: string }} getApp
 * @param {{ hydrate?: boolean, hydrateEnabled?: () => boolean, enabled?: () => boolean, limit?: number, timeout?: number }} [options]
 */
export function createAppSocialQuery(getApp, options = {}) {
	return createAddressableSocialQuery(() => {
		const app = getApp?.();
		return app?.pubkey && app?.dTag
			? {
					kind: EVENT_KINDS.APP,
					pubkey: app.pubkey,
					identifier: app.dTag,
					mainEventIds: [app.id].filter(Boolean)
				}
			: null;
	}, options);
}

/**
 * Stack social query. Consumers describe the stack; purpleweb handles local reads,
 * online/offline hydration, subscriptions, and syncing state.
 *
 * @param {() => null | { pubkey?: string, dTag?: string, id?: string }} getStack
 * @param {{ hydrate?: boolean, hydrateEnabled?: () => boolean, enabled?: () => boolean, limit?: number, timeout?: number }} [options]
 */
export function createStackSocialQuery(getStack, options = {}) {
	return createAddressableSocialQuery(() => {
		const stack = getStack?.();
		return stack?.pubkey && stack?.dTag
			? {
					kind: EVENT_KINDS.APP_STACK,
					pubkey: stack.pubkey,
					identifier: stack.dTag,
					mainEventIds: [stack.id].filter(Boolean)
				}
			: null;
	}, options);
}
