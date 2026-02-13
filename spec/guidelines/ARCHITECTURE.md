# Zapstore Webapp — Architecture

## Goals (non-negotiable)

- **Minimize loading states and skeletons.** Avoid the classic SPA pattern of spinners or skeletons everywhere. They have a place (e.g. true first-ever empty state, explicit search-in-flight) but must be minimal. First paint should show **real content** from local data or prerender whenever possible.
- **Landing pages (marketing) are fully prerendered.** No blocking on data; static or build-time data only.
- **UI always updates reactively.** When local data or server/background data changes, the UI MUST update without full page reload. Use reactive state (e.g. Svelte runes, Dexie liveQuery) so new data flows into the view immediately.
- **Full PWA.** The app is a full Progressive Web App: valid web app manifest, compliant service worker (install, fetch, activate, scope), and offline support for cached routes and local data. No half-measures.

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
- **Server cache:** In-memory Nostr relay (caching layer)
- **Runtime:** Bun runs the SvelteKit server at apex
- **Assets:** Static assets can be served from CDN via `PUBLIC_ASSET_BASE`

## Data Layer

Nostr events are the universal data format from end to end. Every layer stores and returns raw Nostr events.

### Server: In-Memory Relay Cache

The server runs an **in-memory Nostr relay** that acts as a caching layer. It is the single server-side source of truth for all catalog and social data.

```
┌─────────────────────────────────────────────────────────────┐
│         Upstream Relays (relay.zapstore.dev, social, etc.)   │
│                  persistent subscriptions                    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              In-Memory Nostr Relay (server)                   │
│         Single cache — NIP-01 filter queries                 │
│         Warm-up from upstream relays on cold start            │
└─────────────────────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
    REST API (JSON)            Prerender (build time)
    returns Nostr events       queries relay cache → static HTML
```

- **Reconnectable pool:** Maintains persistent subscriptions to upstream relays (including `wss://relay.zapstore.dev`). New events published upstream are automatically available in the cache.
- **Cold start:** On server start, the pool warms up by pulling recent events from upstream relays. Prerendered HTML covers users during the brief warm-up window.
- **No SQLite / relay.db:** There is no server-side SQLite file. All server data comes from relays over websockets.
- **REST API:** SvelteKit `+server.ts` endpoints query the in-memory relay and return Nostr events as JSON. These endpoints support bundling (e.g. "stack + its apps + creator profile" in one response).

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
     liveQuery (reactive)      Background writes
     UI subscribes & reacts    from API / relay refresh
```

- **Dexie liveQuery:** Observable queries that automatically re-fire when underlying data changes. Any write to Dexie (from any code path — server payload, relay fetch, pagination) triggers subscribers to re-query. No manual invalidation.
- **Svelte integration:** Dexie's `liveQuery` returns an Observable compatible with Svelte's store contract. In Svelte 5, wrap in a small adapter for `$state`-based signals.
- **No EventStore:** The Applesauce EventStore layer is removed. Dexie replaces both persistence and in-memory reactive state.
- **No persistEventsToCache:** Writes go directly to Dexie. liveQuery handles reactivity automatically.
- **Indices:** Dexie table uses compound indices for fast Nostr-style filter queries: `kind`, `pubkey`, `created_at`, `[kind+created_at]`, and tag-based indices as needed.

### End-to-End Data Flow

```
Upstream relays
      │ persistent subscriptions
      ▼
In-memory relay (server cache)
      │
      ├── REST API ──→ JSON (Nostr events) ──→ Dexie write ──→ liveQuery ──→ UI
      │
      └── Prerender ──→ static HTML + seed events ──→ Dexie write ──→ liveQuery ──→ UI
```

**One cache on the server. One reactive store on the client. Nostr events as the lingua franca throughout.**

### Relay Subscription Pattern: EOSE + 300ms

All relay subscriptions (both server and client) follow a single deterministic pattern:

1. Open a `subscribeMany` subscription with one or more filters.
2. Collect events via `onevent`.
3. On `oneose` (End of Stored Events), start a **300ms grace timer** to catch late-arriving events.
4. When the grace timer fires, close the subscription and resolve with collected events.
5. A hard **timeout** (default 5s) acts as a safety net if EOSE never arrives.

```
subscribe → collect events → EOSE → +300ms grace → resolve
                                  ↑ timeout (5s) fallback
