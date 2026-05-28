/**
 * Server-side Nostr data facade — Direct relay queries
 *
 * Queries relay.zapstore.dev directly at SSR time. No in-memory cache,
 * no polling. Each SSR request opens a one-shot subscription, collects
 * events until EOSE + grace, and returns them as seed data.
 *
 * Server-only module — never import from client code.
 */
import { SimplePool } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import {
	parseApp,
	parseAppStack,
	parseProfile,
	parseForumPost
} from '$lib/nostr/models.js';
import {
	EVENT_KINDS,
	PLATFORM_FILTER,
	PROFILE_FETCH_RELAYS,
	SAVED_APPS_STACK_D_TAG,
	ZAPSTORE_COMMUNITY_NPUB,
	ZAPSTORE_COMMUNITY_PUBKEY,
	ZAPSTORE_COMMUNITY_RELAY
} from '$lib/config';
import { APPS_PAGE_SIZE } from '$lib/constants';

const RELAY = 'wss://relay.zapstore.dev';

const EOSE_GRACE_MS = 300;
const QUERY_TIMEOUT_MS = 4000;

let subCounter = 0;

export function destroyServerPool() {
	// Server relay queries use per-request pools and close them in queryRelay().
}
const subId = () => `ssr-${++subCounter}-${Math.floor(Math.random() * 1e6)}`;

let COMMUNITY_PUBKEY_HEX = '';
try {
	const d = nip19.decode(ZAPSTORE_COMMUNITY_NPUB);
	if (d?.type === 'npub') COMMUNITY_PUBKEY_HEX = d.data;
} catch { /* noop */ }

// ============================================================================
// Core relay query
// ============================================================================

/**
 * One-shot relay query: subscribe → collect → EOSE+grace → close → return.
 */
function queryRelay(relayUrls, filter, timeoutMs = QUERY_TIMEOUT_MS) {
	return new Promise((resolve) => {
		const queryPool = new SimplePool();
		const events = [];
		let settled = false;
		let eoseTimer = null;
		let timeoutTimer = null;

		const finish = () => {
			if (settled) return;
			settled = true;
			if (eoseTimer) clearTimeout(eoseTimer);
			if (timeoutTimer) clearTimeout(timeoutTimer);
			try { sub?.close(); } catch { /* noop */ }
			try { queryPool.close(relayUrls); } catch { /* noop */ }
			resolve(events);
		};

		let sub;
		try {
			sub = queryPool.subscribeMany(relayUrls, filter, {
				id: subId(),
				onevent(event) { if (event?.id) events.push(event); },
				oneose() { if (!eoseTimer) eoseTimer = setTimeout(finish, EOSE_GRACE_MS); },
				onclose() { if (!settled) finish(); }
			});
		} catch {
			finish();
			return;
		}

		timeoutTimer = setTimeout(finish, timeoutMs);
	});
}

// ============================================================================
// Helpers
// ============================================================================

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

function getReleaseIdentifier(event) {
	const iTag = event.tags?.find((t) => t[0] === 'i' && typeof t[1] === 'string');
	if (iTag) return iTag[1];
	const dTag = event.tags?.find((t) => t[0] === 'd' && typeof t[1] === 'string');
	if (!dTag) return null;
	const [identifier] = dTag[1].split('@');
	return identifier || null;
}

// ============================================================================
// Public API — async relay queries
// ============================================================================

async function fetchAppsOrderedByLatestRelease(limit = APPS_PAGE_SIZE) {
	const platformTag = PLATFORM_FILTER['#f']?.[0];

	const releases = await queryRelay([RELAY], {
		kinds: [EVENT_KINDS.RELEASE],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: limit * 2
	});

	if (releases.length === 0) {
		const apps = await queryRelay([RELAY], {
			kinds: [EVENT_KINDS.APP],
			...(platformTag ? { '#f': [platformTag] } : {}),
			limit
		});
		return { releases: [], apps: dedupeEventsById(apps) };
	}

	const seen = new Set();
	const orderedIdentifiers = [];
	for (const release of releases) {
		const identifier = getReleaseIdentifier(release);
		if (!identifier || seen.has(identifier)) continue;
		seen.add(identifier);
		orderedIdentifiers.push(identifier);
		if (orderedIdentifiers.length >= limit) break;
	}

	if (orderedIdentifiers.length === 0) {
		return { releases: dedupeEventsById(releases), apps: [] };
	}

	const appEvents = await queryRelay([RELAY], {
		kinds: [EVENT_KINDS.APP],
		'#d': orderedIdentifiers,
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: orderedIdentifiers.length + 10
	});

	const appByIdentifier = new Map();
	for (const app of appEvents) {
		const dTag = app.tags?.find((t) => t[0] === 'd')?.[1];
		if (!dTag) continue;
		const existing = appByIdentifier.get(dTag);
		if (!existing || app.created_at > existing.created_at) {
			appByIdentifier.set(dTag, app);
		}
	}

	const result = [];
	for (const id of orderedIdentifiers) {
		const app = appByIdentifier.get(id);
		if (app) result.push(app);
	}

	return { releases: dedupeEventsById(releases), apps: dedupeEventsById(result) };
}

