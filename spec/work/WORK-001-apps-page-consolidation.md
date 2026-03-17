# WORK-001 — Apps Page Consolidation

**Feature:** Discover renamed to Apps; stacks + apps in one view; progressive loading
**Status:** Complete

## Tasks

- [x] 1. Add `DISCOVER_APPS_INITIAL=12` and `DISCOVER_STACKS_INITIAL=8` to `constants.js`
- [x] 2. Limit stack preview to first 4 app refs in `stacks.svelte.js` (createStacksQuery, seedStackEvents, loadMoreStacks)
- [x] 3. Limit stack preview to first 4 app refs on server (`server.js` `resolveMultipleStackAppsFromCache`)
- [x] 4. Delete old `/apps` listing page and `/discover` page files
- [x] 5. Create new `/apps/+page.svelte`: stacks top (no title), apps bottom (no "See more"), display limits
  - Files: `src/routes/apps/+page.svelte`, `src/routes/apps/+page.js`
- [x] 6. Redirect `/discover` → `/apps` via `src/routes/discover/+server.js` (301)
- [x] 7. Update all nav links: Header, MobileBottomNav, AppSidebar, DetailHeader, ParallaxHero, error page, stacks detail
- [x] 8. Update `+layout.svelte` showFooter condition
- [x] 9. Service worker: cache CDN images with `Cache-Control: public, max-age=31536000, immutable`
- [x] 10. Fix double-trigger bug: right arrow button should not call load-more directly (scroll handler handles it)

## Test Coverage

| Scenario | Expected | Status |
|----------|----------|--------|
| SSR first visit | 12 apps + 8 stacks seeded in HTML, instant paint | [ ] |
| Client-side nav to /apps | Returns empty from load(), Dexie provides data instantly | [ ] |
| Scroll right to edge (apps) | Load more triggered once, displayAppsLimit increases | [ ] |
| Scroll right to edge (stacks) | Load more triggered once, displayStacksLimit increases | [ ] |
| Visit /discover | 301 redirect to /apps | [ ] |
| Stack card preview | Shows max 4 app icons; no more app events fetched | [ ] |
| Enter stack detail | Full app refs fetched from relay | [ ] |
| Offline | Page renders from Dexie, no network required | [ ] |
| CDN image (second visit) | Served from SW cache with immutable headers | [ ] |

## Decisions

### 2026-03-16 — Display limit vs liveQuery limit

**Context:** Need to show only 12 apps initially, more on demand.
**Options:**
  A. Pass limit param to `createAppsQuery(limit)`, recreate subscription on limit change.
  B. liveQuery always returns all; component slices with `displayAppsLimit`.
**Decision:** Option B — slice in derived state.
**Rationale:** No subscription teardown/recreation on every load-more. Cheaper. liveQuery fires on Dexie writes only, not on limit changes. Harmless to slice beyond available count.

### 2026-03-16 — Stack preview: 4 refs only

**Context:** Stack cards show a 2×2 icon grid (first 4 apps). No reason to fetch all app refs on listing pages.
**Options:**
  A. Fetch all refs, slice display in component.
  B. Limit ref resolution at the store/server level to 4.
**Decision:** Option B — limit at the data layer.
**Rationale:** Avoids unnecessary relay fetches and Dexie writes for apps that won't be displayed. Full refs are still fetched when entering the stack detail page (which uses separate query logic).

### 2026-03-16 — Right arrow load-more trigger

**Context:** User requested right arrow triggers progressive load. Current scroll handler already triggers load-more when near the right edge.
**Decision:** Right arrow button only calls `scrollApps(1)`/`scrollStacks(1)`. The subsequent scroll event fires `handleAppsScroll`/`handleStacksScroll` which checks proximity and calls load-more. No double-call from the button itself.
**Rationale:** Prevents double display-limit increment per click. Scroll handler is the single source of truth for load-more triggering.

## Spec Issues

_None_

## Progress Notes

**2026-03-16:** All tasks complete. Fixed double-trigger bug after self-review against INVARIANTS.md (async discipline: concurrent requests must be deduplicated).