```

This prevents hanging on slow or unresponsive relays while still capturing events that arrive slightly after EOSE. The pattern is implemented identically in:

- **Server:** `relay-cache.js` → `queryRelaysRaw()` (feeds the in-memory cache)
- **Client:** `service.js` → `fetchFromRelays()` (social features, search)

### Query Interface

The client queries data through two paths:

```typescript
// REACTIVE: Dexie liveQuery (auto-updates on writes)
import { liveQuery } from 'dexie';

const apps = liveQuery(() =>
  db.events.where('kind').equals(32267).reverse().sortBy('created_at')
);

// API: Fetch from server REST endpoints (writes result to Dexie)
const response = await fetch('/api/apps?limit=24');
const { events } = await response.json();
await db.events.bulkPut(events);
// liveQuery subscribers auto-update — no manual notification needed
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. PRERENDER (build time)                                  │
│     +page.server.ts queries in-memory relay → static HTML   │
│     Seed events embedded in payload                         │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  2. FIRST PAINT (0ms)                                       │
│     Prerendered HTML renders instantly                      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ (onMount, requestIdleCallback)
┌─────────────────────────────────────────────────────────────┐
│  3. HYDRATION                                               │
│     - Seed events from server payload written to Dexie      │
│     - liveQuery subscribers fire, UI updates reactively     │
│     - Background: fetch fresh data from REST API            │
│     - API response written to Dexie → liveQuery → UI       │
└─────────────────────────────────────────────────────────────┘
```

Key files:
- `src/lib/nostr/relay-cache.ts` — In-memory relay cache + reconnectable pool (server-only)
- `src/lib/nostr/dexie.ts` — Dexie database schema, liveQuery helpers
- `src/lib/nostr/models.ts` — Event parsing (App, Release, etc.)
- `src/lib/stores/` — Reactive stores (pagination state, UI state)

## Rendering Strategy

Every render path prioritizes local data:

### Initial Visit (New User)

1. Apex serves pre-rendered HTML (assets may come from CDN) → **instant content**
2. SvelteKit hydrates
3. Seed events from server payload written to Dexie
4. liveQuery subscribers fire → UI updates reactively
5. Background API fetch for fresh data → writes to Dexie → UI updates

### Return Visit (Local-First)

1. Dexie (IndexedDB) already has cached events → **instant content**
2. liveQuery renders UI immediately from local data
3. Background API fetch for fresh data (if online)
4. New data written to Dexie → liveQuery → UI updates reactively

### Offline

1. Service worker serves cached HTML shell
2. Dexie provides all data from IndexedDB
3. UI renders fully from local data
4. API fetches skipped
5. Offline banner shown

### Build Time (Prerendering)

For SEO and first-visit performance:

1. `+page.server.ts` queries in-memory relay cache for catalog events
2. HTML generated with full content + seed events in payload
3. Runtime serves HTML from apex; static assets can be deployed to CDN

**Landing pages (marketing):** Fully prerendered; no runtime data dependency. No loading states.

**Prerender scope:** Any route that has no client-side interactivity and no runtime data dependency can be fully prerendered (e.g. landing, static marketing, docs). Use prerender where possible so first paint shows real content without loading states.

## URLs and routing

- **Profile pages:** `/profile/[npub]` — human-readable, stable URLs (see INVARIANTS: "URLs must be stable and human-readable"). Use **npub** in the path (not hex pubkey).
- **Apps:** `/apps/[naddr]` (naddr encodes kind 32267, pubkey, identifier).
- **Stacks:** `/stacks/[naddr]` (naddr encodes kind 30267, pubkey, identifier).

## Catalog System

Catalogs are Nostr relays that hold app events.

- **Default:** `wss://relay.zapstore.dev`
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
- **Writes:** All data paths (server seed, API fetch, background relay refresh) write directly to Dexie. liveQuery handles the rest.
- **Indices:** Use Dexie compound indices for fast queries: `kind`, `created_at`, `pubkey`, `[kind+created_at]`, and tag-based indices where needed. Avoid full table scans; filter by index first.
- **Speed:** IndexedDB reads are async (~1-5ms for indexed queries). Prerendered HTML covers first paint, so async latency is invisible in practice. Subsequent updates are automatic via liveQuery.

