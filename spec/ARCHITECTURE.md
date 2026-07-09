---
description: Core architecture — local-first data flow, Dexie/liveQuery, relay patterns, universal loads, PWA
globs: ["src/lib/**", "src/routes/**", "src/service-worker.js", "src/app.html"]
alwaysApply: false
---

# Zapstore Webapp — Architecture

## Goals (non-negotiable)

- **Minimize loading states and skeletons.** Avoid the classic SPA pattern of spinners or skeletons everywhere. They have a place (e.g. true first-ever empty state, explicit search-in-flight) but must be minimal. First paint should show **real content** from local data (IndexedDB) or server-rendered seed data.
- **Static content is prerendered.** Blog, docs, terms, enterprise, and other marketing pages are fully prerendered at build time. Dynamic catalog pages (`/apps`, `/stacks`, detail pages, profiles) are server-rendered at runtime with seed data from bounded SSR relay queries — not prerendered at build time.
- **UI always updates reactively.** When local data or background relay data changes, the UI MUST update without full page reload. Use reactive state (e.g. Svelte runes, Dexie liveQuery) so new data flows into the view immediately.
- **Full PWA.** The app is a full Progressive Web App: valid web app manifest, compliant service worker (install, fetch, activate, scope), and offline support for cached routes and local data.

## Core Principle: Local-First

**Local-first is fundamental.** Browse/detail/social/profile/community/studio UI always renders from local data first.
Network is optional for those surfaces—used only for background refresh. Search is the explicit live-relay exception.

```
┌────────────────────────────────────────────────────────────────┐
│                     LOCAL-FIRST PRINCIPLE                       │
│                                                                 │
│  1. UI renders IMMEDIATELY from local data (Dexie / IndexedDB) │
│  2. Network fetch happens IN THE BACKGROUND                     │
│  3. User NEVER waits for network on return visits               │
│  4. App works FULLY OFFLINE with cached data                    │
│  5. Fresh data updates UI REACTIVELY via liveQuery              │
└────────────────────────────────────────────────────────────────┘
```

This is non-negotiable for browse/detail/social/profile/community/studio surfaces. Explicit user-initiated relay search is the exception: search is network-bound, shows a loading state, and renders the relay response directly.

## Stack

- **Framework:** SvelteKit 2 with Svelte 5 (runes)
- **Styling:** Tailwind CSS 4
- **Nostr:** nostr-tools
- **Client storage:** Dexie.js (IndexedDB) with `liveQuery` for reactive queries
- **Server seed queries:** Bounded one-shot relay queries during SSR
- **Runtime:** Bun runs the SvelteKit server at apex
- **Assets:** Static assets can be served from CDN via `PUBLIC_ASSET_BASE`

## Data Layer

Nostr events are the universal data format from end to end. Every layer stores and returns raw Nostr events. **NIP-01 filters are the universal query language** — the same filter objects are used to query relays, SSR seed loads, and IndexedDB.

### Two-Tier Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 1 — SERVER (seed data)                                     │
│                                                                   │
│  Universal +page.js loads run bounded relay seed queries:        │
│    • wss://relay.zapstore.dev                                    │
│    • wss://relay.vertexlab.io                                    │
│                                                                   │
│  No timers, no warmup cache, no polling.                         │
│  Serves pages hydrated with seed events from relay results.      │
│  Purpose: near-instant first paint with real data.               │
└─────────────────────────────────────────────────────────────────┘
                           │
                     seed events
                     (page payload)
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Dexie (IndexedDB)                            │
│               Single client-side source of truth                 │
│                                                                   │
│  Non-search display events — regardless of source — go here.     │
│  liveQuery reactively updates UI from this store.                │
└─────────────────────────────────────────────────────────────────┘
                           ▲
                     live events
                     (relay stream)
                           │
