# FEAT-001 — Apps Listing Page

## Goal

Provide a fast, paginated browsing experience for discovering apps with instant navigation to detail pages.

## Non-Goals

- Sorting options (alphabetical, popularity, date)
- Filtering by category or platform
- Search on this page (handled by separate search feature)

## Data Loading Strategy

Apps are discovered through their releases. This is the canonical loading mechanism:

1. **Load releases (kind 30063)** sorted by `created_at` descending, paginated in chunks of 20
2. **For each release, find its app (kind 32267)** via the `a` tag reference
3. **Display unique apps** — deduplicated by (pubkey, d-tag) pair

This approach ensures:
- Apps with recent releases appear first (activity-based ordering)
- Only apps with actual releases are shown
- Pagination works via timestamp cursor (`until` filter)

## User-Visible Behavior

### Initial Load

- SSG pre-renders first 20 apps for instant first paint
- User sees content immediately (no JavaScript required)
- Client hydrates: seed events written to Dexie, background API fetch for fresh data
- Refresh indicator (small spinning icon) appears next to title while fetching
- Fresh data written to Dexie → liveQuery updates UI reactively

### Infinite Scroll

- Scrolling near bottom automatically loads 20 more releases, resolving to new apps
- Loading spinner shown at bottom while fetching more
- "You've reached the end" message when all releases exhausted

### Hover Prefetch

- Hovering over any app card prefetches the app detail page data
- Fetches app event and releases via server API
- Writes to Dexie for instant rendering on navigation
- Clicking an app renders detail page instantly from local data
- Background API fetch updates Dexie after render

### Refresh Indicator

- Small spinning icon appears next to page title
- Does NOT shift layout (no banner/bar insertion)
- Tooltip shows "Refreshing..."
- Disappears when background fetch completes

## Edge Cases

- Fetch timeout → show what we have, stop refreshing indicator
- No apps → show "No apps found" empty state
- Offline → render from Dexie (IndexedDB), skip API fetches
- Partial data during scroll → show what's available, continue loading
- Rapid scrolling → debounce/throttle load requests

## Acceptance Criteria

- [ ] Homepage (`/`) shows no apps, only landing page content
- [ ] `/apps` SSG renders first 20 apps instantly
- [ ] Scrolling near bottom loads 20 more releases → apps automatically
- [ ] Hovering app card prefetches detail page data
- [ ] Clicking prefetched app renders instantly
- [ ] Refresh indicator does not cause layout shift
- [ ] End-of-list message shown when all releases exhausted

## Technical Notes

### Page Size

Constant `PAGE_SIZE = 20` used in both:
- SSG prerendering (first page of releases)
- Client-side pagination

### Release → App Resolution

Each release (kind 30063) references its app via the `a` tag:

```
["a", "32267:<pubkey>:<identifier>"]
```

The resolution process:
1. Parse `a` tag to extract pubkey and identifier
2. Query for app event: `{ kinds: [32267], authors: [pubkey], '#d': [identifier] }`
3. Use most recent version (replaceable event)

### Cursor-Based Pagination

Pagination uses timestamp cursors via the `until` filter:

```typescript
// First page
{ kinds: [30063], limit: 20 }

// Subsequent pages
{ kinds: [30063], limit: 20, until: lastRelease.created_at - 1 }
```

The `nextCursor` is calculated as `lastRelease.created_at - 1` to avoid duplicates.
When fewer than `limit` releases return, `nextCursor` is `null` (end reached).

### Deduplication

Apps are deduplicated by `${pubkey}:${dTag}` key:
- Track seen apps in `Set<string>`
- Skip apps already in the set when processing new releases
- Multiple releases for same app → app appears once (at first occurrence)

### Prefetch Strategy

- Track prefetched apps in `Set<string>` to avoid duplicates
- Cancel active prefetch requests on page unmount
- Prefetch triggers on `mouseenter` event
- Fetches both APP (32267) and RELEASE (30063) events via server API, writes to Dexie

### URL Format

App detail pages use NIP-19 naddr encoding:

```
/apps/{naddr}
```

Where `naddr` encodes: kind (32267), pubkey, and d-tag identifier.

Example: `/apps/naddr1qq8xummnw3ezqmt...`

This provides:
- Full pubkey (not truncated) for unambiguous app identification
- Standard Nostr format recognizable to users
- Shareable URLs that work across clients

### SSG Coordination

Server queries in-memory relay cache for first page of releases and resolves to apps. Client hydrates and:
1. Displays prerendered apps immediately
2. Writes seed events to Dexie, fetches fresh data from API (background)
3. API response written to Dexie → liveQuery updates UI reactively
4. Enables infinite scroll for remaining apps via cursor pagination
