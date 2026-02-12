import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NostrEvent } from 'nostr-tools';
import { EVENT_KINDS, PLATFORM_FILTER } from '$lib/config';
import { parseApp, parseRelease, type App, type Release } from './models';

type EventRow = {
	id: string;
	pubkey: string;
	created_at: number;
	kind: number;
	tags: string;
	content: string;
	sig: string;
};

type AppRow = EventRow & {
	d_tag: string;
};

export type ServerAppsResult = {
	apps: App[];
	releases: Release[];
	nextCursor: number | null;
	seedEvents: NostrEvent[];
};

type StatementLike<T = unknown> = {
	all(...params: unknown[]): T[];
	get(...params: unknown[]): T | null;
};

type DatabaseLike = {
	query<T = unknown>(sql: string): StatementLike<T>;
	close(): void;
};

let db: DatabaseLike | null = null;

function dynamicImport(moduleName: string): Promise<unknown> {
	// Keep module resolution runtime-only so Node build does not try to load bun:* modules.
	const importer = new Function('m', 'return import(m)') as (m: string) => Promise<unknown>;
	return importer(moduleName);
}

function getDbPath(): string {
	const configured = process.env.CATALOG_DB_PATH?.trim();
	const candidate = configured && configured.length > 0 ? configured : 'relay.db';
	const absolute = resolve(process.cwd(), candidate);

	if (!existsSync(absolute)) {
		throw new Error(
			`[ServerDB] SQLite file not found at "${absolute}". Set CATALOG_DB_PATH or place relay.db at project root.`
		);
	}

	return absolute;
}

async function getDb(): Promise<DatabaseLike> {
	if (db) return db;

	const dbPath = getDbPath();
	// Bun runtime: use bun:sqlite (requested).
	if (typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined') {
		const bunModule = (await dynamicImport('bun:sqlite')) as {
			Database: new (path: string, options: { readonly: boolean; create: boolean }) => DatabaseLike;
		};
		db = new bunModule.Database(dbPath, { readonly: true, create: false });
		return db;
	}

	// Node runtime (SvelteKit build/prerender path): use native node:sqlite.
	const nodeSqlite = (await dynamicImport('node:sqlite')) as {
		DatabaseSync: new (path: string, options: { readOnly: boolean }) => {
			prepare: (sql: string) => {
				all: (...params: unknown[]) => unknown[];
				get: (...params: unknown[]) => unknown;
			};
			close: () => void;
		};
	};
	const nativeDb = new nodeSqlite.DatabaseSync(dbPath, { readOnly: true });
	db = {
		query<T = unknown>(sql: string): StatementLike<T> {
			const statement = nativeDb.prepare(sql);
			return {
				all: (...params: unknown[]) => statement.all(...params) as T[],
				get: (...params: unknown[]) => (statement.get(...params) as T | null) ?? null
			};
		},
		close(): void {
			nativeDb.close();
		}
	};
	return db;
}

function parseTags(rawTags: string): string[][] {
	try {
		const parsed = JSON.parse(rawTags) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter((tag): tag is unknown[] => Array.isArray(tag))
			.map((tag) => tag.map((item) => String(item)));
	} catch {
		return [];
	}
}

function rowToEvent(row: EventRow): NostrEvent {
	return {
		id: row.id,
		pubkey: row.pubkey,
		created_at: row.created_at,
		kind: row.kind,
		tags: parseTags(row.tags),
		content: row.content,
		sig: row.sig
	} as NostrEvent;
}

function getFirstTagValue(event: NostrEvent, tagName: string): string | null {
	const tag = event.tags.find((t) => t[0] === tagName && typeof t[1] === 'string');
	return tag?.[1] ?? null;
}

function getReleaseIdentifier(event: NostrEvent): string | null {
	const iTag = getFirstTagValue(event, 'i');
	if (iTag) return iTag;

	// Fallback for releases that only carry d like "com.app.id@1.2.3".
	const dTag = getFirstTagValue(event, 'd');
	if (!dTag) return null;
	const [identifier] = dTag.split('@');
	return identifier || null;
}

function dedupeEventsById(events: NostrEvent[]): NostrEvent[] {
	const seen = new Set<string>();
	const result: NostrEvent[] = [];
	for (const event of events) {
		if (seen.has(event.id)) continue;
		seen.add(event.id);
		result.push(event);
	}
	return result;
}

function buildInPlaceholders(count: number): string {
	return new Array(count).fill('?').join(',');
}

