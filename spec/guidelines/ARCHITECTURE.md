---
description: Core architecture — local-first data flow, Dexie/liveQuery, relay patterns, universal loads, PWA
alwaysApply: true
---

# Zapstore Webapp — Architecture

## Goals (non-negotiable)

- **Minimize loading states and skeletons.** Avoid the classic SPA pattern of spinners or skeletons everywhere. They have a place (e.g. true first-ever empty state, explicit search-in-flight) but must be minimal. First paint should show **real content** from local data (IndexedDB) or server-rendered seed data.
- **Static content is prerendered.** Blog, docs, and marketing pages are fully prerendered at build time. Dynamic app catalog pages (apps, stacks, discover) are server-rendered at runtime with seed data from the in-memory cache.
- **UI always updates reactively.** When local data or server/background data changes, the UI MUST update without full page reload. Use reactive state (e.g. Svelte runes, Dexie liveQuery) so new data flows into the view immediately.
- **Full PWA.** The app is a full Progressive Web App: valid web app manifest, compliant service worker (install, fetch, activate, scope), and offline support for cached routes and local data.

## Core Principle: Local-First

**Local-first is fundamental.** The UI always renders from local data first.
Network is optional—used only for background refresh.

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

This is non-negotiable. Any code path that blocks UI on network is a bug.

## Stack

- **Framework:** SvelteKit 2 with Svelte 5 (runes)
- **Styling:** Tailwind CSS 4
- **Nostr:** nostr-tools
- **Client storage:** Dexie.js (IndexedDB) with `liveQuery` for reactive queries
- **Server cache:** In-memory Nostr event store (polling-fed)
- **Runtime:** Bun runs the SvelteKit server at apex
- **Assets:** Static assets can be served from CDN via `PUBLIC_ASSET_BASE`

## Data Layer

Nostr events are the universal data format from end to end. Every layer stores and returns raw Nostr events. **NIP-01 filters are the universal query language** — the same filter objects are used to query relays, the server cache, and IndexedDB.

### Two-Tier Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 1 — SERVER (seed data)                                     │
│                                                                   │
│  Server polls two relays every 60s:                              │
│    • wss://relay.zapstore.dev                                    │
│    • wss://relay.vertexlab.io                                    │
│                                                                   │
│  Maintains an in-memory event cache.                             │
│  Serves pages hydrated with seed events from this cache.         │
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
│  ALL events — regardless of source — go here first.              │
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
│  Writes all received events directly to Dexie.                   │
│  Handles reconnection and retry.                                 │
│  Also used for one-shot queries: search, load-more, social.     │
└─────────────────────────────────────────────────────────────────┘
```

**The universal rule:** Any Nostr event, from any source (server seed, relay stream, one-shot fetch), is written directly to Dexie via `putEvents()`. liveQuery subscribers react automatically. There is no other data path.

### Server: Polling Cache

The server runs an **in-memory Nostr event store** fed by **polling** two catalog relays every 60 seconds. It is the single server-side source of truth for seed data.

```
┌─────────────────────────────────────────────────────────────┐
│    Upstream Relays (relay.zapstore.dev, relay.vertexlab.io)   │
│                    polled every 60s (runtime only)            │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              In-Memory Event Store (server)                    │
│         NIP-01 filter queries against cached events           │
│         Initial warm-up on cold start, then polling           │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
                   +page.js (SSR path)
                 returns seed events
            (server-rendered at runtime)
```

- **Catalog polling (every 60s):** Polls upstream relays for top 50 apps (kind 32267) and top 50 stacks (kind 30267) with platform filter. Uses `since: lastPollTimestamp` to fetch only new events. No releases (kind 30063) — those are fetched client-side.
- **Profile polling (every 60min):** Polls `relay.vertexlab.io` for profiles (kind 0) of all pubkeys from cached apps and stacks. Profiles change infrequently.
- **Cold start:** On server start, a full warm-up pull populates the cache. First request after startup gets fresh relay data.
- **No persistent WebSocket subscriptions:** The server does not maintain long-lived relay connections. It connects, polls, disconnects.
- **No SQLite / relay.db:** There is no server-side database. All server data lives in memory, fed by polling.
- **Seed events:** Universal `+page.js` load functions query the in-memory cache during SSR and return raw Nostr events as seed data in the page payload. See "Universal Loads" below.
- **Build vs Runtime:** During build, RelayCache does a one-time warmup (no polling timers) for any prerendered static pages. During runtime, polling timers keep the cache fresh continuously.

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
     liveQuery (reactive)      Writes from ALL sources
     UI subscribes & reacts    seed / relay stream / one-shot
```

- **Dexie liveQuery:** Observable queries that automatically re-fire when underlying data changes. Any write to Dexie (from any code path — server seed, relay stream, one-shot fetch) triggers subscribers to re-query. No manual invalidation.
- **Svelte integration:** Dexie's `liveQuery` returns an Observable. In Svelte 5, subscribe in a component `$effect` and assign to `$state`; the effect's cleanup return unsubscribes automatically.
- **No EventStore:** Dexie replaces both persistence and in-memory reactive state.
- **NIP-01 query engine:** `queryEvents(filter)` translates NIP-01 filters to efficient Dexie queries. This is the single query primitive used everywhere on the client — inside liveQuery, for one-shot reads, for joins.

