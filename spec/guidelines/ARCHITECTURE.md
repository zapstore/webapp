# Zapstore Webapp — Architecture

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
- **Hosting:** Static files served by any CDN

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

- **EventStore**: In-memory, synchronous — UI derives state from here
- **IndexedDB**: Persistent local cache — loaded on app init
- **persistEventsToCache**: Non-blocking writes to IndexedDB
- **RelayPool**: Background refresh only, conditional on online status

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
│     +page.server.ts fetches from relays → static HTML       │
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
│     - queryStore(filter) → immediate (EventStore)           │
│     - queryCache(filter) → check IndexedDB if empty         │
│     - fetchFromRelays()  → background refresh               │
│     - persistEventsToCache → save new events to IndexedDB   │
│     - onUpdate callback → UI state updated                  │
└─────────────────────────────────────────────────────────────┘
```

Key files:
- `src/lib/nostr/service.ts` — EventStore, IndexedDB, queries, relay fetching
- `src/lib/stores/nostr.svelte.ts` — Apps listing pagination state

## Rendering Strategy

Every render path prioritizes local data:

### Initial Visit (New User)

1. CDN serves pre-rendered HTML → **instant content**
2. SvelteKit hydrates
3. IndexedDB cache populated from prerendered data
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

1. `+page.server.ts` fetches from relays
2. HTML generated with full content
3. Static files deployed to CDN

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

### IndexedDB
- Nostr events cached via `persistEventsToCache`
- Loaded into EventStore on app init

### localStorage
- User preferences
- Configured catalog relays
- Signed-in pubkey


## Service Worker (PWA)

Enables the local-first offline experience:

- **Install**: Precaches all static assets (JS, CSS, HTML)
- **Fetch**: Cache-first for assets, network-first for pages
- **Offline**: Serves cached shell, app uses IndexedDB for data

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
│   │   │   ├── server.ts   # SSR/prerender utilities
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

