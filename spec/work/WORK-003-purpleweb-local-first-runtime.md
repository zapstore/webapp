# WORK-003 — purpleweb Local-First Runtime

**Feature:** Internal local-first Nostr data layer
**Status:** In Progress

## Tasks

- [x] 1. Add an internal `src/lib/purpleweb/` runtime
  - Files: `src/lib/purpleweb/**`
  - Notes: Keep models pure; Dexie/liveQuery owns reads; relay hydration only writes events.
- [x] 2. Register model specs for Zapstore event kinds
  - Files: `src/lib/purpleweb/models/**`
- [x] 3. Add batched relationship planners
  - Notes: No query-in-loop for profiles, comments, zaps, labels, releases, or stack apps.
- [x] 4. Add Svelte query helpers
  - Notes: Helpers must clean up subscriptions through `$effect`.
- [x] 5. Migrate high-risk app/stack social reads to the new runtime where practical
- [x] 6. Self-review against local-first and no-N+1 invariants

## Test Coverage

| Scenario | Expected | Status |
|----------|----------|--------|
| Model registry | Known kinds parse through registered specs | [x] |
| Batch relationships | Related profiles/comments/zaps use batch filters | [x] |
| Relay hydration | Remote events write through Dexie and UI reads local data | [x] |
| Offline/browser guard | No WebSocket hydration during SSR; local query effects are browser-gated | [x] |

## Decisions

### 2026-05-12 — Internal module before package extraction

**Context:** Purplebase splits models and storage into packages, but the webapp needs SvelteKit, Dexie, universal load, and offline behavior baked into the runtime.
**Options:** Sibling package, two packages mirroring Purplebase, or app-local package-shaped module.
**Decision:** Start with one app-local `purpleweb` module.
**Rationale:** It lets the API enforce this app's local-first invariants while keeping extraction possible after the runtime stabilizes.

## Spec Issues

_None._

## Progress Notes

**2026-05-12:** Started implementation after confirming route-local social loading and profile N+1 drift.
**2026-05-12:** Added `purpleweb` runtime and moved app/stack social reads to Dexie liveQuery snapshots with relay hydration in the background.