┌─────────────────────────────────────────────────────────────────┐
│  TIER 2 — CLIENT (live updates)                                  │
│                                                                   │
│  Client maintains persistent WebSocket connections to relays.    │
│  Receives events as they are published.                          │
│  Writes non-search display events directly to Dexie.             │
│  Handles reconnection and retry.                                 │
│  Also used for one-shot queries: search, load-more, social.     │
└─────────────────────────────────────────────────────────────────┘
```

**The universal rule:** Any non-search Nostr event used for display, from any source (server seed, relay stream, one-shot hydration), is written directly to Dexie via `putEvents()`. liveQuery subscribers react automatically. Search persists hits to Dexie for back-navigation, but renders the live relay response as-is.

### Server: SSR Seed Queries

The server does not poll and does not maintain an in-memory event cache. During SSR, universal `+page.js` loads call the purpleweb server facade, which performs bounded one-shot relay queries and returns raw Nostr events as seed data.

```
┌─────────────────────────────────────────────────────────────┐
│    Upstream Relays (relay.zapstore.dev, relay.vertexlab.io)   │
│                  bounded one-shot SSR queries                 │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              purpleweb/server.js facade                       │
│         NIP-01 relay queries with timeout + EOSE grace        │
│         No persistent cache, no warmup, no timers             │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
                   +page.js (SSR path)
                 returns seed events
            (server-rendered at runtime)
```

- **No polling:** The server never uses repeated relay polling timers for catalog refresh.
- **No warmup cache:** There is no startup warmup or long-lived server event store.
- **No persistent WebSocket subscriptions:** Server-side relay access is one-shot only: connect, collect until EOSE + grace or timeout, close.
- **No SQLite / relay.db:** There is no server-side database. Server seed data exists only for the lifetime of the SSR request.
- **Seed events:** Universal `+page.js` load functions call `src/lib/purpleweb/server.js` during SSR and return raw Nostr events in the page payload. See "Universal Loads" below.

### Client: Dexie (IndexedDB) with liveQuery

The client uses **Dexie.js** as its single reactive data layer. There is no separate in-memory EventStore — Dexie is both persistence and reactivity.

```
┌─────────────────────────────────────────────────────────────┐
│                   Dexie.js (IndexedDB)                        │
│         Persistent, reactive via liveQuery                   │
│         Single client-side source of truth                   │
└─────────────────────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
     liveQuery (reactive)      Writes from non-search display paths
     UI subscribes & reacts    seed / relay stream / hydration
