/**
 * Server-side Nostr data facade
 *
 * All functions query the in-memory relay cache. Same export signatures
 * as before so +page.server.js and API endpoints work without changes.
 *
 * Server-only module — never import from client code.
 */
import {
	queryCache,
	fetchProfiles,
	warmUp,
	queryRelays
} from './relay-cache';
import {
	parseApp,
	parseRelease,
	parseAppStack,
	parseProfile
} from './models';
import { EVENT_KINDS, DEFAULT_CATALOG_RELAYS, PLATFORM_FILTER } from '$lib/config';

// ============================================================================
// Helpers
// ============================================================================

function getFirstTagValue(event, tagName) {
	const tag = event.tags?.find((t) => t[0] === tagName && typeof t[1] === 'string');
	return tag?.[1] ?? null;
}

function getReleaseIdentifier(event) {
	const iTag = getFirstTagValue(event, 'i');
	if (iTag) return iTag;
	const dTag = getFirstTagValue(event, 'd');
	if (!dTag) return null;
	const [identifier] = dTag.split('@');
	return identifier || null;
}

/**
 * Strip Symbol keys from a raw Nostr event so SvelteKit can serialize it.
 * nostr-tools SimplePool attaches internal Symbols that break JSON serialization.
 */
function sanitizeEvent(event) {
	const { id, pubkey, created_at, kind, tags, content, sig } = event;
	return { id, pubkey, created_at, kind, tags, content, sig };
}

function dedupeEventsById(events) {
	const seen = new Set();
	const result = [];
	for (const event of events) {
		if (seen.has(event.id)) continue;
		seen.add(event.id);
		result.push(sanitizeEvent(event));
	}
	return result;
}

// ============================================================================
// Public API (same signatures as before)
// ============================================================================

/**
 * Fetch apps ordered by release recency.
 * Queries the relay cache for recent releases, resolves to their apps.
 */
export async function fetchAppsByReleases(limit = 20, until) {
	await warmUp();

	const platformTag = PLATFORM_FILTER['#f']?.[0];

	// Step 1: Get releases
	const releaseFilter = { kinds: [EVENT_KINDS.RELEASE], limit };
	if (until !== undefined) releaseFilter.until = until;

	const releaseEvents = queryCache(releaseFilter);

	if (releaseEvents.length === 0) {
		return { apps: [], releases: [], nextCursor: null, seedEvents: [] };
	}

	// Step 2: Extract app references from releases
	const releaseRefs = releaseEvents.map((event) => ({
		release: event,
		identifier: getReleaseIdentifier(event)
	}));

	const identifiers = [
		...new Set(releaseRefs.map((ref) => ref.identifier).filter(Boolean))
	];

	// Step 3: Find matching apps in cache
	let appEvents = [];
	if (identifiers.length > 0) {
		const allApps = queryCache({
			kinds: [EVENT_KINDS.APP],
			...(platformTag ? { '#f': [platformTag] } : {})
		});
		// Filter to only apps matching our identifiers
		const idSet = new Set(identifiers);
		appEvents = allApps.filter((e) => {
			const dTag = getFirstTagValue(e, 'd');
			return dTag && idSet.has(dTag);
		});
	}

	// Latest replaceable app event for (pubkey, d) and for d fallback
	const latestByPubkeyAndD = new Map();
	const latestByDOnly = new Map();
	for (const appEvent of appEvents) {
		const dTag = getFirstTagValue(appEvent, 'd');
		if (!dTag) continue;
		const key = `${appEvent.pubkey}:${dTag}`;
		if (!latestByPubkeyAndD.has(key)) latestByPubkeyAndD.set(key, appEvent);
		if (!latestByDOnly.has(dTag)) latestByDOnly.set(dTag, appEvent);
	}

	const apps = [];
	const selectedAppEvents = [];
	const seenAppKeys = new Set();

	for (const { release, identifier } of releaseRefs) {
		if (!identifier) continue;
		const exactKey = `${release.pubkey}:${identifier}`;
		const appEvent =
			latestByPubkeyAndD.get(exactKey) ?? latestByDOnly.get(identifier);
		if (!appEvent) continue;
		const appKey = `${appEvent.pubkey}:${identifier}`;
		if (seenAppKeys.has(appKey)) continue;
		seenAppKeys.add(appKey);
		apps.push(parseApp(appEvent));
		selectedAppEvents.push(appEvent);
	}

	const releases = releaseEvents.map(parseRelease);
	const lastRelease = releaseEvents[releaseEvents.length - 1];
	const nextCursor =
		releaseEvents.length === limit && lastRelease
			? lastRelease.created_at - 1
			: null;
	const seedEvents = dedupeEventsById([...releaseEvents, ...selectedAppEvents]);

	return { apps, releases, nextCursor, seedEvents };
}

