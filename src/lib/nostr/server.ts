/**
 * Server-side Nostr utilities
 *
 * For SSR and prerendering - uses nostr-tools directly since
 * we don't need IndexedDB caching on the server.
 *
 * Data loading strategy:
 * - Load releases (kind 30063) sorted by created_at
 * - For each release, find its app (kind 32267) via the 'a' tag
 * - Display unique apps
 */

import { SimplePool, type Filter, type Event } from 'nostr-tools';
import { DEFAULT_CATALOG_RELAYS, EVENT_KINDS } from '$lib/config';
import { parseApp, parseRelease, type App, type Release } from './models';

const FETCH_TIMEOUT = 10000; // 10 seconds for server-side fetches

// Reuse pool across requests during build
let pool: SimplePool | null = null;

function getPool(): SimplePool {
	if (!pool) {
		pool = new SimplePool();
	}
	return pool;
}

/**
 * Fetch events from relays (server-side)
 */
async function fetchEvents(filter: Filter): Promise<Event[]> {
	const p = getPool();
	const relays = [...DEFAULT_CATALOG_RELAYS];

	return new Promise((resolve) => {
		const events: Event[] = [];
		let resolved = false;

		const sub = p.subscribeMany(relays, filter, {
			onevent(event) {
				events.push(event);
			},
			oneose() {
				if (!resolved) {
					resolved = true;
					sub.close();
					resolve(events);
				}
			}
		});

		// Fallback timeout
		setTimeout(() => {
			if (!resolved) {
				resolved = true;
				sub.close();
				resolve(events);
			}
		}, FETCH_TIMEOUT);
	});
}

/**
 * Extract app reference from release's 'a' tag
 * Format: "kind:pubkey:identifier"
 */
function parseAppReference(release: Event): { pubkey: string; identifier: string } | null {
	const aTag = release.tags.find((t) => t[0] === 'a')?.[1];
	if (!aTag) return null;

	const parts = aTag.split(':');
	if (parts.length < 3 || !parts[1] || !parts[2]) return null;

	return {
		pubkey: parts[1],
		identifier: parts[2]
	};
}

/**
 * Fetch apps by loading releases and resolving to their apps.
 * This is the canonical way to discover apps - through their releases.
 *
 * @param limit - Number of releases to fetch per page
 * @param until - Fetch releases created before this timestamp (for pagination)
 * @returns Object with apps array and cursor for next page
 */
