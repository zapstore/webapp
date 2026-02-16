/**
 * Server-side Nostr data facade
 *
 * All functions query the in-memory relay cache (populated by polling).
 * Polling starts eagerly on server boot via hooks.server.js.
 *
 * Cache contains: apps (32267), stacks (30267), releases (30063), profiles (0).
 * Releases are cached server-side ONLY for ranking — never shipped to clients.
 *
 * Server-only module — never import from client code.
 */
import { queryCache } from './relay-cache';
import {
	parseApp,
	parseAppStack,
	parseProfile,
	parseRelease
} from './models';
import { EVENT_KINDS, PLATFORM_FILTER } from '$lib/config';
import { APPS_PAGE_SIZE } from '$lib/constants';

// ============================================================================
// Helpers
// ============================================================================

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
// Helpers — release-based ordering
// ============================================================================

/**
 * Extract app identifier from a release event.
 * Checks 'i' tag first, then falls back to 'd' tag (stripping @version).
 */
function getReleaseIdentifier(event) {
	const iTag = event.tags?.find((t) => t[0] === 'i' && typeof t[1] === 'string');
	if (iTag) return iTag[1];
	const dTag = event.tags?.find((t) => t[0] === 'd' && typeof t[1] === 'string');
	if (!dTag) return null;
	const [identifier] = dTag[1].split('@');
	return identifier || null;
}

// ============================================================================
// Public API — all synchronous cache queries
// ============================================================================

/**
 * Fetch app seed events ordered by created_at (most recent first).
 * Simple fallback — use fetchAppsSortedByRelease() for listing pages.
 * Returns only raw events for Dexie seeding — parsing happens client-side via liveQuery.
 */
export function fetchApps(limit = 50) {
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const filter = {
		kinds: [EVENT_KINDS.APP],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit
	};

	const appEvents = queryCache(filter);
	return dedupeEventsById(appEvents);
}

/**
 * Fetch apps sorted by latest release date (most recently released first).
 *
 * Ranking: find the latest `limit` releases, deduplicate by app identifier,
 * batch-query matching apps, return both app events AND their latest release.
 * The client needs releases in Dexie for liveQuery ordering.
 *
 * @param {number} limit  — page size (default APPS_PAGE_SIZE)
 * @param {number} [until] — release created_at cursor for pagination
 * @returns {{ events: object[], cursor: number|null, hasMore: boolean }}
 */
export function fetchAppsSortedByRelease(limit = APPS_PAGE_SIZE, until) {
	const platformTag = PLATFORM_FILTER['#f']?.[0];

	// Find the latest releases (the ranking source)
	const releaseFilter = { kinds: [EVENT_KINDS.RELEASE], limit };
	if (until !== undefined) releaseFilter.until = until;
	const releases = queryCache(releaseFilter);

	if (releases.length === 0) {
		return { events: [], cursor: null, hasMore: false };
	}

	// Deduplicate by app identifier — keep first occurrence (= latest release)
	const seen = new Set();
	const orderedIdentifiers = [];
	const latestReleaseByApp = new Map();

	for (const release of releases) {
		const identifier = getReleaseIdentifier(release);
		if (!identifier || seen.has(identifier)) continue;
		seen.add(identifier);
		orderedIdentifiers.push(identifier);
		latestReleaseByApp.set(identifier, release);
	}

	// Batch query matching apps (single cache query — no N+1)
	const appEvents = queryCache({
		kinds: [EVENT_KINDS.APP],
		'#d': orderedIdentifiers,
		...(platformTag ? { '#f': [platformTag] } : {})
	});

	// Index apps by dTag (keep latest per identifier)
	const appByIdentifier = new Map();
	for (const app of appEvents) {
		const dTag = app.tags?.find((t) => t[0] === 'd')?.[1];
		if (!dTag) continue;
		const existing = appByIdentifier.get(dTag);
		if (!existing || app.created_at > existing.created_at) {
			appByIdentifier.set(dTag, app);
		}
	}

	// Build result: apps + their latest releases (both needed client-side)
	const resultEvents = [];
	let lastReleaseTime = null;

	for (const id of orderedIdentifiers) {
		const app = appByIdentifier.get(id);
		const release = latestReleaseByApp.get(id);
		if (app && release) {
			resultEvents.push(app, release);
			lastReleaseTime = release.created_at;
		}
	}

	return {
		events: dedupeEventsById(resultEvents),
		cursor: lastReleaseTime != null ? lastReleaseTime - 1 : null,
		hasMore: releases.length >= limit
	};
}