/**
 * Fetch a single app by pubkey and identifier.
 * Tries the in-memory cache first; on miss, queries upstream relays on demand.
 */
export async function fetchApp(pubkey, identifier) {
	await warmUp();

	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const filter = {
		kinds: [EVENT_KINDS.APP],
		authors: [pubkey],
		'#d': [identifier],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: 1
	};

	// Try cache first
	const cached = queryCache(filter);
	if (cached.length > 0) return parseApp(cached[0]);

	// Cache miss — fetch on-demand from upstream relays (auto-populates cache)
	const relayResults = await queryRelays(DEFAULT_CATALOG_RELAYS, filter);
	if (relayResults.length > 0) return parseApp(relayResults[0]);

	return null;
}

/**
 * Fetch latest release for an app.
 * Tries the in-memory cache first; on miss, queries upstream relays on demand.
 */
export async function fetchLatestReleaseForApp(pubkey, identifier) {
	await warmUp();

	const aTagValue = `${EVENT_KINDS.APP}:${pubkey}:${identifier}`;

	// Try cache by 'a' tag first (canonical)
	let results = queryCache({
		kinds: [EVENT_KINDS.RELEASE],
		'#a': [aTagValue],
		limit: 1
	});

	if (results.length === 0) {
		// Fallback: by author + 'i' tag in cache
		const allReleases = queryCache({
			kinds: [EVENT_KINDS.RELEASE],
			authors: [pubkey],
			limit: 100
		});
		results = allReleases.filter((e) => {
			const iTag = getFirstTagValue(e, 'i');
			if (iTag === identifier) return true;
			const dTag = getFirstTagValue(e, 'd');
			return dTag?.startsWith(`${identifier}@`);
		});
	}

	if (results.length > 0) return parseRelease(results[0]);

	// Cache miss — fetch on-demand from upstream relays (auto-populates cache)
	const relayResults = await queryRelays(DEFAULT_CATALOG_RELAYS, {
		kinds: [EVENT_KINDS.RELEASE],
		'#a': [aTagValue],
		limit: 1
	});
	if (relayResults.length > 0) return parseRelease(relayResults[0]);

	return null;
}

/**
 * Fetch releases for an app.
 * Tries the in-memory cache first; on miss, queries upstream relays on demand.
 */
export async function fetchReleasesForApp(pubkey, identifier, limit = 50) {
	await warmUp();

	const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
	const aTagValue = `${EVENT_KINDS.APP}:${pubkey}:${identifier}`;
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const filter = {
		kinds: [EVENT_KINDS.RELEASE],
		'#a': [aTagValue],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: safeLimit
	};

	// Try cache first
	const cached = queryCache(filter);
	if (cached.length > 0) return cached.map(parseRelease);

	// Cache miss — fetch on-demand from upstream relays (auto-populates cache)
	const relayResults = await queryRelays(DEFAULT_CATALOG_RELAYS, filter);
	return relayResults.map(parseRelease);
}

/**
 * Fetch stacks with resolved apps.
 */
export async function fetchStacks(limit = 20, until) {
	await warmUp();

	const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const filter = {
		kinds: [EVENT_KINDS.APP_STACK],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: safeLimit
	};
	if (until !== undefined) filter.until = until;

	const stackEvents = queryCache(filter);
	const stacks = stackEvents.map(parseAppStack);

	// Resolve apps for all stacks in a single batch query
	const appsByStackId = resolveMultipleStackAppsFromCache(stacks);
	const resolvedStacks = [];
	const selectedAppEvents = [];

	for (const stack of stacks) {
		const apps = appsByStackId.get(stack.id) ?? [];
		selectedAppEvents.push(
			...apps.map((a) => a.rawEvent).filter(Boolean)
		);
		resolvedStacks.push({ stack, apps });
	}

	const lastStack = stackEvents[stackEvents.length - 1];
	const nextCursor =
		stackEvents.length === safeLimit && lastStack
			? lastStack.created_at - 1
			: null;
	const seedEvents = dedupeEventsById([...stackEvents, ...selectedAppEvents]);

	return { stacks, resolvedStacks, nextCursor, seedEvents };
}

