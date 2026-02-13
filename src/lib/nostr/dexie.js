/**
 * Dexie Database — Client-side reactive data layer
 *
 * Single source of truth on the client. All Nostr events are stored here.
 * Use liveQuery() from 'dexie' for reactive subscriptions that auto-update
 * when underlying data changes.
 *
 * queryEvents(filter) is the universal NIP-01 → Dexie query engine.
 * It translates NIP-01 filter objects to efficient IndexedDB queries using
 * the optimal index for each filter shape.
 *
 * Schema changes: bump SCHEMA_VERSION and the database is nuked (no migrations).
 * Relay subscriptions and seed events repopulate it immediately.
 */
import Dexie from 'dexie';
import { browser } from '$app/environment';
import { EVENT_KINDS } from '$lib/config';

// ============================================================================
// Schema — bump this to nuke the database on next load
// ============================================================================

const SCHEMA_VERSION = 3;
const SCHEMA_KEY = 'zapstore_schema_version';

/**
 * Nuke the database if the schema version changed.
 * No migrations — relay subscriptions and seed events repopulate immediately.
 */
if (browser) {
	try {
		const stored = parseInt(localStorage.getItem(SCHEMA_KEY) ?? '0', 10);
		if (stored !== SCHEMA_VERSION) {
			// Synchronous delete before Dexie opens — IndexedDB API allows this
			indexedDB.deleteDatabase('zapstore');
			localStorage.setItem(SCHEMA_KEY, String(SCHEMA_VERSION));
		}
	} catch {
		// localStorage or indexedDB unavailable — Dexie will create fresh
	}
}

export const db = new Dexie('zapstore');

db.version(SCHEMA_VERSION).stores({
	events: 'id, kind, pubkey, created_at, [kind+created_at], [kind+pubkey], *_tags'
});

// ============================================================================
// Tag index helpers
// ============================================================================

/**
 * Tags that are highly selective (each value typically matches 1-2 events).
 * These are preferred as index entry points over kind/pubkey indices.
 */
const SELECTIVE_TAGS = new Set(['d', 'a', 'e', 'i']);

/**
 * Compute the _tags array for an event.
 * Each tag [name, value] becomes "name:value" in the array.
 * Used for the multi-entry *_tags index.
 *
 * @param {import('nostr-tools').Event} event
 * @returns {string[]}
 */
function computeTags(event) {
	if (!event.tags || event.tags.length === 0) return [];
	const tags = [];
	const seen = new Set();
	for (const tag of event.tags) {
		if (tag[0] && tag[1]) {
			const entry = `${tag[0]}:${tag[1]}`;
			if (!seen.has(entry)) {
				seen.add(entry);
				tags.push(entry);
			}
		}
	}
	return tags;
}

/**
 * Check if a Nostr event matches a set of NIP-01 tag filters.
 * Tag filters are keys starting with '#' whose values are arrays of acceptable values.
 * An event matches if for EACH tag filter, it has at least one tag with a matching value.
 *
 * @param {import('nostr-tools').Event} event
 * @param {object} filter
 * @returns {boolean}
 */
function matchesTags(event, filter) {
	for (const [key, values] of Object.entries(filter)) {
		if (!key.startsWith('#') || !Array.isArray(values) || values.length === 0) continue;
		const tagName = key.slice(1);
		const valueSet = new Set(values);
		const hasMatch = event.tags?.some((t) => t[0] === tagName && t[1] && valueSet.has(t[1]));
		if (!hasMatch) return false;
	}
	return true;
}

/**
 * Find the best selective tag filter to use as the _tags index entry point.
 * Returns { tagName, values, filterKey } or null if no selective tag filter found.
 *
 * @param {object} filter
 * @returns {{ tagName: string, values: string[], filterKey: string } | null}
 */
function findSelectiveTagFilter(filter) {
	let best = null;
	for (const [key, values] of Object.entries(filter)) {
		if (!key.startsWith('#') || !Array.isArray(values) || values.length === 0) continue;
		const tagName = key.slice(1);
		if (!SELECTIVE_TAGS.has(tagName)) continue;
		// Prefer the tag with fewest values (most selective per-value)
		if (!best || values.length < best.values.length) {
			best = { tagName, values, filterKey: key };
		}
	}
	return best;
}

// ============================================================================
// Write
// ============================================================================

/**
 * Write events to Dexie. Deduplicates by id.
 * For replaceable events (kind >= 10000 or kind >= 30000), keeps only the latest
 * by (kind, pubkey, dTag).
 *
 * Computes the _tags field for each event before writing.
 *
 * @param {import('nostr-tools').Event[]} events
 */
