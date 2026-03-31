/**
 * Stacks Store — liveQuery + Relay-backed pagination
 *
 * Architecture: Dexie liveQuery is the single client-side source of truth.
 * All queries use queryEvents() with NIP-01 filters — the universal query DSL.
 *
 * This store provides:
 *   - createStacksQuery() → liveQuery observable for stacks with resolved apps
 *   - Pagination state (cursor, hasMore, loadingMore)
 *   - Actions that write to Dexie (liveQuery updates UI automatically)
 */
import { liveQuery } from 'dexie';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { putEvents, queryEvents } from '$lib/nostr/dexie';
import { parseApp, parseAppStack } from '$lib/nostr/models';
import { fetchFromRelays } from '$lib/nostr/service';
import { EVENT_KINDS, PLATFORM_FILTER, ZAPSTORE_RELAY, SAVED_APPS_STACK_D_TAG } from '$lib/config';
import { ZAPSTORE_PUBKEY } from '$lib/services/profile-search';
import { STACKS_PAGE_SIZE } from '$lib/constants';

const platformTag = PLATFORM_FILTER['#f']?.[0];

// ============================================================================
// Reactive app-icon fill — deduped, self-healing
// ============================================================================

/**
 * Keys (pubkey:identifier) that have already been dispatched to the relay.
 * Prevents duplicate fetches across multiple liveQuery re-runs.
 * Module-scoped so it persists for the lifetime of the page session.
 */
const fetchedRefs = new Set();

/**
 * Fire-and-forget: fetch the given app refs from relay.
 * fetchFromRelays already writes to Dexie internally, so liveQuery re-fires
 * automatically once events arrive — no manual putEvents needed here.
 *
 * @param {Array<{pubkey: string, identifier: string}>} refs
 */
async function fetchMissingApps(refs) {
	if (typeof window === 'undefined' || !navigator.onLine) return;
	const events = await fetchFromRelays(
		[ZAPSTORE_RELAY],
		{
			kinds: [EVENT_KINDS.APP],
			authors: [...new Set(refs.map((r) => r.pubkey))],
			'#d': [...new Set(refs.map((r) => r.identifier))],
			...PLATFORM_FILTER,
			limit: refs.length + 5
		},
		{ feature: 'stack-preview-fill' }
	);
	return events;
}

// ============================================================================
// Reactive State (pagination/UI only — data comes from liveQuery)
// ============================================================================

let cursor = $state(null);
let hasMore = $state(true);
let loadingMore = $state(false);

// ============================================================================
// Public Reactive Getters
// ============================================================================

export function getStacksHasMore() {
	return hasMore;
}
export function isStacksLoadingMore() {
	return loadingMore;
}

// ============================================================================
// liveQuery — Reactive data from Dexie via NIP-01 filters
// ============================================================================

/**
 * Returns a Dexie liveQuery observable for stacks with their resolved apps.
 * Each entry is { stack: ParsedStack, apps: ParsedApp[] }.
 * Subscribe in a component $effect for reactive updates.
 *
 * Uses two sequential NIP-01 queries:
 *   1. Stacks (kind 30267) with platform filter
 *   2. Apps (kind 32267) matching stack references
 */