/**
 * Fetch a single stack with apps and creator profile.
 * Tries the in-memory cache first; on miss, queries upstream relays on demand.
 */
export async function fetchStack(pubkey, identifier) {
	await warmUp();

	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const filter = {
		kinds: [EVENT_KINDS.APP_STACK],
		authors: [pubkey],
		'#d': [identifier],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: 1
	};

	// Try cache first
	let results = queryCache(filter);

	// Cache miss — fetch on-demand from upstream relays
	if (results.length === 0) {
		results = await queryRelays([...DEFAULT_CATALOG_RELAYS], filter);
	}

	if (results.length === 0) return null;

	const stackEvent = results[0];
	const stack = parseAppStack(stackEvent);
	const apps = await resolveStackApps(stack);

	// Fetch creator profile
	const profileMap = await fetchProfiles([pubkey]);
	const profileEvent = profileMap.get(pubkey);
	const creator = profileEvent ? parseProfile(profileEvent) : null;

	const seedEvents = dedupeEventsById([
		stackEvent,
		...apps.map((a) => a.rawEvent).filter(Boolean),
		...(profileEvent ? [profileEvent] : [])
	]);

	return { stack, apps, creator, seedEvents };
}

/**
 * Fetch apps by author.
 * Tries the in-memory cache first; on miss, queries upstream relays on demand.
 */
export async function fetchAppsByAuthor(pubkey, limit = 50) {
	await warmUp();

	const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const filter = {
		kinds: [EVENT_KINDS.APP],
		authors: [pubkey],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: safeLimit
	};

	// Try cache first
	const cached = queryCache(filter);
	if (cached.length > 0) return cached.map(parseApp);

	// Cache miss — fetch on-demand from upstream relays (auto-populates cache)
	const relayResults = await queryRelays(DEFAULT_CATALOG_RELAYS, filter);
	return relayResults.map(parseApp);
}

/**
 * Fetch stacks by author.
 * Tries the in-memory cache first; on miss, queries upstream relays on demand.
 */
export async function fetchStacksByAuthor(pubkey, limit = 50) {
	await warmUp();

	const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const filter = {
		kinds: [EVENT_KINDS.APP_STACK],
		authors: [pubkey],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: safeLimit
	};

	// Try cache first, then relays
	let stackEvents = queryCache(filter);
	if (stackEvents.length === 0) {
		stackEvents = await queryRelays([...DEFAULT_CATALOG_RELAYS], filter);
	}

	const stacks = stackEvents.map(parseAppStack);

	const appsByStackId = resolveMultipleStackAppsFromCache(stacks);
	const resolvedStacks = [];
	for (const stack of stacks) {
		const apps = appsByStackId.get(stack.id) ?? [];
		resolvedStacks.push({ stack, apps });
	}

	return { stacks, resolvedStacks };
}

/**
 * Fetch profiles (server-side).
 * Used by /api/profiles endpoint.
 */
