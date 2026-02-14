---
description: Quality expectations — layer standards, anti-patterns, testing, when to spec
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

## When to Create a Feature Spec

Create a spec in `spec/features/` if the work:

- Touches async/lifecycle code (risk of memory leaks or race conditions)
- Modifies authentication or signing flows (NIP-07, future NWC)
- Changes data fetching or caching strategy
- Affects multiple routes or components
- Could regress existing UX or performance

**Skip the spec** if:

- Pure UI cosmetics (colors, spacing, copy changes)
- Adding a field to an existing type with no behavioral change
- Bug fix with obvious cause and obvious solution
- Dependency update with no API changes

When in doubt, create a spec. The overhead is low.

## Work Packet Lifecycle

1. Create `work/WORK-XXX-*.md` when starting non-trivial work
2. Update tasks and decisions as you work
3. **Delete after PR merges** — the feature spec remains as the contract

If multiple phases: `WORK-005-a.md`, `WORK-005-b.md` (same feature number).

## Layer Expectations

### Nostr Layer (`src/lib/nostr/`)

- Event parsing must tolerate unknown tags.
- Server relay pool must handle disconnection and reconnection gracefully.
- Dexie writes must not block rendering.

### Data Layer (`src/lib/stores/`)

- Store state must be derivable from Dexie (IndexedDB) via liveQuery.
- liveQuery subscriptions must clean up on component destroy.
- Loading/error states must be explicit.

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