/**
 * Fetch apps ordered by latest release (for listing pages).
 *
 * Pattern: query releases (30063) to determine order, then batch-query
 * apps (32267) by identifier. Returns only app events.
 */
export async function fetchApps(limit = APPS_PAGE_SIZE) {
	const { apps } = await fetchAppsOrderedByLatestRelease(limit);
	return apps;
}

/**
 * Fetch app listing seed events, including releases so the client-side
 * Dexie listing can preserve latest-release ordering reactively.
 */
export async function fetchAppListingSeedEvents(limit = APPS_PAGE_SIZE) {
	const { releases, apps } = await fetchAppsOrderedByLatestRelease(limit);
	return dedupeEventsById([...releases, ...apps]);
}

/**
 * Fetch a single app by pubkey + identifier.
 * Returns { app, seedEvents } with app + profile events.
 */
export async function fetchApp(pubkey, identifier) {
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const events = await queryRelay([RELAY], {
		kinds: [EVENT_KINDS.APP],
		authors: [pubkey],
		'#d': [identifier],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: 1
	});

	if (events.length === 0) return null;

	const appEvent = events[0];
	if (!appEvent?.pubkey || !appEvent?.tags) return null;
	const app = parseApp(appEvent);

	const profileEvents = await queryRelay(PROFILE_FETCH_RELAYS, {
		kinds: [EVENT_KINDS.PROFILE],
		authors: [pubkey],
		limit: 1
	});

	const seedEvents = dedupeEventsById([
		appEvent,
		...(profileEvents.length > 0 ? [profileEvents[0]] : [])
	]);

	return { app, seedEvents };
}

/**
 * Fetch a single app by d-tag identifier only (no pubkey required).
 */
export async function fetchAppByIdentifier(identifier) {
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const events = await queryRelay([RELAY], {
		kinds: [EVENT_KINDS.APP],
		'#d': [identifier],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: 1
	});

	if (events.length === 0) return null;

	const appEvent = events[0];
	if (!appEvent?.pubkey || !appEvent?.tags) return null;
	const app = parseApp(appEvent);

	const profileEvents = await queryRelay(PROFILE_FETCH_RELAYS, {
		kinds: [EVENT_KINDS.PROFILE],
		authors: [appEvent.pubkey],
		limit: 1
	});

	const seedEvents = dedupeEventsById([
		appEvent,
		...(profileEvents.length > 0 ? [profileEvents[0]] : [])
	]);

	return { app, seedEvents };
}

// ============================================================================
// Stacks — only kind 32267 (app events for preview icons)
// ============================================================================

/**
 * Fetch stack seed events with their referenced app events.
 * Stacks are kind 30267; app preview icons are kind 32267.
 */
/**
 * Fetch stacks authored by the Zapstore community pubkey, with preview app events.
 */
export async function fetchZapstoreCommunityStacks(limit = 8, until) {
	const author = COMMUNITY_PUBKEY_HEX || ZAPSTORE_COMMUNITY_PUBKEY;
	const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const filter = {
		kinds: [EVENT_KINDS.APP_STACK],
		authors: [author],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: safeLimit
	};
	if (until !== undefined) filter.until = until;

	const stackEvents = await queryRelay([RELAY], filter);

	const publicStackEvents = stackEvents.filter(
		(e) =>
			e.pubkey === author &&
			e.tags?.find((t) => t[0] === 'd')?.[1] !== SAVED_APPS_STACK_D_TAG &&
			!e.content
	);
	const stacks = publicStackEvents.map(parseAppStack);

	const { appEvents } = await resolveMultipleStackApps(stacks, 4);

	return dedupeEventsById([...publicStackEvents, ...appEvents]);
}

