---
description: Quality expectations — layer standards, anti-patterns, testing, planning
alwaysApply: true
---

# Zapstore Webapp — Quality Bar

These are best practices and expectations. Unlike invariants (which are binary pass/fail),
quality bar items involve judgment and tradeoffs.

## General Expectations

- Correct behavior matters more than coverage numbers.
- Happy-path-only implementations are insufficient.
- Failures must be explicit and observable.
- Performance is a feature, not an afterthought.

## Planning and Memory

For non-trivial work, slow down before coding:

- Outline the approach and trade-offs
- Search Engram (`mem_search`) for prior decisions or related bug fixes
- Save key decisions, reasoning, and gotchas to Engram (`mem_save`) as you work
- End the session with `mem_session_summary` so the next agent inherits context

Treat work as non-trivial when it:

- Touches async/lifecycle code (risk of memory leaks or race conditions)
- Modifies authentication or signing flows (NIP-07, future NWC)
- Changes data fetching or caching strategy
- Affects multiple routes or components
- Could regress existing UX or performance

Skip the planning ritual for pure UI cosmetics, single-field type additions, obvious bug fixes, and dependency updates with no API changes.

Episodic state (decisions, in-progress work, learnings, bugfixes) lives in Engram — not in tracked spec files. The repo holds standing guidelines; Engram holds what changed and why.

## Layer Expectations

### Data Layer (`src/lib/stores/` and `src/lib/purpleweb/`)

- Store and purpleweb state must be derivable from Dexie (IndexedDB) via liveQuery.
- liveQuery subscriptions must clean up on component destroy (`$effect` return or equivalent).
- Loading/error states must be explicit.
- Prefer purpleweb query helpers for new page data on catalog detail and social surfaces; extend existing store patterns for listings until migrated.
- Purpleweb hydration errors on user-initiated actions must be surfaced; background sync failures may degrade silently only when cached local data is already shown.

### Nostr Layer (`src/lib/nostr/`)

- Event parsing must tolerate unknown tags.
- Server relay pool must handle disconnection and reconnection gracefully.
- Dexie writes must not block rendering.

### Presentation Layer (`src/routes/`, `src/lib/components/`)

- Components must handle loading, empty, error, and success states.
- SSR-incompatible code must be guarded with `onMount` or `browser` checks.
- Accessibility basics must be maintained (semantic HTML, focus management).

## Implementation Expectations

- Follow existing patterns in the nearest module.
- Avoid introducing new architectural layers unless required by a spec.
- Do not perform broad or stylistic refactors.
- Prefer clarity and locality over abstraction.
- Prefer extending existing abstractions over introducing new ones.
- TypeScript strict mode must pass without `any` escape hatches.

## Testing Expectations

- Tests must validate behavior, not implementation details.
- Failure and degraded-network paths must be covered.
- Tests that only assert the happy path are insufficient.
- E2E tests for critical user journeys (browse, search, view app).

## Anti-Patterns

- Silent failures
- Blocking the main thread
- Layout shifts from async data
- Polling or artificial delays
- Large refactors unrelated to the task
- Using `any` to silence TypeScript
