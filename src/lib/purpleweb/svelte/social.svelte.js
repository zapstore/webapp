import { browser } from '$app/environment';
import { liveQuery } from 'dexie';
import { untrack } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { queryAddressableSocial } from '../storage/social.js';
import { subscribeAddressableSocial } from '../sync/social.js';

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
		zapperProfiles: new SvelteMap()
	});

	$effect(() => {
		const root = getRoot?.();
		const enabled = options.enabled ? options.enabled() : true;
		if (!browser || !enabled || !root?.kind || !root?.pubkey || !root?.identifier) {
			state.comments = [];
			state.commentEvents = [];
			state.zaps = [];
			state.zapEvents = [];
			state.labelEntries = [];
			state.labelEvents = [];
			state.profiles = {};
			state.zapperProfiles = new SvelteMap();
			state.commentsLoading = false;
			state.commentsSyncing = false;
			state.zapsLoading = false;
			state.labelsLoading = false;
			state.profilesLoading = false;
			return;
		}

		const key = `${root.kind}:${root.pubkey}:${root.identifier}:${(root.mainEventIds ?? []).join(',')}`;
		void key;

		const hasLocalSnapshot = untrack(
			() => state.comments.length > 0 || state.zaps.length > 0 || state.labelEntries.length > 0
		);
		state.commentsLoading = !hasLocalSnapshot;
		state.zapsLoading = !hasLocalSnapshot;
		state.labelsLoading = !hasLocalSnapshot;
		state.profilesLoading = untrack(() => Object.keys(state.profiles).length === 0);

		const canHydrate = options.hydrateEnabled ? options.hydrateEnabled() : true;
		let syncTimeout = null;
		function stopSyncing() {
			state.commentsSyncing = false;
			if (syncTimeout) clearTimeout(syncTimeout);
			syncTimeout = null;
		}
		state.commentsSyncing = options.hydrate !== false && canHydrate;
		const socialSub = options.hydrate !== false && canHydrate
			? subscribeAddressableSocial(root, {
					enabled: canHydrate,
					limit: options.limit,
					onInitialEose: stopSyncing
				})
			: null;
		if (state.commentsSyncing) {
			syncTimeout = setTimeout(stopSyncing, options.timeout ?? 5500);
		}

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
				state.zapperProfiles = value.zapperProfiles;
				state.commentsLoading = false;
				state.zapsLoading = false;
				state.labelsLoading = false;
				state.profilesLoading = false;
				state.commentsError = '';
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
			sub.unsubscribe();
			socialSub?.close();
		};
	});

	return state;
}