export async function fetchStacks(limit = 20, until) {
	const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const filter = {
		kinds: [EVENT_KINDS.APP_STACK],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: safeLimit
	};
	if (until !== undefined) filter.until = until;

	const stackEvents = await queryRelay([RELAY], filter);

	const publicStackEvents = stackEvents.filter(
		(e) => e.tags?.find((t) => t[0] === 'd')?.[1] !== SAVED_APPS_STACK_D_TAG && !e.content
	);
	const stacks = publicStackEvents.map(parseAppStack);

	const { appEvents } = await resolveMultipleStackApps(stacks, 4);

	return dedupeEventsById([...publicStackEvents, ...appEvents]);
}

/**
 * Fetch a single stack with apps and creator profile.
 */
export async function fetchStack(pubkey, identifier) {
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const stackEvents = await queryRelay([RELAY], {
		kinds: [EVENT_KINDS.APP_STACK],
		authors: [pubkey],
		'#d': [identifier],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: 1
	});

	if (stackEvents.length === 0) return null;

	const stackEvent = stackEvents.length === 1
		? stackEvents[0]
		: [...stackEvents].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0];
	const stack = parseAppStack(stackEvent);
	const { apps, appEvents } = await resolveStackApps(stack);

	const profileEvents = await queryRelay(PROFILE_FETCH_RELAYS, {
		kinds: [EVENT_KINDS.PROFILE],
		authors: [pubkey],
		limit: 1
	});
	const profileEvent = profileEvents[0] ?? null;
	const creator = profileEvent ? parseProfile(profileEvent) : null;

	const seedEvents = dedupeEventsById([
		stackEvent,
		...appEvents,
		...(profileEvent ? [profileEvent] : [])
	]);

	const { event: _event, ...stackData } = stack;

	return { stack: stackData, apps, creator, seedEvents };
}

// ============================================================================
// Profiles
// ============================================================================

/**
 * Fetch profiles from relays. Returns Map<pubkey, profileEvent>.
 */
export async function fetchProfilesServer(pubkeys) {
	const results = new Map();
	if (!pubkeys || pubkeys.length === 0) return results;

	const normalized = [
		...new Set(
			pubkeys
				.map((pk) => String(pk).trim().toLowerCase())
				.filter((pk) => /^[a-f0-9]{64}$/.test(pk))
		)
	];
	if (normalized.length === 0) return results;

	const events = await queryRelay(PROFILE_FETCH_RELAYS, {
		kinds: [EVENT_KINDS.PROFILE],
		authors: normalized,
		limit: normalized.length
	});

	for (const event of events) {
		const pk = event.pubkey?.toLowerCase();
		if (pk && !results.has(pk)) {
			results.set(pk, event);
		}
	}

	return results;
}

// ============================================================================
// Author queries
// ============================================================================

export async function fetchAppsByAuthor(pubkey, limit = 50) {
	const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const events = await queryRelay([RELAY], {
		kinds: [EVENT_KINDS.APP],
		authors: [pubkey],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: safeLimit
	});

	return { apps: events.map(parseApp), seedEvents: dedupeEventsById(events) };
}

export async function fetchStacksByAuthor(pubkey, limit = 50) {
	const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const stackEvents = await queryRelay([RELAY], {
		kinds: [EVENT_KINDS.APP_STACK],
		authors: [pubkey],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: safeLimit
	});

	const parsed = stackEvents.map(parseAppStack);
	const stacksByKey = new Map();
	for (const stack of parsed) {
		if (!stack?.pubkey || !stack?.dTag || stack.dTag === SAVED_APPS_STACK_D_TAG || !!stack.event?.content) continue;
		const key = `${stack.pubkey}:${stack.dTag}`;
		const existing = stacksByKey.get(key);
		if (!existing || (stack.createdAt != null && stack.createdAt > (existing.createdAt ?? 0))) {
			stacksByKey.set(key, stack);
		}
	}
	const stacks = [...stacksByKey.values()].map(({ event: _event, ...rest }) => rest);

	const { appsByStackId, appEvents } = await resolveMultipleStackApps(stacks);
	const resolvedStacks = [];
	for (const stack of stacks) {
		const apps = appsByStackId.get(stack.id) ?? [];
		resolvedStacks.push({ stack, apps });
	}

	// Seed events: raw stack events (so detail-page liveQuery can re-parse
	// them with the `event` property intact) plus referenced app events.
	const seedEvents = dedupeEventsById([
		...stackEvents.filter(
			(e) =>
				e.tags?.find((t) => t[0] === 'd')?.[1] !== SAVED_APPS_STACK_D_TAG && !e.content
		),
		...appEvents
	]);
	return { stacks, resolvedStacks, seedEvents };
}

