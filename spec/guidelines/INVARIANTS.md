---
description: Non-negotiable invariants — local-first, data flow, performance, security, lifecycle safety
alwaysApply: true
---

# Zapstore Webapp — Invariants

These are non-negotiable rules. Violating any invariant is a bug—no tradeoffs or exceptions.
See `QUALITY_BAR.md` for best practices that involve judgment.

## Local-First (FUNDAMENTAL)

These are the most critical invariants. Local-first is not optional.

- **UI NEVER waits for network** — always render from local data first.
- **Dexie (IndexedDB) is the source of truth** for the client UI. All data writes go to Dexie; liveQuery handles reactivity.
- **All events → Dexie → liveQuery → UI** — regardless of source (server seed, relay stream, one-shot fetch). There is no other data path.
- **Offline mode is fully functional** — the app works fully offline; all cached data and routes remain accessible without network.
- **Online status determines fetch behavior** — skip relay connections when offline.
- Network failures degrade gracefully with clear feedback (offline banner).
- **UI MUST update reactively** when local or background data changes—no full page reload required. Dexie liveQuery ensures new data flows into the view immediately.

## Data Flow

- **Server polls, client streams.** The server polls two catalog relays every 60 seconds to maintain its seed data cache. The client maintains persistent relay connections for live updates.
- **NIP-01 filters are the universal query language.** The same filter objects are used to query relays, the server cache, and IndexedDB. No custom query APIs.
- **`queryEvents(filter)` is the single client-side query primitive.** All data queries — inside liveQuery, for one-shot reads, for relationship resolution — go through this function. No raw Dexie `.where()` chains in application code.
- **No REST API for data refresh.** The client gets live data from relay connections, not from server API endpoints. REST APIs exist only for initial page seed data delivery via `+page.server.js`.

## Performance

- First Contentful Paint (FCP) must be under 1.5 seconds on 3G.
- Time to Interactive (TTI) must be under 3 seconds on 3G.
- Pre-rendered pages must not require JavaScript for initial content.
- Client-side navigation must feel instant (<100ms perceived).
- **Loading states and skeletons must be minimal.** First paint must show real content from local data or prerender whenever possible. Use loading spinners or skeletons only where necessary (e.g. true first-ever empty state, explicit search-in-flight). Avoid the classic SPA pattern of loading/skeletons everywhere.

## Data Fetching

- Prerendered content displays immediately; relay connections provide live updates in the background.
- All one-shot relay queries must have a timeout (default 5 seconds).
- **EOSE + 300ms rule:** One-shot relay subscriptions (search, load-more, social) must resolve at first EOSE + 300ms grace period, or timeout fallback (default 5s). This prevents hanging on slow relays while still collecting late-arriving events. Never wait indefinitely.
- **Persistent relay subscriptions** stay open after EOSE for live updates. Events are buffered (100ms) and batch-written to Dexie. **All subscriptions MUST include `limit`** to cap the initial backfill — UI loads progressively via pagination/load-more. Unbounded subscriptions are a bug.
- **No N+1 queries.** Never issue a query inside a loop. Collect all keys first, issue one batch query, then distribute results in memory. This applies to relay subscriptions, server cache queries, and Dexie `queryEvents` calls. Each relay round-trip or IndexedDB transaction has per-call overhead.
- Fresh data is written to Dexie; liveQuery updates UI reactively without blocking.

## IndexedDB Indices

- The `*_tags` multi-entry index must be used for NIP-01 tag-based queries. Selective tags (`#d`, `#a`, `#e`, `#i`) should use the `_tags` index as the primary entry point. Non-selective tags (`#f`, `#p`) are filtered in memory after index-based pre-filtering.
- The `_tags` field must be computed by `putEvents` on every write.
- Compound indices `[kind+created_at]` and `[kind+pubkey]` must be maintained for field-based queries.

## Storage Management

- **Schema changes nuke the database.** Bump `SCHEMA_VERSION` in `dexie.js` → database deleted → fresh start. No migrations. Relay subscriptions and seed events repopulate immediately.
- **Replaceable events are self-limiting.** `putEvents` handles NIP-01 replaceability: kind 0/3 (one per pubkey), kinds 10000-19999 (one per kind+pubkey), kinds 30000+ (one per kind+pubkey+dTag). Older versions are deleted on write.
- **Non-replaceable events are capped per kind.** `evictOldEvents()` runs on app startup and prunes old events beyond the cap (keeping newest). This prevents unbounded IndexedDB growth.
- **All relay subscriptions MUST include `limit`.** Unbounded subscriptions that dump entire relay contents into IndexedDB are a bug.
- Eviction must not break the app — graceful degradation to network fetch.

## Search

- Search is ALWAYS a live relay query (NIP-50 full-text search) — never pre-rendered or from local cache.
- Search MUST show a loading spinner while querying.
- Search queries use NIP-50 via the client-side relay pool (direct to catalog relays).
- Search results are written to Dexie for back-navigation only.

## UI Safety

- UI rendering must remain responsive under network failure.
- The UI must never block on relay connections or storage operations.
- All async work must be cancellable and lifecycle-safe (cleanup on unmount).
- All data-dependent UI must have explicit states: loading, empty, success, error.
- Silent failures are unacceptable—users must know when something fails.
- Where a loading state is required, use skeletons to preserve layout; but prefer showing real content from cache so loading states are rare.

## Async Discipline

- Dexie liveQuery subscriptions, relay connections, and any abort controllers must be cleaned up on component destroy.
- All promises must handle rejection (no unhandled promise rejections).
- Concurrent requests must be deduplicated where appropriate.
- **Server-side polling is intentional** — the server polls relays on a 60-second interval. This is the designed data refresh mechanism, not an anti-pattern. Client-side UI polling remains prohibited.

## Security

- User secrets (nsec, NWC strings) must never be logged or sent to server.
- NIP-07 extension interactions must be user-initiated.
- External links must use `rel="noopener noreferrer"`.
- User-generated content must be sanitized before rendering as HTML.

## Data Robustness

- Parsing unknown, missing, or future event tags must not crash the app.
- Partial or invalid Nostr events must degrade gracefully.
- Malformed relay responses must not break the UI.

## Lifecycle Safety

- Svelte `$effect` cleanup functions must cancel subscriptions and liveQuery observables.
- Component destroy must clean up all subscriptions (liveQuery, relay connections, abort controllers).
- Service worker updates must not break active sessions.

## SEO

- App detail pages must be fully pre-rendered with complete metadata.
- Pages must have appropriate `<title>`, `<meta description>`, and Open Graph tags.
- URLs must be stable and human-readable.

## Prerendering

- All app pages are prerendered at build time via SvelteKit.
- Prerendered HTML must be valid and complete.
- Build failures must not deploy broken pages.

## PWA

- The app MUST be a full Progressive Web App: valid web app manifest and a compliant service worker.
- Manifest: name, short_name, start_url, display, icons, theme_color (and any required fields) must be present and correct.
- Service worker: must handle install (precache), activate (clean old caches, claim), and fetch (cache-first for assets, network-first with cache fallback for documents). Scope must be the app origin.
- **Fully working offline:** Cached routes and local data (Dexie / IndexedDB) must allow the app to function fully offline—no network required for previously visited content. Show an offline indicator when appropriate.