/**
 * Alias for discover/apps listing pages: fetch apps by release order and return
 * { apps, nextCursor, seedEvents } for SSR seeding and pagination.
 * Uses fetchAppsSortedByRelease under the hood.
 */
export function fetchAppsByReleases(limit = APPS_PAGE_SIZE, until) {
	const { events, cursor, hasMore } = fetchAppsSortedByRelease(limit, until);
	const apps = events.filter((e) => e.kind === EVENT_KINDS.APP).map(parseApp);
	return {
		apps,
		nextCursor: cursor,
		seedEvents: events,
		hasMore
	};
}

/**
 * Fetch a single app by pubkey and identifier.
 * Returns { app, seedEvents } where seedEvents includes the raw app event
 * and the publisher's profile event (if available in cache).
 */
export function fetchApp(pubkey, identifier) {
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const filter = {
		kinds: [EVENT_KINDS.APP],
		authors: [pubkey],
		'#d': [identifier],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: 1
	};

	const cached = queryCache(filter);
	if (cached.length === 0) return null;

	const appEvent = cached[0];
	const app = parseApp(appEvent);

	// Get publisher profile from cache (populated by hourly profile poll)
	const profileResults = queryCache({ kinds: [EVENT_KINDS.PROFILE], authors: [pubkey], limit: 1 });
	const profileEvent = profileResults[0] ?? null;

	const seedEvents = dedupeEventsById([
		appEvent,
		...(profileEvent ? [profileEvent] : [])
	]);

	return { app, seedEvents };
}

/**
 * Build the 'a' tag value for an app (kind:pubkey:identifier).
 */
function appATag(pubkey, identifier) {
	return `${EVENT_KINDS.APP}:${pubkey}:${identifier}`;
}

/**
 * Fetch latest release for an app from cache.
 * Returns parsed release or null.
 */
export function fetchLatestReleaseForApp(pubkey, identifier) {
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const filter = {
		kinds: [EVENT_KINDS.RELEASE],
		'#a': [appATag(pubkey, identifier)],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: 1
	};
	const cached = queryCache(filter);
	if (cached.length === 0) return null;
	return parseRelease(cached[0]);
}

/**
 * Fetch all releases for an app from cache (newest first).
 */
export function fetchReleasesForApp(pubkey, identifier, limit = 50) {
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
	const filter = {
		kinds: [EVENT_KINDS.RELEASE],
		'#a': [appATag(pubkey, identifier)],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: safeLimit
	};
	const cached = queryCache(filter);
	return cached.map(parseRelease);
}

/**
 * Fetch stack seed events with their referenced app events.
 * Returns only raw events for Dexie seeding — parsing happens client-side via liveQuery.
 */
export function fetchStacks(limit = 20, until) {
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

	// Resolve referenced apps — get raw events directly from cache (no duplication)
	const { appEvents } = resolveMultipleStackAppsFromCache(stacks);

	return dedupeEventsById([...stackEvents, ...appEvents]);
}

/**
 * Fetch a single stack with apps and creator profile.
 */
export function fetchStack(pubkey, identifier) {
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const filter = {
		kinds: [EVENT_KINDS.APP_STACK],
		authors: [pubkey],
		'#d': [identifier],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: 1
	};

	const results = queryCache(filter);
	if (results.length === 0) return null;
	// Prefer latest by created_at when cache has multiple events for same (pubkey, d)
	const stackEvent = results.length === 1
		? results[0]
		: [...results].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0];
	const stack = parseAppStack(stackEvent);
	const { apps, appEvents } = resolveStackAppsFromCache(stack);

	// Get creator profile from cache (populated by hourly profile poll)
	const profileResults = queryCache({ kinds: [EVENT_KINDS.PROFILE], authors: [pubkey], limit: 1 });
	const profileEvent = profileResults[0] ?? null;
	const creator = profileEvent ? parseProfile(profileEvent) : null;

	const seedEvents = dedupeEventsById([
		stackEvent,
		...appEvents,
		...(profileEvent ? [profileEvent] : [])
	]);

	return { stack, apps, creator, seedEvents };
}

/**
 * Fetch apps by author.
 */
export function fetchAppsByAuthor(pubkey, limit = 50) {
	const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const filter = {
		kinds: [EVENT_KINDS.APP],
		authors: [pubkey],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: safeLimit
	};

	const cached = queryCache(filter);
	return cached.map(parseApp);
}

/**
 * Fetch stacks by author.
 */
