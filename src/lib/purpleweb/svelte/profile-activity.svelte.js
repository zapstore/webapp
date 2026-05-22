import { browser } from '$app/environment';
import { liveQuery } from 'dexie';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { EVENT_KINDS, ZAPSTORE_RELAY, PROFILE_FETCH_RELAYS } from '$lib/config.js';
import { isOnline } from '$lib/stores/online.svelte.js';
import { queryEvents } from '../storage/dexie.js';
import { queryProfilesForPubkeys } from '../storage/social.js';
import { hydrateFilters } from '../sync/hydrate.js';
import {
	activityRootKeyMetaFromComment,
	batchResolveAddrRootsFromDexie,
	batchResolveForumRootsByIdFromDexie,
	buildActivityRootLookupMaps,
	collectMissingActivityRootRefs,
	computeActivityRootDeletedByKey,
	isAddressableActivityATag,
	parseActivityNip33ATag,
	relayFetchAddrRootEventsByATags,
	relayFetchForumRootEventsByIds
} from '../core/activity-roots.js';

/** First paint — keep DOM small (CommentCard is heavy). */
const INITIAL_VISIBLE = 15;
const VISIBLE_STEP = 15;
const MAX_VISIBLE = 80;
const DEXIE_QUERY_LIMIT = 150;
const RELAY_PAGE = 50;

/** @param {import('nostr-tools').NostrEvent[]} events */
function sortCommentsNewestFirst(events) {
	return [...events].sort((a, b) => b.created_at - a.created_at);
}

/**
 * Profile Activity — one-shot Dexie read + batched enrichment, minimal reactivity.
 *
 * @param {() => string | null | undefined} getPubkey
 */