export function createStacksQuery() {
	return liveQuery(async () => {
		// Query 1: stacks (NIP-01 filter)
		const stackFilter = { kinds: [EVENT_KINDS.APP_STACK] };
		if (platformTag) stackFilter['#f'] = [platformTag];
		const stackEvents = await queryEvents(stackFilter);

		if (stackEvents.length === 0) return [];

		// Parse stacks and keep only the latest event per (pubkey, dTag); exclude private Saved Apps stack
		const parsed = stackEvents.map(parseAppStack);
		const stacksByKey = new SvelteMap();
		for (const stack of parsed) {
			if (!stack?.pubkey || !stack?.dTag || stack.dTag === SAVED_APPS_STACK_D_TAG || !!stack.event?.content) continue;
			const key = `${stack.pubkey}:${stack.dTag}`;
			const existing = stacksByKey.get(key);
			if (!existing || (stack.createdAt != null && stack.createdAt > (existing.createdAt ?? 0))) {
				stacksByKey.set(key, stack);
			}
		}
		// Zapstore community stacks (owned by ZAPSTORE_PUBKEY) always appear first
		const stacks = [...stacksByKey.values()].sort((a, b) => {
			const aIsZapstore = a.pubkey === ZAPSTORE_PUBKEY ? 0 : 1;
			const bIsZapstore = b.pubkey === ZAPSTORE_PUBKEY ? 0 : 1;
			if (aIsZapstore !== bIsZapstore) return aIsZapstore - bIsZapstore;
			return (b.createdAt ?? 0) - (a.createdAt ?? 0);
		});
		const allIdentifiers = new SvelteSet();

		for (const stack of stacks) {
			if (!stack?.appRefs) continue;
			const previewRefs = stack.appRefs
				.filter((r) => r.kind === EVENT_KINDS.APP && r.identifier)
				.slice(0, 4);
			for (const ref of previewRefs) {
				allIdentifiers.add(ref.identifier);
			}
		}

		// Query 2: apps matching stack references (NIP-01 filter with #d tag)
		let appsByKey = new SvelteMap();
		if (allIdentifiers.size > 0) {
			const appFilter = { kinds: [EVENT_KINDS.APP], '#d': [...allIdentifiers] };
			if (platformTag) appFilter['#f'] = [platformTag];
			const appEvents = await queryEvents(appFilter);

			// Index apps by (pubkey:dTag)
			for (const app of appEvents) {
				const dTag = app.tags?.find((t) => t[0] === 'd')?.[1];
				if (!dTag) continue;
				const key = `${app.pubkey}:${dTag}`;
				const existing = appsByKey.get(key);
				if (!existing || app.created_at > existing.created_at) {
					appsByKey.set(key, app);
				}
			}
		}

		// Resolve each stack's apps (preview: first 4 only).
		// Collect any refs that didn't resolve so we can backfill them from relay.
		const unresolvedRefs = [];
		const result = stacks.map((stack) => {
			const apps = [];
			if (stack.appRefs) {
				const previewRefs = stack.appRefs
					.filter((r) => r.kind === EVENT_KINDS.APP)
					.slice(0, 4);
				for (const ref of previewRefs) {
					const key = `${ref.pubkey}:${ref.identifier}`;
					const appEvent = appsByKey.get(key);
					if (appEvent) {
						apps.push(parseApp(appEvent));
					} else if (!fetchedRefs.has(key)) {
						// Not in Dexie and not yet fetched — queue for backfill
						fetchedRefs.add(key);
						unresolvedRefs.push(ref);
					}
				}
			}
			return { stack, apps };
		});

		// Backfill unresolved refs in background; fetchFromRelays writes to Dexie
		// which re-triggers this liveQuery automatically.
		if (unresolvedRefs.length > 0) {
			fetchMissingApps(unresolvedRefs).catch(() => {});
		}

		// Exclude stacks with no resolved apps (stacks whose apps aren't in Dexie
		// yet are kept if they have unresolved refs pending a backfill fetch).
		return result.filter(({ stack, apps }) => {
			if (apps.length > 0) return true;
			// Keep if there are still pending backfill refs for this stack
			const previewRefs = (stack.appRefs ?? [])
				.filter((r) => r.kind === EVENT_KINDS.APP)
				.slice(0, 4);
			return previewRefs.some((r) => fetchedRefs.has(`${r.pubkey}:${r.identifier}`));
		});
	});
}

// ============================================================================
// Actions — write to Dexie, liveQuery handles the rest
// ============================================================================

/**
 * Batch-fetch missing preview app icons for a set of stack events.
 * Collects all unique preview refs (first 4 per stack), checks Dexie in one
 * query, then fetches any still-missing ones in a single relay request.
 * No N+1 queries.
 *
 * @param {object[]} stackEvents - raw kind 30267 events
 * @param {string[]} relayUrls
 */
async function fillMissingPreviewApps(stackEvents, relayUrls) {
	// Collect all unique preview refs across all stacks
	const allRefs = new Map(); // key → ref
	for (const ev of stackEvents) {
		if (ev.kind !== EVENT_KINDS.APP_STACK) continue;
		const stack = parseAppStack(ev);
		if (!stack?.appRefs) continue;
		const previewRefs = stack.appRefs
			.filter((r) => r.kind === EVENT_KINDS.APP && r.pubkey && r.identifier)
			.slice(0, 4);
		for (const ref of previewRefs) {
			const key = `${ref.pubkey}:${ref.identifier}`;
			if (!allRefs.has(key)) allRefs.set(key, ref);
		}
	}
	if (allRefs.size === 0) return;

	// Single Dexie batch check — must use same platform filter as createStacksQuery so we
	// don't skip the relay fetch for refs that exist in Dexie without the platform tag.
	const allIdentifiers = [...new Set([...allRefs.values()].map((r) => r.identifier))];
	const existing = await queryEvents({
		kinds: [EVENT_KINDS.APP],
		'#d': allIdentifiers,
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: allRefs.size * 2 + 20
	});
	const existingKeys = new Set(
		existing.map((e) => {
			const dTag = e.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
			return `${e.pubkey}:${dTag}`;
		})
	);

	// Only fetch refs that haven't already been scheduled by the reactive fill
	const missing = [...allRefs.values()].filter(
		(r) => !existingKeys.has(`${r.pubkey}:${r.identifier}`) && !fetchedRefs.has(`${r.pubkey}:${r.identifier}`)
	);
	if (missing.length === 0) return;

	// Mark as fetched before dispatching so reactive fill doesn't double-fetch
	for (const r of missing) fetchedRefs.add(`${r.pubkey}:${r.identifier}`);

	await fetchMissingApps(missing).catch(() => {});
}