export async function fetchAppsByReleases(
	limit: number = 20,
	until?: number
): Promise<{ apps: App[]; releases: Release[]; nextCursor: number | null }> {
	console.log(`[Server] Fetching releases (limit: ${limit}, until: ${until ?? 'now'})...`);

	// Step 1: Fetch releases sorted by created_at
	const releaseFilter: Filter = {
		kinds: [EVENT_KINDS.RELEASE],
		limit
	};
	if (until !== undefined) {
		releaseFilter.until = until;
	}

	const releaseEvents = await fetchEvents(releaseFilter);
	console.log(`[Server] Fetched ${releaseEvents.length} release events`);

	if (releaseEvents.length === 0) {
		return { apps: [], releases: [], nextCursor: null };
	}

	// Sort releases by created_at descending
	releaseEvents.sort((a, b) => b.created_at - a.created_at);

	// Step 2: Extract unique app references from releases
	const appRefs = new Map<string, { pubkey: string; identifier: string }>();
	for (const release of releaseEvents) {
		const ref = parseAppReference(release);
		if (ref) {
			const key = `${ref.pubkey}:${ref.identifier}`;
			if (!appRefs.has(key)) {
				appRefs.set(key, ref);
			}
		}
	}

	console.log(`[Server] Found ${appRefs.size} unique app references`);

	// Step 3: Fetch all referenced apps in parallel
	const apps: App[] = [];
	if (appRefs.size > 0) {
		const refs = Array.from(appRefs.values());

		// Fetch apps in parallel batches
		const BATCH_SIZE = 20;
		for (let i = 0; i < refs.length; i += BATCH_SIZE) {
			const batch = refs.slice(i, i + BATCH_SIZE);

			const appPromises = batch.map(async (ref) => {
				const events = await fetchEvents({
					kinds: [EVENT_KINDS.APP],
					authors: [ref.pubkey],
					'#d': [ref.identifier]
				});
				return events;
			});

			const results = await Promise.all(appPromises);
			for (const events of results) {
				if (events.length > 0) {
					// Get most recent version (replaceable event)
					const sorted = events.sort((a, b) => b.created_at - a.created_at);
					apps.push(parseApp(sorted[0] as unknown as import('nostr-tools').NostrEvent));
				}
			}
		}
	}

	console.log(`[Server] Resolved ${apps.length} apps`);

	// Parse releases
	const releases = releaseEvents.map((e) =>
		parseRelease(e as unknown as import('nostr-tools').NostrEvent)
	);

	// Calculate next cursor (timestamp of last release minus 1 to avoid duplicates)
	const lastRelease = releaseEvents[releaseEvents.length - 1]!;
	const nextCursor = releaseEvents.length === limit ? lastRelease.created_at - 1 : null;

	// Deduplicate apps (keep first occurrence, which is most recently released)
	const seenIds = new Set<string>();
	const uniqueApps = apps.filter((app) => {
		const key = `${app.pubkey}:${app.dTag}`;
		if (seenIds.has(key)) return false;
		seenIds.add(key);
		return true;
	});

	return { apps: uniqueApps, releases, nextCursor };
}

/**
 * Fetch all apps by iterating through all releases.
 * Used for prerendering the initial page.
 */
export async function fetchAllApps(): Promise<App[]> {
	console.log('[Server] Fetching all apps via releases...');

	const allApps: App[] = [];
	const seenApps = new Set<string>();
	let cursor: number | undefined = undefined;

	// Paginate through all releases
	while (true) {
		const { apps, nextCursor } = await fetchAppsByReleases(100, cursor);

		for (const app of apps) {
			const key = `${app.pubkey}:${app.dTag}`;
			if (!seenApps.has(key)) {
				seenApps.add(key);
				allApps.push(app);
			}
		}

		if (nextCursor === null) break;
		cursor = nextCursor;
	}

	console.log(`[Server] Total apps discovered: ${allApps.length}`);
	return allApps;
}

/**
 * Fetch a specific app by pubkey and identifier
 */
export async function fetchApp(
	pubkey: string,
	identifier: string
): Promise<App | null> {
	console.log(`[Server] Fetching app: ${identifier}`);
	const events = await fetchEvents({
		kinds: [EVENT_KINDS.APP],
		authors: [pubkey],
		'#d': [identifier]
	});

	if (events.length === 0) return null;

	// Get the most recent version (replaceable event)
	const sorted = events.sort((a, b) => b.created_at - a.created_at);
	return parseApp(sorted[0] as unknown as import('nostr-tools').NostrEvent);
}

/**
 * Fetch the latest release for a specific app
 */
export async function fetchLatestReleaseForApp(pubkey: string, identifier: string): Promise<Release | null> {
	const aTagValue = `${EVENT_KINDS.APP}:${pubkey}:${identifier}`;
	console.log(`[Server] Fetching latest release for: ${aTagValue}`);

	// Releases reference apps via 'a' tag - use proper filter
	const events = await fetchEvents({
		kinds: [EVENT_KINDS.RELEASE],
		'#a': [aTagValue],
		limit: 1
	});

	console.log(`[Server] Found ${events.length} releases`);

	if (events.length === 0) {
		return null;
	}

	return parseRelease(events[0] as unknown as import('nostr-tools').NostrEvent);
}

/**
 * Cleanup pool connections (call at end of build)
 */
export function closeServerPool(): void {
	if (pool) {
		pool.close([...DEFAULT_CATALOG_RELAYS]);
		pool = null;
	}
}