### Client: Persistent Relay Connections

The client maintains **persistent WebSocket connections** to catalog and social relays for live event updates. This is the "updates" data flow.

```
┌─────────────────────────────────────────────────────────────┐
│  Client Relay Pool (persistent connections)                    │
│                                                                │
│  Catalog relays:   relay.zapstore.dev, relay.vertexlab.io     │
│  Social relays:    relay.damus.io, relay.primal.net, nos.lol  │
│                                                                │
│  Subscriptions (all with limit matching UI viewport):          │
│    • Apps (kind 32267) with platform filter, limit 50         │
│    • Releases (kind 30063), limit 50                          │
│    • Stacks (kind 30267) with platform filter, limit 20       │
│                                                                │
│  onevent → batch buffer (100ms) → putEvents → Dexie           │
│  Reconnects automatically on disconnect.                       │
└─────────────────────────────────────────────────────────────┘
```

- **Batched writes:** Incoming relay events are buffered for 100ms and written to Dexie in batches. This prevents per-event transaction overhead and reduces liveQuery re-evaluation frequency.
- **Reconnection:** nostr-tools SimplePool handles reconnection automatically.
- **One-shot queries:** Search, load-more, and social features (comments, zaps) use separate one-shot relay queries that close after EOSE + grace period.

### NIP-01 Filters as Universal Query DSL

The same NIP-01 filter object is used across every layer:

| Layer | NIP-01 filter used for |
|-------|----------------------|
| Server polling | What to fetch from upstream relays |
| Page seed data | What to embed in server response |
| Client relay subscriptions | What to subscribe to for live updates |
| Client one-shot queries | Search, load-more, social features |
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
      │ poll every 60s               │ persistent client connections
      ▼                              ▼
Server cache ──→ seed events ──→ putEvents ──→ Dexie ──→ liveQuery ──→ UI
                                     ▲
Client relay pool ──→ events ──→ putEvents ─┘
```

**One polling cache on the server. One reactive store on the client. NIP-01 filters as the lingua franca throughout.**

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

**One-shot queries** (search, load-more, social features):

1. Open a `subscribeMany` subscription with one or more filters.
2. Collect events via `onevent`.
3. On `oneose` (End of Stored Events), start a **300ms grace timer** to catch late-arriving events.
4. When the grace timer fires, close the subscription and resolve with collected events.
5. A hard **timeout** (default 5s) acts as a safety net if EOSE never arrives.

```
subscribe → collect events → EOSE → +300ms grace → resolve → putEvents → Dexie
                                  ↑ timeout (5s) fallback
```

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

This applies equally to Dexie queries (`queryEvents`), relay subscriptions, and server cache queries.

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
│    // SSR path: dynamic-import server module, query cache          │
│    const { fetchApps } = await import('$lib/nostr/server.js');    │
│    return { seedEvents: fetchApps(24) };                          │
│                                                                    │
│  SSR (first visit / hard refresh):                                │
│    browser = false → dynamic-import server.js → query cache       │
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

**Dynamic imports for server modules:** The `await import('$lib/nostr/server.js')` is behind the `if (browser)` guard. Since `browser` is replaced at build time by Vite (`true` in client build, `false` in SSR build), the server import is dead-code-eliminated from the client bundle entirely.

**Detail pages (apps/[naddr], stacks/[naddr], profile/[npub]):** Same pattern, but components also include **Dexie fallback queries** for when server data is null (client-side nav). They decode the URL param, query Dexie for the event, and parse it locally.

### When does the server load code run?

| Scenario | Load runs on | Server cache queried? |
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

1. `+page.js` runs on server → dynamic-imports `server.js` → queries in-memory cache → seed events in HTML → **instant content**
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

**Static content pages** (blog, docs, studio, marketing) are prerendered at build time as static HTML.

**Dynamic catalog pages** (apps, stacks, discover) are NOT prerendered. They are server-rendered at runtime with fresh data from the in-memory RelayCache. During build, the RelayCache may do a one-time warmup (without starting polling timers) if any build-time logic requires it, but catalog pages themselves are rendered on-demand at runtime.

## URLs and routing

- **Profile pages:** `/profile/[npub]` — human-readable, stable URLs. Use **npub** in the path (not hex pubkey).
- **Apps:** `/apps/[naddr]` (naddr encodes kind 32267, pubkey, identifier).
- **Stacks:** `/stacks/[naddr]` (naddr encodes kind 30267, pubkey, identifier).

## Catalog System

Catalogs are Nostr relays that hold app events.

- **Catalog relays:** `wss://relay.zapstore.dev`, `wss://relay.vertexlab.io`
- **Custom catalogs:** Phase 2 feature

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
- **Writes:** All data paths (server seed, relay stream, one-shot fetch) write directly to Dexie via `putEvents`. liveQuery handles the rest.
- **Indices:** Multi-entry `*_tags` index for tag-based NIP-01 queries. Compound indices `[kind+created_at]` and `[kind+pubkey]` for field-based queries. See "IndexedDB Schema & Indices" above.
- **Speed:** IndexedDB reads are async (~1-5ms for indexed queries). Prerendered HTML covers first paint, so async latency is invisible in practice. Subsequent updates are automatic via liveQuery.
- **Schema changes nuke the database.** Bump `SCHEMA_VERSION` → old DB deleted → fresh start. No migrations. Relay subscriptions and seed events repopulate immediately.
- **Replaceability:** `putEvents` correctly handles all NIP-01 replaceable kinds: kind 0 and 3 (one per pubkey), kinds 10000-19999 (one per kind+pubkey), kinds 30000+ (one per kind+pubkey+dTag). Older versions are deleted on write.
- **Eviction:** Non-replaceable events (comments, zaps, file metadata) are capped per kind. `evictOldEvents()` runs on app startup and prunes old events beyond the cap, keeping the newest. This prevents unbounded IndexedDB growth.

