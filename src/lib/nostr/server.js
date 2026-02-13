/**
 * Server-side Nostr data facade
 *
 * All functions query the in-memory relay cache (populated by polling).
 * Polling starts eagerly on server boot via hooks.server.js.
 *
 * Cache contains: apps (32267), stacks (30267), profiles (0).
 * NO releases — those are fetched client-side from relays.
 *
 * Server-only module — never import from client code.
 */
import { queryCache } from './relay-cache';
import {
	parseApp,
	parseAppStack,
	parseProfile
} from './models';
import { EVENT_KINDS, PLATFORM_FILTER } from '$lib/config';

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
// Public API — all synchronous cache queries
// ============================================================================

/**
 * Fetch apps ordered by created_at (most recent first).
 * Cache contains top 50 apps from polling. No releases on server.
 */
export function fetchApps(limit = 50) {
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const filter = {
		kinds: [EVENT_KINDS.APP],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit
	};

	const appEvents = queryCache(filter);
	const apps = appEvents.map(parseApp);
	const seedEvents = dedupeEventsById(appEvents);

	return { apps, seedEvents };
}

/**
 * Fetch a single app by pubkey and identifier.
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
	if (cached.length > 0) return parseApp(cached[0]);

	return null;
}

/**
 * Fetch stacks with resolved apps.
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

	const seedEvents = dedupeEventsById([...stackEvents, ...selectedAppEvents]);

	return { stacks, resolvedStacks, seedEvents };
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

	const stackEvent = results[0];
	const stack = parseAppStack(stackEvent);
	const apps = resolveStackAppsFromCache(stack);

	// Get creator profile from cache (populated by hourly profile poll)
	const profileResults = queryCache({ kinds: [EVENT_KINDS.PROFILE], authors: [pubkey], limit: 1 });
	const profileEvent = profileResults[0] ?? null;
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
 * Returns a Map from stack event id to parsed app array.
 */
function resolveMultipleStackAppsFromCache(stacks) {
	const result = new Map();
	if (!stacks || stacks.length === 0) return result;

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
		for (const stack of stacks) result.set(stack.id, []);
		return result;
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
		result.set(stack.id, apps);
	}

	return result;
}

/**
 * Resolve apps referenced by a single stack (cache only).
 */
function resolveStackAppsFromCache(stack) {
	if (!stack?.appRefs || stack.appRefs.length === 0) return [];

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

	if (refsByKey.size === 0) return [];

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

	return apps;
}