export function fetchStacksByAuthor(pubkey, limit = 50) {
	const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const filter = {
		kinds: [EVENT_KINDS.APP_STACK],
		authors: [pubkey],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: safeLimit
	};

	const stackEvents = queryCache(filter);
	const parsed = stackEvents.map(parseAppStack);
	// Keep only the latest stack per (pubkey, dTag)
	const stacksByKey = new Map();
	for (const stack of parsed) {
		if (!stack?.pubkey || !stack?.dTag) continue;
		const key = `${stack.pubkey}:${stack.dTag}`;
		const existing = stacksByKey.get(key);
		if (!existing || (stack.createdAt != null && stack.createdAt > (existing.createdAt ?? 0))) {
			stacksByKey.set(key, stack);
		}
	}
	const stacks = [...stacksByKey.values()];

	const { appsByStackId } = resolveMultipleStackAppsFromCache(stacks);
	const resolvedStacks = [];
	for (const stack of stacks) {
		const apps = appsByStackId.get(stack.id) ?? [];
		resolvedStacks.push({ stack, apps });
	}

	return { stacks, resolvedStacks };
}

/**
 * Fetch profiles from server cache.
 * Returns a Map of pubkey -> profile event.
 * Profiles are populated by hourly polling from vertexlab relay.
 */
export function fetchProfilesServer(pubkeys) {
	const results = new Map();
	if (!pubkeys || pubkeys.length === 0) return results;

	const normalized = [
		...new Set(
			pubkeys
				.map((pk) => String(pk).trim().toLowerCase())
				.filter((pk) => /^[a-f0-9]{64}$/.test(pk))
		)
	];

	const cachedProfiles = queryCache({ kinds: [EVENT_KINDS.PROFILE], authors: normalized });
	for (const event of cachedProfiles) {
		const pk = event.pubkey?.toLowerCase();
		if (pk && !results.has(pk)) {
			results.set(pk, event);
		}
	}

	return results;
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Resolve apps referenced by multiple stacks (cache only, single batch query).
 * Returns { appsByStackId: Map<stackId, parsedApp[]>, appEvents: rawEvent[] }.
 * appEvents are the raw cache events — no duplication with parsed models.
 */
function resolveMultipleStackAppsFromCache(stacks) {
	const appsByStackId = new Map();
	if (!stacks || stacks.length === 0) return { appsByStackId, appEvents: [] };

	const platformTag = PLATFORM_FILTER['#f']?.[0];

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
		for (const stack of stacks) appsByStackId.set(stack.id, []);
		return { appsByStackId, appEvents: [] };
	}

	const cachedResults = queryCache({
		kinds: [EVENT_KINDS.APP],
		authors: [...allAuthors],
		'#d': [...allIdentifiers],
		...(platformTag ? { '#f': [platformTag] } : {})
	});

	const appEventsByKey = new Map();
	for (const event of cachedResults) {
		const dTag = event.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
		const key = `${event.pubkey}:${dTag}`;
		if (allRefKeys.has(key) && !appEventsByKey.has(key)) {
			appEventsByKey.set(key, event);
		}
	}

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
		appsByStackId.set(stack.id, apps);
	}

	// Collect unique raw events for seeding (no rawEvent on parsed models)
	const appEvents = [...appEventsByKey.values()];

	return { appsByStackId, appEvents };
}

/**
 * Resolve apps referenced by a single stack (cache only).
 * Returns { apps: parsedApp[], appEvents: rawEvent[] }.
 */
function resolveStackAppsFromCache(stack) {
	if (!stack?.appRefs || stack.appRefs.length === 0) return { apps: [], appEvents: [] };

	const platformTag = PLATFORM_FILTER['#f']?.[0];

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

	if (refsByKey.size === 0) return { apps: [], appEvents: [] };

	const cachedResults = queryCache({
		kinds: [EVENT_KINDS.APP],
		authors: [...allAuthors],
		'#d': [...allIdentifiers],
		...(platformTag ? { '#f': [platformTag] } : {})
	});

	const appsByKey = new Map();
	for (const event of cachedResults) {
		const dTag = event.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
		const key = `${event.pubkey}:${dTag}`;
		if (refsByKey.has(key) && !appsByKey.has(key)) {
			appsByKey.set(key, event);
		}
	}

	const apps = [];
	for (const ref of stack.appRefs) {
		if (ref.kind !== EVENT_KINDS.APP) continue;
		const key = `${ref.pubkey}:${ref.identifier}`;
		const event = appsByKey.get(key);
		if (event) apps.push(parseApp(event));
	}

	return { apps, appEvents: [...appsByKey.values()] };
}
