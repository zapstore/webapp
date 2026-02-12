# Zapstore Webapp — Architecture

## Goals (non-negotiable)

- **Minimize loading states and skeletons.** Avoid the classic SPA pattern of spinners or skeletons everywhere. They have a place (e.g. true first-ever empty state, explicit search-in-flight) but must be minimal. First paint should show **real content** from local data or prerender whenever possible.
- **Landing pages (marketing) are fully prerendered.** No blocking on data; static or build-time data only.
- **UI always updates reactively.** When local data or server/background data changes, the UI MUST update without full page reload. Use reactive state (e.g. Svelte runes, stores) so new data flows into the view immediately.
- **Full PWA.** The app is a full Progressive Web App: valid web app manifest, compliant service worker (install, fetch, activate, scope), and offline support for cached routes and local data. No half-measures.

## Core Principle: Local-First

**Local-first is fundamental.** The UI always renders from local data first.
Network is optional—used only for background refresh.

```
┌────────────────────────────────────────────────────────────────┐
│                     LOCAL-FIRST PRINCIPLE                       │
│                                                                 │
│  1. UI renders IMMEDIATELY from local data (IndexedDB)          │
│  2. Network fetch happens IN THE BACKGROUND                     │
│  3. User NEVER waits for network on return visits               │
│  4. App works FULLY OFFLINE with cached data                    │
│  5. Fresh data updates UI REACTIVELY (no reload needed)         │
└────────────────────────────────────────────────────────────────┘
```

This is non-negotiable. Any code path that blocks UI on network is a bug.

## Stack

- **Framework:** SvelteKit 2 with Svelte 5 (runes)
- **Styling:** Tailwind CSS 4
- **Nostr:** Applesauce (EventStore, RelayPool) + nostr-tools
- **Storage:** IndexedDB for event cache, localStorage for preferences
- **Runtime:** Bun runs the SvelteKit server at apex
- **Assets:** Static assets can be served from CDN via `PUBLIC_ASSET_BASE`

## Data Layer (Applesauce)