export function createProfileActivityQuery(getPubkey) {
	const state = $state({
		comments: /** @type {import('nostr-tools').NostrEvent[]} */ ([]),
		loading: true,
		loadingMore: false,
		/** True while a background relay fetch is in flight (Dexie already shown). */
		syncing: false,
		/** Cards we promised to show; skeleton stays until displayed count reaches this. */
		pendingRevealTarget: 0,
		error: '',
		visibleLimit: INITIAL_VISIBLE,
		relayExhausted: false,
		enrichmentDone: false,
		rootEventByKey: /** @type {Map<string, import('nostr-tools').NostrEvent>} */ (new SvelteMap()),
		rootInfoByATag: /** @type {Map<string, { icon?: string|null, name: string, identifier: string, isStack: boolean, href: string|null }>} */ (
			new SvelteMap()
		),
		rootDeletedByKey: /** @type {Map<string, 'forum' | 'app' | 'stack'>} */ (new SvelteMap()),
		parentCommentMap: /** @type {Map<string, import('nostr-tools').NostrEvent>} */ (new SvelteMap()),
		mentionProfiles: /** @type {Map<string, { name?: string, displayName?: string, picture?: string }>} */ (
			new SvelteMap()
		)
	});

	let rootsReadyForDeletedTimer = false;
	/** @type {Map<string, number>} */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- wait bookkeeping
	const rootWaitSince = new Map();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- dedupe
	const addrRelayAttempted = new Set();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- dedupe
	const forumRelayAttempted = new Set();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- dedupe
	const parentFetchAttempted = new Set();
	let enrichFlight = /** @type {Promise<void> | null} */ (null);
	let relayRootsFlight = /** @type {Promise<void> | null} */ (null);

	const displayedComments = $derived(state.comments.slice(0, state.visibleLimit));
	const displayedCount = $derived(
		Math.min(state.visibleLimit, state.comments.length)
	);
	const showLoadMoreSkeleton = $derived(
		state.loadingMore || state.pendingRevealTarget > 0
	);
	const likelyHasMore = $derived(
		state.visibleLimit < MAX_VISIBLE &&
			(state.visibleLimit < state.comments.length || !state.relayExhausted)
	);

	/** Hide load-more skeleton only after new rows have had a chance to paint. */
	$effect(() => {
		const target = state.pendingRevealTarget;
		if (target === 0 || displayedCount < target) return;

		let innerId = 0;
		const outerId = requestAnimationFrame(() => {
			innerId = requestAnimationFrame(() => {
				if (state.pendingRevealTarget === target && displayedCount >= target) {
					state.pendingRevealTarget = 0;
				}
			});
		});

		return () => {
			cancelAnimationFrame(outerId);
			if (innerId) cancelAnimationFrame(innerId);
		};
	});

	function resetForPubkey() {
		state.comments = [];
		state.loading = true;
		state.loadingMore = false;
		state.syncing = false;
		state.pendingRevealTarget = 0;
		state.error = '';
		state.visibleLimit = INITIAL_VISIBLE;
		state.relayExhausted = false;
		state.enrichmentDone = false;
		state.rootEventByKey = new SvelteMap();
		state.rootInfoByATag = new SvelteMap();
		state.rootDeletedByKey = new SvelteMap();
		state.parentCommentMap = new SvelteMap();
		rootsReadyForDeletedTimer = false;
		rootWaitSince.clear();
		addrRelayAttempted.clear();
		forumRelayAttempted.clear();
		parentFetchAttempted.clear();
		enrichFlight = null;
		relayRootsFlight = null;
	}

	async function readCommentsFromDexie() {
		const pubkey = getPubkey();
		if (!pubkey) return [];
		return sortCommentsNewestFirst(
			await queryEvents({
				kinds: [EVENT_KINDS.COMMENT],
				authors: [pubkey],
				limit: DEXIE_QUERY_LIMIT
			})
		);
	}

	/** Merge into existing SvelteMaps — avoid replacing maps (full-feed re-render). */
	function applyRootMaps(
		/** @type {Map<string, import('nostr-tools').NostrEvent>} */ addrRootByATag,
		/** @type {Map<string, import('nostr-tools').NostrEvent>} */ forumRootById,
		/** @type {import('nostr-tools').NostrEvent[]} */ comments
	) {
		const built = buildActivityRootLookupMaps(addrRootByATag, forumRootById);
		for (const [k, v] of built.rootEventByKey) state.rootEventByKey.set(k, v);
		for (const [k, v] of built.rootInfoByATag) state.rootInfoByATag.set(k, v);
		state.rootDeletedByKey = computeActivityRootDeletedByKey({
			comments,
			rootEventByKey: state.rootEventByKey,
			addrRootByATag,
			waitSince: rootWaitSince,
			readyForDeletedTimer: rootsReadyForDeletedTimer
		});
	}

	async function enrichComments(/** @type {import('nostr-tools').NostrEvent[]} */ evts) {
		if (!browser || evts.length === 0) return;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- batch workspace
		const addrRootByATag = new Map();
		for (const [k, ev] of state.rootEventByKey) {
			if (isAddressableActivityATag(k)) addrRootByATag.set(k, ev);
		}
		await batchResolveAddrRootsFromDexie(evts, addrRootByATag);
		const forumRootById = await batchResolveForumRootsByIdFromDexie(evts);
		applyRootMaps(addrRootByATag, forumRootById, evts);

		/** @type {{ commentId: string, parentId: string }[]} */
		const parentPairs = [];
		for (const ev of evts) {
			const upperRef = ev.tags?.find((t) => (t[0] === 'E' || t[0] === 'A') && t[1])?.[1];
			const lowerRef = ev.tags?.find((t) => t[0] === 'e' && t[1])?.[1];
			if (!lowerRef || !ev.id) continue;
			if (upperRef && lowerRef === upperRef) continue;
			if (state.parentCommentMap.has(ev.id)) continue;
			parentPairs.push({ commentId: ev.id, parentId: lowerRef });
		}
		const parentIds = [
			...new SvelteSet(
				parentPairs
					.map((p) => p.parentId)
					.filter((id) => !parentFetchAttempted.has(id.toLowerCase()))
			)
		];
		for (const id of parentIds) parentFetchAttempted.add(id.toLowerCase());

		if (parentIds.length > 0) {
			let found = await queryEvents({ ids: parentIds, limit: parentIds.length });
			const foundIds = new SvelteSet(found.map((e) => e.id.toLowerCase()));
			const missing = parentIds.filter((id) => !foundIds.has(id.toLowerCase()));
			if (missing.length > 0 && isOnline()) {
				await hydrateFilters(
					[ZAPSTORE_RELAY],
					{ ids: missing, limit: missing.length },
					{ feature: 'profile-activity-parents', timeout: 5000 }
				);
				found = [
					...found,
					...(await queryEvents({ ids: missing, limit: missing.length }))
				];
			}
			const byId = new SvelteMap();
			for (const e of found) {
				if (!e?.id) continue;
				byId.set(e.id, e);
				byId.set(e.id.toLowerCase(), e);
			}
			for (const { commentId, parentId } of parentPairs) {
				const parent = byId.get(parentId) ?? byId.get(parentId.toLowerCase());
				if (parent) state.parentCommentMap.set(commentId, parent);
			}
		}
	}

	const profilePubkeys = $derived.by(() => {
		const pks = new SvelteSet();
		for (const ev of state.comments) {
			if (ev.pubkey) pks.add(ev.pubkey.toLowerCase());
			for (const tag of ev.tags ?? []) {
				if (tag[0] === 'p' && tag[1]) pks.add(String(tag[1]).toLowerCase());
			}
		}
		for (const parent of state.parentCommentMap.values()) {
			if (parent.pubkey) pks.add(parent.pubkey.toLowerCase());
		}
		return [...pks];
	});

	$effect(() => {
		if (!browser) return;
		const pubkeys = profilePubkeys;
		if (pubkeys.length === 0) {
			state.mentionProfiles = new SvelteMap();
			return;
		}
		const hydrated = Object.create(null);
		const observable = liveQuery(() => queryProfilesForPubkeys(pubkeys));
		const sub = observable.subscribe({
			next({ profiles, missingProfilePubkeys }) {
				const m = new SvelteMap();
				for (const [pk, profile] of Object.entries(profiles ?? {})) {
					m.set(pk, profile);
				}
				state.mentionProfiles = m;
				if (!isOnline()) return;
				const missing = (missingProfilePubkeys ?? []).filter((pk) => !hydrated[pk]);
				if (missing.length === 0) return;
				for (const pk of missing) hydrated[pk] = true;
				hydrateFilters(
					PROFILE_FETCH_RELAYS,
					{ kinds: [EVENT_KINDS.PROFILE], authors: missing, limit: missing.length * 2 },
					{ timeout: 4000, feature: 'profile-activity-profiles' }
				).catch(() => {});
			}
		});
		return () => sub.unsubscribe();
	});

	async function fetchMissingRootsOnce(/** @type {import('nostr-tools').NostrEvent[]} */ evts) {
		if (!browser || !isOnline() || evts.length === 0 || relayRootsFlight) return relayRootsFlight;
		relayRootsFlight = (async () => {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- snapshot
			const addrRootByATag = new Map();
			for (const [k, ev] of state.rootEventByKey) {
				if (isAddressableActivityATag(k)) addrRootByATag.set(k, ev);
			}
			const { missingAddr, missingForumIds } = collectMissingActivityRootRefs(
				evts,
				addrRootByATag,
				state.rootEventByKey
			);
			const addrToFetch = missingAddr.filter((a) => !addrRelayAttempted.has(a));
			const forumToFetch = missingForumIds.filter((id) => !forumRelayAttempted.has(id.toLowerCase()));
			for (const a of addrToFetch) addrRelayAttempted.add(a);
			for (const id of forumToFetch) forumRelayAttempted.add(id.toLowerCase());
			const jobs = [];
			if (addrToFetch.length > 0) {
				jobs.push(relayFetchAddrRootEventsByATags(addrToFetch).catch(() => {}));
			}
			if (forumToFetch.length > 0) {
				jobs.push(relayFetchForumRootEventsByIds(forumToFetch).catch(() => {}));
			}
			if (jobs.length > 0) {
				await Promise.all(jobs);
				await enrichComments(evts);
			}
		})().finally(() => {
			relayRootsFlight = null;
		});
		return relayRootsFlight;
	}

	function runEnrichmentOnce() {
		if (enrichFlight || state.enrichmentDone || state.comments.length === 0) return enrichFlight;
		enrichFlight = (async () => {
			await enrichComments(state.comments);
			state.enrichmentDone = true;
			void fetchMissingRootsOnce(state.comments);
		})().finally(() => {
			enrichFlight = null;
		});
		return enrichFlight;
	}

	async function loadInitial() {
		const pubkey = getPubkey();
		if (!browser || !pubkey) {
			state.loading = false;
			return;
		}
		state.error = '';
		try {
			const local = await readCommentsFromDexie();
			if (local.length > 0) {
				state.comments = local;
				state.loading = false;
				runEnrichmentOnce();
			}
			if (isOnline()) {
				state.syncing = true;
				const fetched = await hydrateFilters(
					[ZAPSTORE_RELAY],
					{ kinds: [EVENT_KINDS.COMMENT], authors: [pubkey], limit: RELAY_PAGE },
					{ timeout: 7000, feature: 'profile-activity-seed' }
				);
				if (fetched.length < RELAY_PAGE) state.relayExhausted = true;
				rootsReadyForDeletedTimer = true;
			}
			const fresh = await readCommentsFromDexie();
			if (fresh.length > 0) {
				state.comments = fresh;
				state.enrichmentDone = false;
				runEnrichmentOnce();
			}
		} catch (e) {
			console.error('[profile-activity] load failed', e);
			state.error = 'Could not load activity.';
		} finally {
			state.syncing = false;
			state.loading = false;
		}
	}

	async function fetchOlderFromRelay() {
		const pubkey = getPubkey();
		if (!browser || !pubkey || state.loadingMore || state.relayExhausted) return;
		const oldest = state.comments.at(-1);
		if (!oldest) return;

		state.loadingMore = true;
		try {
			await hydrateFilters(
				[ZAPSTORE_RELAY],
				{
					kinds: [EVENT_KINDS.COMMENT],
					authors: [pubkey],
					until: oldest.created_at - 1,
					limit: RELAY_PAGE
				},
				{ timeout: 7000, feature: 'profile-activity-more' }
			);
			const fresh = await readCommentsFromDexie();
			if (fresh.length <= state.comments.length) {
				state.relayExhausted = true;
				state.pendingRevealTarget = 0;
			} else {
				const prevLen = state.comments.length;
				state.comments = fresh;
				const added = fresh.slice(prevLen);
				if (added.length > 0) await enrichComments(added);
				state.visibleLimit = Math.min(
					MAX_VISIBLE,
					Math.max(state.visibleLimit, Math.min(state.pendingRevealTarget, fresh.length))
				);
				void fetchMissingRootsOnce(state.comments);
			}
		} catch (e) {
			console.error('[profile-activity] load-more failed', e);
		} finally {
			state.loadingMore = false;
		}
	}

	function loadMoreVisible() {
		const prevLimit = state.visibleLimit;
		const nextLimit = Math.min(MAX_VISIBLE, state.visibleLimit + VISIBLE_STEP);

		if (nextLimit === prevLimit) {
			if (prevLimit >= state.comments.length - 5 && !state.relayExhausted) {
				state.pendingRevealTarget = Math.max(
					state.pendingRevealTarget,
					Math.min(prevLimit + VISIBLE_STEP, MAX_VISIBLE)
				);
				void fetchOlderFromRelay();
			}
			return;
		}

		const prevShown = Math.min(prevLimit, state.comments.length);
		const nextShown = Math.min(nextLimit, state.comments.length);
		state.pendingRevealTarget = nextShown > prevShown ? nextShown : nextLimit;
		state.visibleLimit = nextLimit;

		if (state.visibleLimit >= state.comments.length - 5 && !state.relayExhausted) {
			state.pendingRevealTarget = Math.max(
				state.pendingRevealTarget,
				Math.min(state.visibleLimit + VISIBLE_STEP, MAX_VISIBLE)
			);
			void fetchOlderFromRelay();
		}
	}

	$effect(() => {
		const pubkey = getPubkey() ?? '';
		if (!browser) return;
		if (!pubkey) {
			resetForPubkey();
			state.loading = false;
			return;
		}
		resetForPubkey();
		void loadInitial();
		const armDeleted = setTimeout(() => {
			rootsReadyForDeletedTimer = true;
			if (state.comments.length === 0) return;
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- snapshot
			const addrRootByATag = new Map();
			for (const [k, ev] of state.rootEventByKey) {
				if (isAddressableActivityATag(k)) addrRootByATag.set(k, ev);
			}
			state.rootDeletedByKey = computeActivityRootDeletedByKey({
				comments: state.comments,
				rootEventByKey: state.rootEventByKey,
				addrRootByATag,
				waitSince: rootWaitSince,
				readyForDeletedTimer: true
			});
		}, 4000);
		return () => clearTimeout(armDeleted);
	});

	return {
		get comments() {
			return state.comments;
		},
		get displayedComments() {
			return displayedComments;
		},
		get loading() {
			return state.loading;
		},
		get loadingMore() {
			return state.loadingMore;
		},
		get syncing() {
			return state.syncing;
		},
		get showLoadMoreSkeleton() {
			return showLoadMoreSkeleton;
		},
		get error() {
			return state.error;
		},
		get likelyHasMore() {
			return likelyHasMore;
		},
		get rootEventByKey() {
			return state.rootEventByKey;
		},
		get rootInfoByATag() {
			return state.rootInfoByATag;
		},
		get rootDeletedByKey() {
			return state.rootDeletedByKey;
		},
		get parentCommentMap() {
			return state.parentCommentMap;
		},
		get mentionProfiles() {
			return state.mentionProfiles;
		},
		loadMoreVisible,
		/** @param {{ type: 'addr' | 'id', value: string } | null} ref */
		lookupRootEvent(ref) {
			if (!ref) return null;
			const direct = state.rootEventByKey.get(ref.value);
			if (direct) return direct;
			if (ref.type === 'addr') {
				const p = parseActivityNip33ATag(ref.value);
				if (p) {
					const canonical = `${p.kind}:${p.pubkey}:${p.dTag}`;
					return state.rootEventByKey.get(canonical) ?? null;
				}
			}
			return state.rootEventByKey.get(ref.value.toLowerCase()) ?? null;
		},
		/** @param {string} aTag */
		lookupRootInfo(aTag) {
			const direct = state.rootInfoByATag.get(aTag);
			if (direct) return direct;
			const p = parseActivityNip33ATag(aTag);
			return p ? (state.rootInfoByATag.get(`${p.kind}:${p.pubkey}:${p.dTag}`) ?? null) : null;
		},
		activityRootKeyMetaFromComment,
		isAddressableActivityATag
	};
}