export async function putEvents(events) {
	if (!events || events.length === 0) return;

	const valid = events.filter(
		(e) =>
			e?.id &&
			typeof e.kind === 'number' &&
			// Discard encrypted app stacks (non-empty content means encrypted)
			!(e.kind === EVENT_KINDS.APP_STACK && e.content)
	);
	if (valid.length === 0) return;

	// Separate replaceable and non-replaceable per NIP-01:
	//   kind 0, 3        → replaceable (one per pubkey, no dTag)
	//   kind 10000-19999  → replaceable (one per kind+pubkey, no dTag)
	//   kind >= 30000     → parameterized-replaceable (one per kind+pubkey+dTag)
	const nonReplaceable = [];
	const replaceableByKey = new Map();

	for (const event of valid) {
		const isReplaceable =
			event.kind === 0 ||
			event.kind === 3 ||
			(event.kind >= 10000 && event.kind < 20000) ||
			event.kind >= 30000;

		if (isReplaceable) {
			// kind 0 and 3 have no dTag — key by kind+pubkey only
			const dTag = event.kind >= 30000
				? (event.tags?.find((t) => t[0] === 'd')?.[1] ?? '')
				: '';
			const key = `${event.kind}:${event.pubkey}:${dTag}`;
			const existing = replaceableByKey.get(key);
			if (!existing || event.created_at > existing.created_at) {
				replaceableByKey.set(key, event);
			}
		} else {
			nonReplaceable.push(event);
		}
	}

	// Compute _tags for all events
	const toPut = [...nonReplaceable, ...replaceableByKey.values()].map((event) => ({
		...event,
		_tags: computeTags(event)
	}));

	// For replaceable events, remove older versions before inserting
	await db.transaction('rw', db.events, async () => {
		if (replaceableByKey.size > 0) {
			// Collect unique (kind, pubkey) pairs
			const kindPubkeyPairs = new Map();
			for (const event of replaceableByKey.values()) {
				const kp = `${event.kind}:${event.pubkey}`;
				if (!kindPubkeyPairs.has(kp)) {
					kindPubkeyPairs.set(kp, [event.kind, event.pubkey]);
				}
			}

			// Single batch query for all candidates
			const existingEvents = await db.events
				.where('[kind+pubkey]')
				.anyOf([...kindPubkeyPairs.values()])
				.toArray();

			// Find IDs to delete: events that match a replaceable key but are not the new version
			const newEventIds = new Set([...replaceableByKey.values()].map((e) => e.id));
			const idsToDelete = [];
			for (const existing of existingEvents) {
				const dTag = existing.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
				const key = `${existing.kind}:${existing.pubkey}:${dTag}`;
				if (replaceableByKey.has(key) && !newEventIds.has(existing.id)) {
					idsToDelete.push(existing.id);
				}
			}

			if (idsToDelete.length > 0) {
				await db.events.bulkDelete(idsToDelete);
			}
		}
		await db.events.bulkPut(toPut);
	});
}

// ============================================================================
// Query — Universal NIP-01 → Dexie engine
// ============================================================================

/**
 * Query events from Dexie using a NIP-01 filter.
 *
 * Index selection strategy (in priority order):
 *   1. ids           → primary key lookup (most selective)
 *   2. Selective tag  → *_tags multi-entry index (#d, #a, #e, #i)
 *   3. kind+pubkey   → [kind+pubkey] compound index
 *   4. kind          → kind index
 *   5. pubkey        → pubkey index (anyOf)
 *   6. fallback      → full collection scan
 *
 * After index-based pre-filtering, remaining conditions (additional kinds,
 * authors, since/until, non-indexed tag filters) are applied in memory.
 * Results are sorted by created_at descending, then limited.
 *
 * @param {object} filter - NIP-01 filter object
 * @returns {Promise<import('nostr-tools').Event[]>}
 */