export async function fetchAppsByReleases(limit = 20, until?: number): Promise<ServerAppsResult> {
	const database = await getDb();
	const releaseQuery = until === undefined
		? database.query<EventRow>(
				`SELECT id, pubkey, created_at, kind, json(tags) AS tags, content, sig
				 FROM events
				 WHERE kind = ?
				 ORDER BY created_at DESC, id ASC
				 LIMIT ?`
		  )
		: database.query<EventRow>(
				`SELECT id, pubkey, created_at, kind, json(tags) AS tags, content, sig
				 FROM events
				 WHERE kind = ?
				   AND created_at <= ?
				 ORDER BY created_at DESC, id ASC
				 LIMIT ?`
		  );

	const releaseRows =
		until === undefined
			? releaseQuery.all(EVENT_KINDS.RELEASE, limit)
			: releaseQuery.all(EVENT_KINDS.RELEASE, until, limit);

	const releaseEvents = releaseRows.map(rowToEvent);
	if (releaseEvents.length === 0) {
		return { apps: [], releases: [], nextCursor: null, seedEvents: [] };
	}

	const releaseRefs = releaseEvents.map((event) => ({
		release: event,
		identifier: getReleaseIdentifier(event)
	}));
	const identifiers = Array.from(
		new Set(releaseRefs.map((ref) => ref.identifier).filter((id): id is string => Boolean(id)))
	);

	const platformTag = PLATFORM_FILTER['#f']?.[0];
	let appEvents: NostrEvent[] = [];

	if (identifiers.length > 0) {
		const inClause = buildInPlaceholders(identifiers.length);
		const sql = `SELECT e.id, e.pubkey, e.created_at, e.kind, json(e.tags) AS tags, e.content, e.sig, d.value AS d_tag
			FROM events e
			INNER JOIN tags d ON d.event_id = e.id AND d.key = 'd'
			WHERE e.kind = ?
			  AND d.value IN (${inClause})
			  ${platformTag ? `AND EXISTS (
					SELECT 1 FROM tags f
					WHERE f.event_id = e.id
					  AND f.key = 'f'
					  AND f.value = ?
			  )` : ''}
			ORDER BY e.created_at DESC, e.id ASC`;

		const params: unknown[] = [EVENT_KINDS.APP, ...identifiers];
		if (platformTag) params.push(platformTag);

		const appRows = database.query<AppRow>(sql).all(...params);
		appEvents = appRows.map(rowToEvent);
	}

	// Latest replaceable app event for (pubkey, d) and for d fallback.
	const latestByPubkeyAndD = new Map<string, NostrEvent>();
	const latestByDOnly = new Map<string, NostrEvent>();
	for (const appEvent of appEvents) {
		const dTag = getFirstTagValue(appEvent, 'd');
		if (!dTag) continue;

		const key = `${appEvent.pubkey}:${dTag}`;
		if (!latestByPubkeyAndD.has(key)) {
			latestByPubkeyAndD.set(key, appEvent);
		}
		if (!latestByDOnly.has(dTag)) {
			latestByDOnly.set(dTag, appEvent);
		}
	}

	const apps: App[] = [];
	const selectedAppEvents: NostrEvent[] = [];
	const seenAppKeys = new Set<string>();

	for (const { release, identifier } of releaseRefs) {
		if (!identifier) continue;

		const exactKey = `${release.pubkey}:${identifier}`;
		const appEvent = latestByPubkeyAndD.get(exactKey) ?? latestByDOnly.get(identifier);
		if (!appEvent) continue;

		const appKey = `${appEvent.pubkey}:${identifier}`;
		if (seenAppKeys.has(appKey)) continue;
		seenAppKeys.add(appKey);

		apps.push(parseApp(appEvent));
		selectedAppEvents.push(appEvent);
	}

	const releases = releaseEvents.map(parseRelease);
	const lastRelease = releaseEvents[releaseEvents.length - 1];
	const nextCursor = releaseEvents.length === limit && lastRelease ? lastRelease.created_at - 1 : null;
	const seedEvents = dedupeEventsById([...releaseEvents, ...selectedAppEvents]);

	return { apps, releases, nextCursor, seedEvents };
}

export async function fetchApp(pubkey: string, identifier: string): Promise<App | null> {
	const database = await getDb();
	const platformTag = PLATFORM_FILTER['#f']?.[0];
	const query = database.query<EventRow>(
		`SELECT e.id, e.pubkey, e.created_at, e.kind, json(e.tags) AS tags, e.content, e.sig
		 FROM events e
		 INNER JOIN tags d ON d.event_id = e.id AND d.key = 'd'
		 WHERE e.kind = ?
		   AND e.pubkey = ?
		   AND d.value = ?
		   ${platformTag ? `AND EXISTS (
				SELECT 1 FROM tags f
				WHERE f.event_id = e.id
				  AND f.key = 'f'
				  AND f.value = ?
		   )` : ''}
		 ORDER BY e.created_at DESC, e.id ASC
		 LIMIT 1`
	);

	const row = platformTag
		? query.get(EVENT_KINDS.APP, pubkey, identifier, platformTag)
		: query.get(EVENT_KINDS.APP, pubkey, identifier);
	if (!row) return null;

	return parseApp(rowToEvent(row));
}

export async function fetchLatestReleaseForApp(pubkey: string, identifier: string): Promise<Release | null> {
	const database = await getDb();
	const query = database.query<EventRow>(
		`SELECT e.id, e.pubkey, e.created_at, e.kind, json(e.tags) AS tags, e.content, e.sig
		 FROM events e
		 WHERE e.kind = ?
		   AND e.pubkey = ?
		   AND (
			 EXISTS (
				SELECT 1 FROM tags i
				WHERE i.event_id = e.id
				  AND i.key = 'i'
				  AND i.value = ?
			 )
			 OR EXISTS (
				SELECT 1 FROM tags d
				WHERE d.event_id = e.id
				  AND d.key = 'd'
				  AND d.value LIKE ?
			 )
		   )
		 ORDER BY e.created_at DESC, e.id ASC
		 LIMIT 1`
	);

	const row = query.get(EVENT_KINDS.RELEASE, pubkey, identifier, `${identifier}@%`);
	if (!row) return null;

	return parseRelease(rowToEvent(row));
}

export function closeServerDb(): void {
	if (db) {
		db.close();
		db = null;
	}
}