/**
 * Seed events into Dexie and initialize pagination cursor.
 * Called on mount with SSR-provided seed events.
 */
export function seedStackEvents(events) {
	if (events && events.length > 0) {
		// Exclude private Saved Apps stack from seed (don't persist for public listings)
		const publicEvents = events.filter(
			(e) =>
				e.kind !== EVENT_KINDS.APP_STACK ||
				(e.tags?.find((t) => t[0] === 'd')?.[1] !== SAVED_APPS_STACK_D_TAG && !e.content)
		);
		// Initialize cursor from oldest seeded stack (for relay-based load-more)
		if (cursor === null) {
			const stackEvents = publicEvents.filter((e) => e.kind === EVENT_KINDS.APP_STACK);
			if (stackEvents.length > 0) {
				const sorted = [...stackEvents].sort((a, b) => b.created_at - a.created_at);
				const oldest = sorted[sorted.length - 1];
				cursor = oldest.created_at - 1;
				hasMore = stackEvents.length >= STACKS_PAGE_SIZE;
			}
		}

		// Write seed events first, then fill missing app icons so the Dexie check
		// is accurate (seed app events are already present before the check runs).
		putEvents(publicEvents)
			.then(() => fillMissingPreviewApps(publicEvents, [ZAPSTORE_RELAY]))
			.catch((err) => console.error('[StacksStore] Seed persist failed:', err));
	}
	return Promise.resolve();
}

/**
 * Load more stacks by querying relays for older stacks.
 * The fetched events are written to Dexie; liveQuery picks them up automatically.
 *
 * @param {function} fetchFromRelays - relay fetch function from service.js
 * @param {string[]} relayUrls - relay URLs to query
 */
export async function loadMoreStacks(fetchFromRelays, relayUrls) {
	if (loadingMore || !hasMore) return;
	if (typeof window === 'undefined' || !navigator.onLine) return;

	loadingMore = true;

	// The relay mixes public and private stacks and caps at 100 per request.
	// We paginate in 100-event batches, advancing the cursor on ALL fetched events
	// (not just public ones), until we have enough public events or the relay is exhausted.
	const RELAY_BATCH = 100;
	const allPublicEvents = [];

	try {
		let localCursor = cursor;

		while (allPublicEvents.length < STACKS_PAGE_SIZE) {
			const filter = {
				kinds: [EVENT_KINDS.APP_STACK],
				limit: RELAY_BATCH
			};
			if (localCursor != null) filter.until = localCursor;
			if (platformTag) filter['#f'] = [platformTag];

			const events = await fetchFromRelays(relayUrls, filter, { feature: 'load-more-stacks' });
			if (events.length === 0) {
				hasMore = false;
				break;
			}

			const publicBatch = events.filter(
				(e) => e.tags?.find((t) => t[0] === 'd')?.[1] !== SAVED_APPS_STACK_D_TAG && !e.content
			);
			allPublicEvents.push(...publicBatch);

			// Advance cursor based on ALL events so we don't re-fetch the same page
			localCursor = Math.min(...events.map((e) => e.created_at)) - 1;

			if (events.length < RELAY_BATCH) {
				// Relay has no more events
				hasMore = false;
				break;
			}
		}

		if (allPublicEvents.length > 0) {
			cursor = localCursor;
			if (hasMore) hasMore = true; // relay may still have more
			await putEvents(allPublicEvents).catch((err) =>
				console.error('[StacksStore] Load more persist failed:', err)
			);
			fillMissingPreviewApps(allPublicEvents, relayUrls).catch(() => {});
		}
	} catch (err) {
		console.error('[StacksStore] Load more failed:', err);
	} finally {
		loadingMore = false;
	}
}