### localStorage

- User preferences
- Configured catalog relays
- Signed-in pubkey

### In-Memory Relay (server)

- **Single server-side source of truth.** All server data comes from the in-memory relay cache.
- **Fed by reconnectable pool:** Persistent websocket subscriptions to upstream relays keep the cache fresh. New events appear automatically.
- **Cold start warm-up:** On server start, pull recent events from upstream relays. The warm-up window is brief; prerendered HTML covers users during this time.
- **No SQLite / relay.db:** No file-based database. All data flows through relay websockets.
- **REST API:** `+server.ts` endpoints query the relay cache and return Nostr events as JSON. Bundling endpoints combine related data (e.g. stack + apps + profile) in a single response.

### Seeding the client

- **Source:** Seed events come from the server response (prerender or API). The payload includes raw Nostr events alongside parsed data.
- **Flow:** Server queries in-memory relay → sends HTML + seed events. Client writes seed events to Dexie on hydration. liveQuery subscribers fire, UI updates. Background API fetch for fresh data writes to Dexie → liveQuery → UI updates again. Return visits read directly from Dexie for instant paint.

## Service Worker (PWA)

The app is a **full PWA** with a compliant service worker and manifest.

- **Manifest:** Valid `manifest.json` (name, short_name, start_url, display, icons, theme_color, etc.) linked from the app. Ensures installability and standalone display.
- **Service worker:**
  - **Install:** Precaches static assets (JS, CSS, HTML) and optionally critical data URLs. Uses versioned cache names; skipWaiting so new SW activates promptly.
  - **Activate:** Cleans old caches; claims clients so the new SW controls the page immediately.
  - **Fetch:** Cache-first for precached assets (including cross-origin CDN assets when used); network-first for document requests with cache fallback for offline. No requests block first paint for content that can be served from cache.
- **Offline:** The app must be **fully working offline**: cached shell and routes serve from cache; app uses Dexie (IndexedDB) for all data; no network required for previously visited content. Offline banner or indicator is shown when navigator.onLine is false.
- **Background refresh indicator:** When data is refreshing from the server in the background, a very subtle indicator (e.g. small dot or bar) may be shown so the user knows fresh data is being fetched without implying loading or blocking.
- **Scope:** Service worker scope is the app origin (apex). Assets may be served from a CDN; the SW still controls the page and can cache CDN URLs for offline.

## File Structure

```
webapp/
├── src/
│   ├── service-worker.ts   # PWA service worker
│   ├── lib/
│   │   ├── components/     # Svelte components
│   │   ├── nostr/          # Nostr data layer
│   │   │   ├── relay-cache.ts  # In-memory relay cache + pool (server-only)
│   │   │   ├── dexie.ts        # Dexie schema, liveQuery helpers (client)
│   │   │   ├── models.ts       # Event parsing (App, Release, etc.)
│   │   │   └── index.ts        # Public exports
│   │   ├── stores/         # Svelte stores
│   │   │   ├── nostr.svelte.ts   # Reactive data access (pagination, etc.)
│   │   │   ├── online.svelte.ts  # Online/offline status
│   │   │   ├── catalogs.svelte.ts
│   │   │   └── auth.svelte.ts
│   │   └── config.ts       # App configuration
│   └── routes/
│       ├── +layout.svelte         # App shell, offline banner
│       ├── +page.svelte           # Homepage
│       ├── api/                   # REST API endpoints (query relay cache, return events)
│       └── apps/
│           ├── +page.svelte       # Apps listing (reactive via liveQuery)
│           ├── +page.server.ts    # Prerender data (queries relay cache)
│           └── [naddr]/
│               ├── +page.svelte   # App detail (reactive via liveQuery)
│               └── +page.server.ts # Prerender data + entries
├── static/                 # Static assets
└── spec/                   # Documentation
```