// ============================================================================
// Forum (kind 11)
// ============================================================================

export async function fetchForumPosts(limit = 50) {
	if (!COMMUNITY_PUBKEY_HEX) return [];
	const events = await queryRelay([ZAPSTORE_COMMUNITY_RELAY], {
		kinds: [EVENT_KINDS.FORUM_POST],
		'#h': [COMMUNITY_PUBKEY_HEX],
		limit: Math.min(limit, 100)
	});
	return dedupeEventsById(events);
}

export async function fetchForumPostById(eventId) {
	const events = await queryRelay([ZAPSTORE_COMMUNITY_RELAY], {
		kinds: [EVENT_KINDS.FORUM_POST],
		ids: [eventId],
		limit: 1
	});
	if (events.length === 0) return null;
	const ev = events[0];
	if (COMMUNITY_PUBKEY_HEX) {
		const hasH = ev.tags?.some((t) => t[0] === 'h' && t[1] === COMMUNITY_PUBKEY_HEX);
		if (!hasH) return null;
	}
	const post = parseForumPost(ev);
	const seedEvents = dedupeEventsById([ev]);
	return { post, seedEvents };
}

// ============================================================================
// Internal — stack app resolution (batch relay queries)
// ============================================================================

async function resolveMultipleStackApps(stacks, maxRefsPerStack = Infinity) {
	const appsByStackId = new Map();
	if (!stacks || stacks.length === 0) return { appsByStackId, appEvents: [] };

	const platformTag = PLATFORM_FILTER['#f']?.[0];

	const allRefKeys = new Set();
	const allAuthors = new Set();
	const allIdentifiers = new Set();

	for (const stack of stacks) {
		if (!stack?.appRefs) continue;
		const refs = stack.appRefs.filter((r) => r.kind === EVENT_KINDS.APP);
		const limitedRefs = isFinite(maxRefsPerStack) ? refs.slice(0, maxRefsPerStack) : refs;
		for (const ref of limitedRefs) {
			allRefKeys.add(`${ref.pubkey}:${ref.identifier}`);
			allAuthors.add(ref.pubkey);
			allIdentifiers.add(ref.identifier);
		}
	}

	if (allRefKeys.size === 0) {
		for (const stack of stacks) appsByStackId.set(stack.id, []);
		return { appsByStackId, appEvents: [] };
	}

	const appResults = await queryRelay([RELAY], {
		kinds: [EVENT_KINDS.APP],
		authors: [...allAuthors],
		'#d': [...allIdentifiers],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: allRefKeys.size + 20
	});

	const appEventsByKey = new Map();
	for (const event of appResults) {
		const dTag = event.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
		const key = `${event.pubkey}:${dTag}`;
		if (allRefKeys.has(key) && !appEventsByKey.has(key)) {
			appEventsByKey.set(key, event);
		}
	}

	for (const stack of stacks) {
		const apps = [];
		if (stack?.appRefs) {
			const refs = stack.appRefs.filter((r) => r.kind === EVENT_KINDS.APP);
			const limitedRefs = isFinite(maxRefsPerStack) ? refs.slice(0, maxRefsPerStack) : refs;
			for (const ref of limitedRefs) {
				const key = `${ref.pubkey}:${ref.identifier}`;
				const event = appEventsByKey.get(key);
				if (event) apps.push(parseApp(event));
			}
		}
		appsByStackId.set(stack.id, apps);
	}

	return { appsByStackId, appEvents: [...appEventsByKey.values()] };
}

async function resolveStackApps(stack) {
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

	const appResults = await queryRelay([RELAY], {
		kinds: [EVENT_KINDS.APP],
		authors: [...allAuthors],
		'#d': [...allIdentifiers],
		...(platformTag ? { '#f': [platformTag] } : {}),
		limit: refsByKey.size + 10
	});

	const appsByKey = new Map();
	for (const event of appResults) {
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