```

- **Dexie liveQuery:** Observable queries that automatically re-fire when underlying data changes. Any write to Dexie (from server seed, relay stream, or one-shot hydration) triggers subscribers to re-query. No manual invalidation.
- **Svelte integration:** Dexie's `liveQuery` returns an Observable. In Svelte 5, subscribe in a component `$effect` and assign to `$state`; the effect's cleanup return unsubscribes automatically.
- **No EventStore:** Dexie replaces both persistence and in-memory reactive state.
- **NIP-01 query engine:** `queryEvents(filter)` translates NIP-01 filters to efficient Dexie queries. This is the single client-side query primitive for Nostr events — inside liveQuery, for one-shot reads, for joins. Higher-level purpleweb modules call `queryEvents` internally; application code consumes those helpers and must not use raw Dexie `.where()` chains.

### Client: purpleweb (local-first runtime)

`src/lib/purpleweb/` is the internal runtime for model-centric, local-first relay data. It owns relay-backed UI data across browse, detail, social, profile, community, studio, and modal surfaces, and enforces the Dexie → liveQuery → UI path for all non-search display data.

```
┌──────────────────────────────────────────────────────────────┐
│  purpleweb (relay-backed data boundary)                      │
│                                                              │
│  Models: registered specs + parsers (wraps nostr/models.js)  │
│  Reads:  queryEvents / liveQuery via storage/query.js        │
│  Writes: sync/hydrate relay results → putEvents              │
│  Svelte: model-centric query helpers (liveQuery-backed)      │
└──────────────────────────────────────────────────────────────┘
         │ reads                          │ hydrates
         ▼                                ▼
     Dexie                          purpleweb/sync/*
                                         (relay I/O)
```

- **Reads are local except search.** Browse/detail/social/profile/community/studio data comes from Dexie through purpleweb helpers or their liveQuery subscriptions. Relay hydration responses are never rendered directly. Search results intentionally render the live relay response as-is.
- **Hydration is background-only.** `hydrateFilters`, sync helpers, and social/profile/community/studio hydration helpers write relay results to Dexie; UI updates reactively from local storage.
- **Batch relationships.** `queryModelGraph` and `queryAddressableSocial` collect keys first and issue batch queries — no query-in-loop for profiles, comments, zaps, or labels.
- **Consumers describe models/roots**, not relay filters, storage queries, hydration toggles, or subscription lifecycles.
- **Profiles are first-class purpleweb data.** Kind-0 profile display uses purpleweb liveQuery helpers, not component-owned `fetchProfile()` state.
- **Imports:** Routes, components, stores, and `src/lib/services/` do not import purpleweb storage/sync internals and do not call relay primitives directly. They consume exported purpleweb helpers such as query helpers, hydration helpers, or publishing helpers.
- **Scope:** Anything that fetches from relays for app UI goes through purpleweb. HTTP APIs for non-relay concerns and cross-cutting UI state (auth, online, preferences) stay outside purpleweb.

### Client: Persistent Relay Connections

The purpleweb sync runtime maintains **persistent WebSocket connections** to the catalog relays for live event updates. This is the "updates" data flow.

```
┌─────────────────────────────────────────────────────────────┐
│  purpleweb sync relay pool (persistent connections)            │
│                                                                │
│  Catalog relays:   relay.zapstore.dev, relay.vertexlab.io     │
│  Forum relay:      relay.zapstore.dev (kind 11 + comments)    │
│                                                                │
│  Subscriptions (all with bounded limit — never unbounded):     │
│    • Apps (kind 32267) with platform filter                   │
│    • Releases (kind 30063)                                    │
│    • Stacks (kind 30267) with platform filter                 │
│                                                                │
│  onevent → batch buffer (100ms) → putEvents → Dexie           │
│  Reconnects automatically on disconnect.                       │
└─────────────────────────────────────────────────────────────┘
```

- **Batched writes:** Incoming relay events are buffered for 100ms and written to Dexie in batches. This prevents per-event transaction overhead and reduces liveQuery re-evaluation frequency.
- **Reconnection:** nostr-tools SimplePool handles reconnection automatically.
- **One-shot hydration:** Load-more and social features (comments, zaps) use one-shot relay queries that close after EOSE + grace period, write to Dexie, then update UI via liveQuery.
- **Search exception:** NIP-50 search also uses one-shot relay queries, but renders the relay response as-is and writes hits to Dexie only for back-navigation/cache benefit.

### NIP-01 Filters as Universal Query DSL

The same NIP-01 filter object is used across every layer:

| Layer | NIP-01 filter used for |
|-------|----------------------|
| SSR seed queries | What to embed in the first server-rendered response |
| Client relay subscriptions | What to subscribe to for live updates |
| Client one-shot queries | Search, load-more, social/profile hydration |
| Dexie liveQuery | What to show on each page |

Every data need is expressed as one or more NIP-01 filters. No custom query languages, no SQL-style joins. When data from one query informs another (e.g. release events → extract `#a` tags → query matching apps), that's just two sequential NIP-01 queries — exactly how a Nostr client talks to a relay.

```javascript
// Inside liveQuery — two NIP-01 queries, no joins
const releases = await queryEvents({ kinds: [30063], limit: 200 });
const appRefs = extractRefs(releases); // read #a tags
const apps = await queryEvents({ kinds: [32267], '#d': appRefs.ids, '#f': ['android-arm64-v8a'] });
```

### End-to-End Data Flow

```
Upstream relays (relay.zapstore.dev, relay.vertexlab.io)
      │                              │
      │ SSR one-shot seed queries    │ persistent client connections
      ▼                              ▼
+page.js seed events ──→ putEvents ──→ Dexie ──→ liveQuery ──→ UI
                                     ▲
purpleweb sync ──→ events ──→ putEvents ─┘
```

**Bounded relay seed queries on the server. One reactive store on the client. NIP-01 filters as the lingua franca throughout. Search is the explicit direct-render exception.**

### IndexedDB Schema & Indices

Performance-critical. The Dexie schema uses a **multi-entry `*_tags` index** for efficient NIP-01 tag-based queries alongside standard field indices.

```javascript
db.version(SCHEMA_VERSION).stores({
  events: 'id, kind, pubkey, created_at, [kind+created_at], [kind+pubkey], *_tags'
});
```

**Schema changes nuke the database.** There are no migrations. Bump `SCHEMA_VERSION` in `dexie.js` and the database is deleted on next load. Relay subscriptions and seed events repopulate it immediately. This keeps the schema code simple and the upgrade path zero-risk.

| Index | Purpose | Example query |
|-------|---------|---------------|
| `id` (PK) | Lookup by event ID | `{ ids: ['abc...'] }` |
| `kind` | Filter by event kind | `{ kinds: [32267] }` |
| `pubkey` | Filter by author | `{ authors: ['abc...'] }` |
| `created_at` | Time-range queries | `{ since: ..., until: ... }` |
| `[kind+created_at]` | Kind + time range | `{ kinds: [30063], until: ... }` |
| `[kind+pubkey]` | Specific author's events by kind | `{ kinds: [32267], authors: ['abc...'] }` |
| `*_tags` | **Multi-entry tag index** | `{ '#d': ['com.example'] }`, `{ '#a': ['32267:pk:id'] }` |

**`_tags` field:** A denormalized array computed on write. Each tag `[name, value]` becomes `"name:value"` in the `_tags` array. Example: `['d:com.example', 'f:android-arm64-v8a', 'a:32267:pk:id']`.

**Multi-entry index `*_tags`:** Dexie creates one index entry per array element. Querying `db.events.where('_tags').equals('d:com.example')` hits the index directly — no scan needed.

### queryEvents: Index Selection Strategy

`queryEvents(filter)` is the single NIP-01 → Dexie query engine. It selects the optimal index based on filter shape:

1. **`ids`** → Use `id` primary key (most selective, O(1) per id)
2. **Selective tag filters** (`#d`, `#a`, `#e`, `#i` with ≤ few values) → Use `_tags` multi-entry index. These tags identify specific entities and are highly selective.
3. **`kinds.length === 1 && authors.length === 1`** → Use `[kind+pubkey]` compound index
4. **`kinds.length === 1`** → Use `kind` index
5. **`authors` only** → Use `pubkey` index with `anyOf`
6. **Else** → Full collection scan (rare, only for truly open-ended queries)

After index-based pre-filtering, remaining filter conditions (additional kinds, authors, since/until, non-indexed tag filters like `#f`) are applied in memory. Results are sorted by `created_at` descending and limited.

**Non-selective tags** like `#f` (platform) are always filtered in memory, never used as the index entry point — they match too many events to be useful as an index.

### Relay Subscription Patterns

**One-shot queries** (search, load-more, social/profile/community/studio hydration):

1. Open a `subscribeMany` subscription with one or more filters.
2. Collect events via `onevent`.
3. On `oneose` (End of Stored Events), start a **300ms grace timer** to catch late-arriving events.
4. When the grace timer fires, close the subscription and resolve with collected events.
5. A hard **timeout** (default 5s) acts as a safety net if EOSE never arrives.

```
subscribe → collect events → EOSE → +300ms grace → resolve → putEvents → Dexie
                                  ↑ timeout (5s) fallback
```

Search uses the same bounded subscription lifecycle, but renders the collected relay response directly. It still writes hits to Dexie for back-navigation/cache benefit after the response is available. This exception is limited to explicit user-initiated NIP-50/full-text search result lists; profile enrichment, app detail hydration, social threads, studio data, and modal lookups remain Dexie/liveQuery display paths.

**Persistent subscriptions** (live updates):

1. Open a `subscribeMany` subscription with catalog filters. **Always include `limit`** to cap the initial backfill — UI loads progressively via pagination/load-more.
2. Receive events via `onevent` continuously.
3. Buffer events for 100ms, then batch `putEvents` to Dexie.
4. Never close — subscription stays open after EOSE for live updates.
5. SimplePool handles reconnection automatically.

### Batch Queries — No N+1

**Never query inside a loop.** Every code path that resolves related data must collect all keys first and issue a **single** batch query, then distribute results in memory.

```
❌ BAD — N+1 (one query per item)
for (const ref of stack.appRefs) {
  const result = await queryEvents({ kinds: [32267], authors: [ref.pubkey], '#d': [ref.id] });
}

✅ GOOD — batch (one query for all items)
const apps = await queryEvents({ kinds: [32267], '#d': allIds });
const byKey = new Map(apps.map(e => [dTag(e), e]));
```

This applies equally to Dexie queries (`queryEvents`), relay subscriptions, and SSR seed queries.

## Universal Loads (`+page.js`)

Catalog pages use **universal load functions** (`+page.js`), not server-only loads (`+page.server.js`). This is critical for offline support: universal loads run in the browser during client-side navigation, so **no server round-trip is needed** when the user navigates between pages.

```
┌───────────────────────────────────────────────────────────────────┐
│                     UNIVERSAL LOAD PATTERN                         │
│                                                                    │
│  Every catalog +page.js has this shape:                           │
│                                                                    │
│    if (browser) return { seedEvents: [] };  // ← client path      │
│                                                                    │
│    // SSR path: dynamic-import server module, query relays        │
│    // SSR only: import server module, run bounded seed queries    │
│    return { seedEvents: [...] };                                │
│                                                                    │
│  SSR (first visit / hard refresh):                                │
│    browser = false → dynamic-import server.js → query relays      │
│    → seed events embedded in HTML → instant first paint            │
│                                                                    │
│  Client-side navigation (clicking links):                         │
│    browser = true → return empty immediately → no server call     │
│    → component mounts → liveQuery reads Dexie → instant render    │
│                                                                    │
│  Offline:                                                          │
│    browser = true → return empty → Dexie provides all data        │
│    → works identically to online client-side nav                  │
└───────────────────────────────────────────────────────────────────┘
```

**Why not `+page.server.js`?** Server-only loads force SvelteKit to fetch `/__data.json` from the server on every client-side navigation. When offline, that fetch fails and the app breaks. Universal loads eliminate this — the load runs in the browser, returns empty, and Dexie handles the rest.

**Dynamic imports for server modules:** The `await import('$lib/purpleweb/server.js')` is behind the `if (browser)` guard. Since `browser` is replaced at build time by Vite (`true` in client build, `false` in SSR build), the server import is dead-code-eliminated from the client bundle entirely.

**Detail pages (`apps/[appid]`, `stacks/[naddr]`, `profile/[npub]`):** Same pattern, but components also **fall back to Dexie** when seed data is empty (client-side nav). They decode the URL param, query local storage, and parse events locally.

**SSR seed misses return empty, never an error.** If the SSR seed query doesn't return the requested event, return `{ seedEvents: [] }` (not an error). The component always has a relay fallback — returning an error from the load function prevents that fallback from running.

### When does the server load code run?

| Scenario | Load runs on | SSR seed query runs? |
|----------|-------------|----------------------|
| User types URL directly (first visit) | Server (SSR) | Yes — seed events in HTML |
| Hard refresh (Ctrl+R) | Server (SSR) | Yes — seed events in HTML |
| Search engine / social preview crawl | Server (SSR) | Yes — seed events in HTML |
| User clicks a link (client-side nav) | Browser | **No** — returns empty instantly |
| User navigates back/forward | Browser | **No** — returns empty instantly |
| Offline (any navigation) | Browser | **No** — Dexie provides data |

After the initial SSR visit, the server is never called again until the user closes and reopens the tab (or hard refreshes).

## Rendering Strategy

Every render path prioritizes local data:

### Initial Visit (New User)

1. `+page.js` runs on server → dynamic-imports `server.js` → runs bounded relay seed queries → seed events in HTML → **instant content**
2. SvelteKit hydrates
3. Seed events written to Dexie via `putEvents`
4. liveQuery subscribers fire → UI updates reactively
5. Client opens persistent relay connections → live events → Dexie → UI

### Client-Side Navigation (Browsing Around)

1. User clicks a link → SvelteKit runs `+page.js` **in the browser**
2. `if (browser) return { seedEvents: [] }` → returns empty instantly, **no server call**
3. Component mounts → liveQuery fires against Dexie → renders from local data
4. Persistent relay subscriptions (already running since app shell loaded) keep Dexie fresh → liveQuery updates UI reactively

No duplicate fetches, no server round-trips, no relay queries triggered by navigation.

### Return Visit (Local-First)

1. Service worker serves cached HTML shell → Dexie already has events → **instant content**
2. liveQuery renders UI immediately from local data
3. Client opens relay connections → new events → Dexie → UI updates reactively

### Offline

1. Service worker serves cached HTML shell
2. Client-side navigation: `+page.js` returns empty in browser — **no server needed**
3. Dexie provides all data from IndexedDB
4. UI renders fully from local data
5. Relay connections skipped
6. Offline banner shown

### Build Time

**Static/marketing pages** are prerendered at build time as static HTML.

**Dynamic catalog pages** (`/apps`, `/stacks`, app/stack/profile detail) are NOT prerendered. They use `export const prerender = false` and are server-rendered at runtime with bounded one-shot relay seed queries. Catalog pages are rendered on-demand at runtime.

**Client-only sections** (e.g. studio signed-in dashboard with `ssr = false`) render in the browser; they are not prerendered and do not receive SSR seed data.

## URLs and routing

- **Profile pages:** `/profile/[npub]` — human-readable, stable URLs. Use **npub** in the path (not hex pubkey).
- **Apps listing:** `/apps` — consolidated browse page (apps + stacks). Supports `?q=` for NIP-50 search.
- **App detail:** `/apps/[appid]` — accepts a plain d-tag identifier (e.g. `net.primal.android`) **or** a NIP-19 naddr (kind 32267). Stack naddrs pasted here redirect to `/stacks/…`.
- **Stacks listing:** `/stacks`
- **Stack detail:** `/stacks/[naddr]` — naddr encodes kind 30267, pubkey, identifier. App naddrs redirect to `/apps/…`.
- **Community:** `/community/*` (forum, support, activity)
- **Studio:** `/studio/*` (developer dashboard; client-rendered when signed in)

## Catalog System

Catalogs are Nostr relays that hold app events.

- **Catalog relays:** `wss://relay.zapstore.dev`, `wss://relay.vertexlab.io`

## Event Kinds

| Kind | Name | Description |
|------|------|-------------|
| 32267 | App | Application metadata |
| 30063 | Release | Version release info |
| 1063 | File Metadata | File hashes and URLs |
| 0 | Profile | Developer profile |
| 1111 | Comment | App comments |
| 9735 | Zap Receipt | Lightning zaps |

## Storage

### Dexie / IndexedDB (client)

- **Single client-side source of truth.** All Nostr events stored in Dexie (IndexedDB). UI derives state from liveQuery subscriptions.
- **Reactive:** Dexie's `liveQuery` automatically re-runs queries when data changes. No manual cache invalidation or event propagation needed.
- **Writes:** All non-search display data paths (server seed, relay stream, one-shot hydration) write directly to Dexie via `putEvents`. liveQuery handles the rest. Search may render the relay response first, then persist hits for cache/back-navigation.
- **Indices:** Multi-entry `*_tags` index for tag-based NIP-01 queries. Compound indices `[kind+created_at]` and `[kind+pubkey]` for field-based queries. See "IndexedDB Schema & Indices" above.
- **Speed:** IndexedDB reads are async (~1-5ms for indexed queries). SSR seed HTML or prerendered static pages cover first paint, so async latency is invisible in practice. Subsequent updates are automatic via liveQuery.
- **Schema changes nuke the database.** Bump `SCHEMA_VERSION` → old DB deleted → fresh start. No migrations. Relay subscriptions and seed events repopulate immediately.
- **Replaceability:** `putEvents` correctly handles all NIP-01 replaceable kinds: kind 0 and 3 (one per pubkey), kinds 10000-19999 (one per kind+pubkey), kinds 30000+ (one per kind+pubkey+dTag). Older versions are deleted on write.
- **Eviction:** Non-replaceable events (comments, zaps, file metadata) are capped per kind. `evictOldEvents()` runs on app startup and prunes old events beyond the cap, keeping the newest. This prevents unbounded IndexedDB growth.

### localStorage

- User preferences
- Configured catalog relays
- Signed-in pubkey

### SSR Seed Queries (server)

- **No server-side source of truth.** Server data is transient seed input for the first response, not an authoritative cache.
- **No polling:** The server does not run relay polling timers, warmups, or background catalog refresh loops.
- **No persistent WebSocket connections:** Connect → collect bounded one-shot results → disconnect.
- **No SQLite / relay.db:** No file-based database. Catalog event persistence belongs to client Dexie.

### Seeding the client

- **Source:** Seed events come from the SSR pass of universal `+page.js` loads. During SSR, the load function dynamic-imports `server.js`, performs bounded one-shot relay queries, and returns raw Nostr events in the page payload.
- **One-time only:** Seeding happens once — on the initial SSR visit. All subsequent client-side navigation returns empty from the `+page.js` load (`if (browser) return ...`). Dexie already has data from the seed + ongoing relay subscriptions.
- **Flow:** SSR: `+page.js` runs relay seed queries → HTML + seed events → client hydrates → seed events written to Dexie → liveQuery fires → UI renders. After that: relay subscriptions keep Dexie fresh, liveQuery keeps UI reactive.

## Service Worker (PWA)

The app is a **full PWA** with a compliant service worker and manifest.

- **Manifest:** Valid `manifest.json` (name, short_name, start_url, display, icons, theme_color, etc.) linked from the app. Ensures installability and standalone display.
- **Service worker:**
  - **Install:** Precaches static assets (JS, CSS, HTML) and optionally critical data URLs. Uses versioned cache names; skipWaiting so new SW activates promptly.
  - **Activate:** Cleans old caches; claims clients so the new SW controls the page immediately.
  - **Fetch:** Cache-first for precached assets (including cross-origin CDN assets when used); network-first for document requests with cache fallback for offline. No requests block first paint for content that can be served from cache.
- **Offline:** The app must be **fully working offline**: cached shell and routes serve from cache; app uses Dexie (IndexedDB) for all data; no network required for previously visited content. Offline banner or indicator is shown when navigator.onLine is false.
- **Background refresh indicator:** When data is refreshing from relays in the background, a very subtle indicator (e.g. small dot or bar) may be shown so the user knows fresh data is being fetched without implying loading or blocking.
- **Scope:** Service worker scope is the app origin (apex). Assets may be served from a CDN; the SW still controls the page and can cache CDN URLs for offline.

## Module Responsibilities

Source layout is described by responsibility, not directory listing. Names below refer to logical modules; exact file paths may evolve.

- **`lib/nostr/` — Nostr model helpers.** Pure Nostr parsing and NIP-19 helpers that do not perform relay or storage I/O.
- **`lib/purpleweb/` — local-first relay-data runtime.** Model registry; Dexie-backed query/relationship resolution; relay hydration, subscriptions, one-shot search, profile/community/studio helpers, and Svelte helpers that expose models or UI-ready data, not filters.
- **`lib/stores/` — UI-facing reactive state.** Cross-cutting concerns (auth, connectivity, preferences). Stores may consume purpleweb helpers but must not own relay fetching.
- **`lib/components/` — Svelte components.** Presentation and interaction state only; consume stores/purpleweb, never relays or storage internals.
- **`routes/` — pages and endpoints.** Catalog pages use universal `+page.js` loads. Static/marketing pages prerender. Client-only areas (e.g. studio) opt out of SSR. REST endpoints exist only for non-relay concerns (uploads, studio HTTP backends).
- **`service-worker.js` — PWA shell.** Precache, cache-first assets, network-first documents.
