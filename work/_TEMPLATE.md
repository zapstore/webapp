# WORK-XXX — Short Name

**Feature:** FEAT-XXX-short-name.md
**Status:** In Progress | Complete

## Tasks

- [ ] 1. Task description
  - Files: `src/path/to/file.ts`
  - Notes: any relevant context
- [ ] 2. Task description
- [ ] 3. Handle edge cases per spec
- [ ] 4. Self-review against INVARIANTS.md

## Test Coverage

| Scenario | Expected | Status |
|----------|----------|--------|
| Happy path | Describe expected behavior | [ ] |
| Edge case: network failure | Graceful degradation | [ ] |
| Edge case: cancellation | Clean cleanup | [ ] |

## Decisions

### YYYY-MM-DD — Decision title

**Context:** Why this decision came up.
**Options:** A, B, C considered.
**Decision:** Chosen option.
**Rationale:** Why.

## Spec Issues

Report blockers here instead of guessing. Format:

- **Issue:** Description of unclear/incorrect spec
- **Question:** What clarification is needed

## Progress Notes

Brief updates as work proceeds.

---

# Example: WORK-002 — App Search

**Feature:** FEAT-002-app-search.md
**Status:** In Progress

## Tasks

- [x] 1. Add search input to discover page
  - Files: `src/routes/apps/+page.svelte`
- [x] 2. Create search store
  - Files: `src/lib/stores/search.ts`
  - Wraps relay query with debounce
- [ ] 3. Implement offline search fallback
  - Files: `src/lib/stores/search.ts`
  - Query IndexedDB when offline
- [ ] 4. Add loading/empty states
- [ ] 5. Self-review against INVARIANTS.md

## Test Coverage

| Scenario | Expected | Status |
|----------|----------|--------|
| Search with results | Results displayed | [x] |
| Search no results | Empty state shown | [ ] |
| Search offline | Cached results shown | [ ] |
| Cancel mid-search | No stale results | [ ] |

## Decisions

### 2026-02-01 — Debounce vs Submit Button

**Context:** Should search trigger on each keystroke or require explicit submit?
**Options:** Debounce (300ms), Submit button only, Both.
**Decision:** Submit button with Enter key support.
**Rationale:** More predictable, less relay load, matches existing behavior.

## Spec Issues

_None_

## Progress Notes

**2026-02-01:** Search input and store scaffolded. Basic relay query working.
**2026-02-02:** Adding offline fallback today.