export async function fetchProfilesServer(pubkeys, options = {}) {
	await warmUp();
	return fetchProfiles(pubkeys, options);
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Resolve apps referenced by multiple stacks (cache only, single batch query).
 * Used by listing functions where speed matters — no relay queries.
 * Returns a Map from stack event id to parsed app array.
 */
function resolveMultipleStackAppsFromCache(stacks) {
	const result = new Map();
	if (!stacks || stacks.length === 0) return result;

	const platformTag = PLATFORM_FILTER['#f']?.[0];

	// Collect all unique app refs across all stacks
	const allRefKeys = new Set();
	const allAuthors = new Set();
	const allIdentifiers = new Set();

	for (const stack of stacks) {
		if (!stack?.appRefs) continue;
		for (const ref of stack.appRefs) {
			if (ref.kind !== EVENT_KINDS.APP) continue;
			allRefKeys.add(`${ref.pubkey}:${ref.identifier}`);
			allAuthors.add(ref.pubkey);
			allIdentifiers.add(ref.identifier);
		}
	}

	if (allRefKeys.size === 0) {
		for (const stack of stacks) result.set(stack.id, []);
		return result;
	}

	// Single batch cache query for all referenced apps
	const cachedResults = queryCache({
		kinds: [EVENT_KINDS.APP],
		authors: [...allAuthors],
		'#d': [...allIdentifiers],
		...(platformTag ? { '#f': [platformTag] } : {})
	});

	// Build lookup map: "pubkey:dTag" -> event (first/latest wins due to sort order)
	const appEventsByKey = new Map();
	for (const event of cachedResults) {
		const dTag = event.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
		const key = `${event.pubkey}:${dTag}`;
		if (allRefKeys.has(key) && !appEventsByKey.has(key)) {
			appEventsByKey.set(key, event);
		}
	}

	// Resolve each stack's apps in original order
	for (const stack of stacks) {
		const apps = [];
		if (stack?.appRefs) {
			for (const ref of stack.appRefs) {
				if (ref.kind !== EVENT_KINDS.APP) continue;
				const key = `${ref.pubkey}:${ref.identifier}`;
				const event = appEventsByKey.get(key);
				if (event) apps.push(parseApp(event));
			}
		}
		result.set(stack.id, apps);
	}

	return result;
}

/**
 * Resolve apps referenced by a stack (with relay fallback, batched).
 * Used by single-item detail lookups where completeness matters.
 * Makes at most 1 cache query + 1 relay query (for any cache misses).
 */
async function resolveStackApps(stack) {
	if (!stack?.appRefs || stack.appRefs.length === 0) return [];

	const platformTag = PLATFORM_FILTER['#f']?.[0];

	// Collect all unique app refs
	const refsByKey = new Map();
	const allAuthors = new Set();
	const allIdentifiers = new Set();

	for (const ref of stack.appRefs) {
		if (ref.kind !== EVENT_KINDS.APP) continue;
		const key = `${ref.pubkey}:${ref.identifier}`;
		refsByKey.set(key, ref);
		allAuthors.add(ref.pubkey);
		allIdentifiers.add(ref.identifier);
	}

	if (refsByKey.size === 0) return [];

	// Single batch cache query
	const cachedResults = queryCache({
		kinds: [EVENT_KINDS.APP],
		authors: [...allAuthors],
		'#d': [...allIdentifiers],
		...(platformTag ? { '#f': [platformTag] } : {})
	});

	// Build lookup map from cache hits
	const appsByKey = new Map();
	for (const event of cachedResults) {
		const dTag = event.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
		const key = `${event.pubkey}:${dTag}`;
		if (refsByKey.has(key) && !appsByKey.has(key)) {
			appsByKey.set(key, event);
		}
	}

	// Find cache misses and batch-fetch from relays
	const missingAuthors = new Set();
	const missingIdentifiers = new Set();
	for (const [key, ref] of refsByKey) {
		if (!appsByKey.has(key)) {
			missingAuthors.add(ref.pubkey);
			missingIdentifiers.add(ref.identifier);
		}
	}

	if (missingAuthors.size > 0) {
		const relayResults = await queryRelays(DEFAULT_CATALOG_RELAYS, {
			kinds: [EVENT_KINDS.APP],
			authors: [...missingAuthors],
			'#d': [...missingIdentifiers],
			...(platformTag ? { '#f': [platformTag] } : {})
		});

		for (const event of relayResults) {
			const dTag = event.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
			const key = `${event.pubkey}:${dTag}`;
			if (refsByKey.has(key) && !appsByKey.has(key)) {
				appsByKey.set(key, event);
			}
		}
	}

	// Resolve in original order
	const apps = [];
	for (const ref of stack.appRefs) {
		if (ref.kind !== EVENT_KINDS.APP) continue;
		const key = `${ref.pubkey}:${ref.identifier}`;
		const event = appsByKey.get(key);
		if (event) apps.push(parseApp(event));
	}

	return apps;
}

/**
 * Cleanup (called on server shutdown if needed).
 */
export function closeServerPool() {
	// No-op for now; SimplePool handles its own cleanup
}