export async function queryEvents(filter) {
	let results;
	let usedTagIndex = null; // track which tag filter was used for index

	// === Index selection ===

	if (filter.ids?.length > 0) {
		// Strategy 1: primary key lookup
		results = await db.events.where('id').anyOf(filter.ids).toArray();
	} else {
		// Check for selective tag filters
		const selectiveTag = findSelectiveTagFilter(filter);

		if (selectiveTag) {
			// Strategy 2: multi-entry _tags index
			const tagEntries = selectiveTag.values.map((v) => `${selectiveTag.tagName}:${v}`);
			if (tagEntries.length === 1) {
				results = await db.events.where('_tags').equals(tagEntries[0]).toArray();
			} else {
				results = await db.events.where('_tags').anyOf(tagEntries).toArray();
			}
			usedTagIndex = selectiveTag.filterKey;
		} else if (filter.kinds?.length === 1 && filter.authors?.length === 1) {
			// Strategy 3: compound [kind+pubkey]
			results = await db.events
				.where('[kind+pubkey]')
				.equals([filter.kinds[0], filter.authors[0]])
				.toArray();
		} else if (filter.kinds?.length === 1) {
			// Strategy 4: kind index
			results = await db.events.where('kind').equals(filter.kinds[0]).toArray();
		} else if (filter.kinds?.length > 1) {
			// Multiple kinds — use anyOf on kind index
			results = await db.events.where('kind').anyOf(filter.kinds).toArray();
		} else if (filter.authors?.length > 0) {
			// Strategy 5: pubkey index
			results = await db.events.where('pubkey').anyOf(filter.authors).toArray();
		} else {
			// Strategy 6: full scan
			results = await db.events.toArray();
		}
	}

	// === In-memory post-filtering ===

	// Filter by kinds (if not already handled by index)
	if (filter.kinds?.length > 0) {
		// If we used tag index or pubkey index, kinds weren't filtered
		if (usedTagIndex || (!filter.ids && filter.authors?.length !== 1)) {
			const kindSet = new Set(filter.kinds);
			results = results.filter((e) => kindSet.has(e.kind));
		}
		// If kinds.length === 1 and we used strategy 3 or 4, already filtered
	}

	// Filter by authors (if not already handled by index)
	if (filter.authors?.length > 0) {
		const alreadyFiltered =
			filter.kinds?.length === 1 && filter.authors.length === 1 && !usedTagIndex;
		if (!alreadyFiltered) {
			const authorSet = new Set(filter.authors);
			results = results.filter((e) => authorSet.has(e.pubkey));
		}
	}

	// Time range filters
	if (filter.since !== undefined) {
		results = results.filter((e) => e.created_at >= filter.since);
	}
	if (filter.until !== undefined) {
		results = results.filter((e) => e.created_at <= filter.until);
	}

	// Tag filters (skip the one already used for index lookup)
	if (usedTagIndex) {
		// Apply all tag filters EXCEPT the one used for index
		results = results.filter((e) => {
			for (const [key, values] of Object.entries(filter)) {
				if (key === usedTagIndex) continue; // already handled by index
				if (!key.startsWith('#') || !Array.isArray(values) || values.length === 0) continue;
				const tagName = key.slice(1);
				const valueSet = new Set(values);
				const hasMatch = e.tags?.some(
					(t) => t[0] === tagName && t[1] && valueSet.has(t[1])
				);
				if (!hasMatch) return false;
			}
			return true;
		});
	} else {
		// Apply all tag filters in memory
		results = results.filter((e) => matchesTags(e, filter));
	}

	// Deduplicate (multi-entry index can return duplicates if event has multiple matching tag values)
	if (usedTagIndex) {
		const seen = new Set();
		results = results.filter((e) => {
			if (seen.has(e.id)) return false;
			seen.add(e.id);
			return true;
		});
	}

	// Sort by created_at descending
	results.sort((a, b) => b.created_at - a.created_at);

	// Apply limit
	if (filter.limit && filter.limit > 0) {
		results = results.slice(0, filter.limit);
	}

	return results;
}

/**
 * Query a single event from Dexie.
 *
 * @param {object} filter - NIP-01 filter
 * @returns {Promise<import('nostr-tools').Event | null>}
 */
export async function queryEvent(filter) {
	const results = await queryEvents({ ...filter, limit: 1 });
	return results[0] ?? null;
}

// ============================================================================
// Eviction — prune non-replaceable events to prevent unbounded growth
// ============================================================================

/**
 * Maximum number of non-replaceable events to keep per kind.
 * Replaceable events (kind 0, 3, 10000-19999, 30000+) are self-limiting
 * via putEvents dedup — only non-replaceable kinds accumulate.
 */
const EVICTION_LIMITS = {
	[EVENT_KINDS.COMMENT]: 500,
	[EVENT_KINDS.ZAP_REQUEST]: 200,
	[EVENT_KINDS.ZAP_RECEIPT]: 500,
	[EVENT_KINDS.FILE_METADATA]: 300,
	[EVENT_KINDS.RELEASE]: 500,
};

/** Default cap for any non-replaceable kind not listed above */
const DEFAULT_EVICTION_LIMIT = 500;

/**
 * Run eviction for all non-replaceable event kinds.
 * Keeps the newest N events per kind, deletes the rest.
 * Call on app startup (non-blocking).
 */
export async function evictOldEvents() {
	if (!browser) return;

	try {
		// Collect all distinct kinds in the store
		const allEvents = await db.events.orderBy('kind').uniqueKeys();
		const nonReplaceableKinds = allEvents.filter((kind) =>
			kind !== 0 &&
			kind !== 3 &&
			!(kind >= 10000 && kind < 20000) &&
			!(kind >= 30000)
		);

		for (const kind of nonReplaceableKinds) {
			const limit = EVICTION_LIMITS[kind] ?? DEFAULT_EVICTION_LIMIT;

			// Count events of this kind
			const count = await db.events.where('kind').equals(kind).count();
			if (count <= limit) continue;

			// Get the oldest events beyond the limit (sorted newest-first, skip the keepers)
			const toDelete = await db.events
				.where('[kind+created_at]')
				.between([kind, Dexie.minKey], [kind, Dexie.maxKey])
				.reverse()    // newest first
				.offset(limit)
				.primaryKeys();

			if (toDelete.length > 0) {
				await db.events.bulkDelete(toDelete);
				console.log(`[Dexie] Evicted ${toDelete.length} old kind ${kind} events (kept ${limit})`);
			}
		}
	} catch (err) {
		console.error('[Dexie] Eviction failed:', err);
	}
}

// Re-export liveQuery for convenience
export { liveQuery } from 'dexie';