The app uses [Applesauce](https://applesauce.build/) for local-first Nostr data.
See [Applesauce Caching Docs](https://applesauce.build/storage/caching/) for patterns.

```
┌─────────────────────────────────────────────────────────────┐
│                     EventStore (memory)                      │
│         SYNCHRONOUS access — UI derives from here            │
└─────────────────────────────────────────────────────────────┘
        ↑                                       ↓
        │ load on init              persistEventsToCache
        │ (from IndexedDB)          (non-blocking writes)
┌─────────────────────────────────────────────────────────────┐
│                    IndexedDB (persistent)                    │
│              LOCAL CACHE — survives page reload              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      RelayPool                               │
│     BACKGROUND ONLY — never blocks UI, skipped offline       │
└─────────────────────────────────────────────────────────────┘
```

- **EventStore**: In-memory, synchronous — UI derives state from here. Single source of truth for in-memory state.
- **IndexedDB**: Persistent mirror of EventStore — all writes go through the store (store.add) then persistEventsToCache syncs to IDB. Never write to IndexedDB without going through EventStore. On init, load from IDB into the store so the two layers stay in sync. No separate client path that bypasses the store.
- **persistEventsToCache**: Non-blocking writes to IndexedDB; every event added to the store is persisted so return visits and offline have the same data.
- **RelayPool**: Background refresh only, conditional on online status.
- **Server SQLite path**: Prerender/SSR catalog reads use `relay.db` (or `CATALOG_DB_PATH`) via server-only SQLite queries, not request-time relay websockets.

**Applesauce for social content:** Islands of social content (comments, zaps, profiles) use the same Applesauce pattern: watchComments, watchZaps, fetchComments, fetchZaps all use EventStore + RelayPool and persistEventsToCache. They return sync results from the store, then refresh in the background and update the store; the UI reacts. No separate cache for social—everything flows through EventStore → IndexedDB.

### Query Interface (Applesauce Pattern)

Following [Applesauce caching](https://applesauce.build/storage/caching/), queries follow this order:

```
EventStore (memory) → IndexedDB (cache) → Relays (network)
     sync, 0ms           async, fast         async, background
```

Two cousin APIs implement this pattern:

```typescript
// FETCH: async, Promise-based (waits for result)
const app = await fetchEvent(
  { kinds: [32267], authors: [pubkey], '#d': [id] },
  { relays: DEFAULT_CATALOG_RELAYS }
);

// WATCH: sync return + callback (reactive)
const localResults = watchEvents(
  { kinds: [30063], '#a': [aTagValue] },
  { relays: DEFAULT_CATALOG_RELAYS },
  (freshResults) => {
    latestRelease = parseRelease(freshResults[0]);
  }
);
```

Key functions in `src/lib/nostr/service.ts`:
- `queryStore(filter)` — EventStore only (sync)
- `queryCache(filter)` — IndexedDB only (async)
- `fetchEvents/fetchEvent` — Full cascade, returns Promise
- `watchEvents/watchEvent` — Full cascade, sync return + callback

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. PRERENDER (build time)                                  │
│     +page.server.ts reads relay.db (SQLite) → static HTML   │
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
│  3. QUERY CASCADE                                           │
│     - seed server events into EventStore on hydrate         │
│     - queryStore(filter) → immediate (EventStore)           │
│     - queryCache(filter) → check IndexedDB if empty         │
│     - fetchFromRelays()  → background refresh               │
│     - persistEventsToCache → save new events to IndexedDB   │
│     - onUpdate callback → UI state updated                  │
└─────────────────────────────────────────────────────────────┘
```

Key files:
- `src/lib/nostr/service.ts` — EventStore, IndexedDB, queries, relay fetching
- `src/lib/nostr/server-db.ts` — server-side SQLite catalog reads (`relay.db`)
- `src/lib/stores/nostr.svelte.ts` — Apps listing pagination state

## Rendering Strategy

Every render path prioritizes local data:

### Initial Visit (New User)

1. Apex serves pre-rendered HTML (assets may come from CDN) → **instant content**
2. SvelteKit hydrates
3. Server-provided seed events populate EventStore + IndexedDB
4. Background relay fetch (if online)
5. UI updates reactively

### Return Visit (Local-First)

1. IndexedDB cache loaded into EventStore → **instant content**
2. UI renders from cache immediately
3. Background relay fetch (if online)
4. UI updates reactively

### Offline

1. Service worker serves cached HTML shell
2. IndexedDB cache provides all data
3. UI renders fully from local data
4. Relay fetches skipped
5. Offline banner shown

### Build Time (Prerendering)

For SEO and first-visit performance:

1. `+page.server.ts` reads catalog events from server SQLite (`relay.db` / `CATALOG_DB_PATH`)
2. HTML generated with full content
3. Runtime serves HTML from apex; static assets can be deployed to CDN

**Landing pages (marketing):** Fully prerendered; no runtime data dependency. No loading states.

**Prerender scope:** Any route that has no client-side interactivity and no runtime data dependency can be fully prerendered (e.g. landing, static marketing, docs). Use prerender where possible so first paint shows real content without loading states.

## URLs and routing

- **Profile pages:** `/profile/[npub]` — human-readable, stable URLs (see INVARIANTS: “URLs must be stable and human-readable”). Use **npub** in the path (not hex pubkey).
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

### IndexedDB (client cache)
- Nostr events cached via `persistEventsToCache`
- Loaded into EventStore on app init so the **hot path is in-memory** (sync). IndexedDB is used for persistence and cold load.
- **Speed:** IndexedDB is asynchronous; typical indexed reads are on the order of 1–10 ms for small/medium datasets. For local-first, the important latency is **cold start**: load from IndexedDB into EventStore once, then all reads are sync from memory. That is acceptable; no browser standard offers faster **persistent** structured storage. Alternatives: **in-memory only** (no persistence across reload), **Cache API** (good for response bodies, not queryable event stores). For structured, queryable, persistent client data, IndexedDB is the right choice.
- **Indices:** Use indices to keep queries fast: `event.kind`, `event.created_at`, `event.pubkey`, and compound `(event.kind, event.created_at)` where supported. Avoid full table scans; filter by index first then apply remaining filters in memory.

### localStorage
- User preferences
- Configured catalog relays
- Signed-in pubkey

### Server SQLite (catalog)

- **Primary source for server render path:** `relay.db` in project root by default, or custom path via `CATALOG_DB_PATH`.
- **Usage:** `src/lib/nostr/server-db.ts` reads app/release events directly from SQLite for prerender/SSR.
- **No request-time websocket dependency:** server route rendering does not open relay subscriptions.

### Seeding the client cache

- **Source:** Data is seeded from the **server response** (SSR/load). Alongside parsed list payload, first-page raw events are included so hydration can fill EventStore + IndexedDB.
- **Flow:** Server sends HTML + load payload. Client merges seed events into EventStore, and `persistEventsToCache` writes them to IndexedDB in the background. Subsequent visits read IndexedDB → EventStore for instant paint, then refresh from relays in the background.

## Service Worker (PWA)

The app is a **full PWA** with a compliant service worker and manifest.

- **Manifest:** Valid `manifest.json` (name, short_name, start_url, display, icons, theme_color, etc.) linked from the app. Ensures installability and standalone display.
- **Service worker:**
  - **Install:** Precaches static assets (JS, CSS, HTML) and optionally critical data URLs. Uses versioned cache names; skipWaiting so new SW activates promptly.
  - **Activate:** Cleans old caches; claims clients so the new SW controls the page immediately.
  - **Fetch:** Cache-first for precached assets (including cross-origin CDN assets when used); network-first for document requests with cache fallback for offline. No requests block first paint for content that can be served from cache.
- **Offline:** The app must be **fully working offline**: cached shell and routes serve from cache; app uses IndexedDB for all data; no network required for previously visited content. Offline banner or indicator is shown when navigator.onLine is false.
- **Background refresh indicator:** When data is refreshing from the server in the background, a very subtle indicator (e.g. small dot or bar) may be shown so the user knows fresh data is being fetched without implying loading or blocking.
- **Scope:** Service worker scope is the app origin (apex). Assets may be served from a CDN; the SW still controls the page and can cache CDN URLs for offline.

## File Structure

```
webapp/
├── src/
│   ├── service-worker.ts   # PWA service worker
│   ├── lib/
│   │   ├── components/     # Svelte components
│   │   ├── nostr/          # Applesauce integration
│   │   │   ├── service.ts  # EventStore, RelayPool, IndexedDB
│   │   │   ├── models.ts   # Event parsing (App, Release, etc.)
│   │   │   ├── server.ts   # Server API facade
│   │   │   ├── server-db.ts # SQLite reads for prerender/SSR
│   │   │   └── index.ts    # Public exports
│   │   ├── stores/         # Svelte stores
│   │   │   ├── nostr.svelte.ts   # Reactive EventStore access
│   │   │   ├── online.svelte.ts  # Online/offline status
│   │   │   ├── catalogs.svelte.ts
│   │   │   └── auth.svelte.ts
│   │   └── config.ts       # App configuration
│   └── routes/
│       ├── +layout.svelte         # App shell, offline banner
│       ├── +page.svelte           # Homepage
│       └── apps/
│           ├── +page.svelte       # Apps listing (reactive)
│           ├── +page.server.ts    # Prerender data
│           └── [naddr]/
│               ├── +page.svelte   # App detail (reactive)
│               └── +page.server.ts # Prerender data + entries
├── static/                 # Static assets
└── spec/                   # Documentation
```