### localStorage

- User preferences
- Configured catalog relays
- Signed-in pubkey

### In-Memory Event Store (server)

- **Single server-side source of truth.** All server data comes from the in-memory event store, populated by polling.
- **Fed by polling:** Every 60 seconds, polls upstream relays with `since` to fetch new events. Initial warm-up on cold start pulls recent data.
- **No persistent WebSocket connections:** Connect → poll → disconnect. Simple and predictable.
- **No SQLite / relay.db:** No file-based database. All data flows through relay polling.

### Seeding the client

- **Source:** Seed events come from the SSR pass of universal `+page.js` loads. During SSR, the load function dynamic-imports `server.js`, queries the in-memory cache, and returns raw Nostr events in the page payload.
- **One-time only:** Seeding happens once — on the initial SSR visit. All subsequent client-side navigation returns empty from the `+page.js` load (`if (browser) return ...`). Dexie already has data from the seed + ongoing relay subscriptions.
- **Flow:** SSR: `+page.js` queries server cache → HTML + seed events → client hydrates → seed events written to Dexie → liveQuery fires → UI renders. After that: relay subscriptions keep Dexie fresh, liveQuery keeps UI reactive.

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

## File Structure

```
webapp/
├── src/
│   ├── service-worker.js   # PWA service worker
│   ├── lib/
│   │   ├── components/     # Svelte components
│   │   ├── nostr/          # Nostr data layer
│   │   │   ├── relay-cache.js  # In-memory event store + polling (server-only)
│   │   │   ├── server.js       # Server data facade (queries cache)
│   │   │   ├── dexie.js        # Dexie schema, putEvents, queryEvents (client)
│   │   │   ├── service.js      # Client relay pool (persistent + one-shot)
│   │   │   ├── models.js       # Event parsing (App, Release, Stack, Profile)
│   │   │   └── index.js        # Public exports
│   │   ├── stores/         # Svelte stores (liveQuery factories + pagination/UI state)
│   │   │   ├── nostr.svelte.js          # Apps: createAppsQuery(), pagination
│   │   │   ├── stacks.svelte.js         # Stacks: createStacksQuery(), pagination
│   │   │   ├── refresh-indicator.svelte.js  # Background refresh indicator state
│   │   │   ├── online.svelte.js         # Online/offline status
│   │   │   ├── catalogs.svelte.js       # Catalog relay config
│   │   │   └── auth.svelte.js           # Auth state (NIP-07)
│   │   └── config.js       # App configuration (relays, event kinds, platform filter)
│   └── routes/
│       ├── +layout.svelte         # App shell, offline banner, starts live subscriptions
│       ├── +page.svelte           # Homepage / landing
│       ├── api/
│       │   └── image/             # Image proxy (only remaining API endpoint)
│       ├── +error.svelte          # Error page (offline-aware)
│       ├── discover/
│       │   ├── +page.svelte       # Discover page (apps + stacks, reactive via liveQuery)
│       │   └── +page.js           # Universal load (SSR: seed data, browser: empty)
│       ├── apps/
│       │   ├── +page.svelte       # Apps listing (reactive via liveQuery)
│       │   ├── +page.js           # Universal load (SSR: seed data, browser: empty)
│       │   └── [naddr]/
│       │       ├── +page.svelte   # App detail (releases fetched from relays)
│       │       └── +page.js       # Universal load (SSR: app from cache, browser: Dexie fallback)
│       ├── stacks/
│       │   ├── +page.svelte       # Stacks listing (reactive via liveQuery)
│       │   ├── +page.js           # Universal load (SSR: seed data, browser: empty)
│       │   └── [naddr]/
│       │       ├── +page.svelte   # Stack detail (Dexie fallback for offline)
│       │       └── +page.js       # Universal load (SSR: stack from cache, browser: Dexie fallback)
│       └── profile/
│           └── [npub]/
│               ├── +page.svelte   # Developer profile (Dexie fallback for offline)
│               └── +page.js       # Universal load (SSR: profile from cache, browser: Dexie fallback)
├── static/                 # Static assets
└── spec/                   # Documentation
```
