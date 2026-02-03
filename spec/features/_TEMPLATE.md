# FEAT-XXX — Short Name

## Goal

1–2 sentences describing what this feature/bugfix achieves for the user.

## Non-Goals

- Explicitly list what is out of scope
- Prevents scope creep and AI drift

## User-Visible Behavior

- What the user sees or can do
- States: loading, success, error, empty (where relevant)
- Offline behavior

## Edge Cases

- Degraded or no network
- Cancellation / retry
- Invalid or partial data
- Other relevant risks

## Acceptance Criteria

- [ ] Observable outcome 1
- [ ] Observable outcome 2
- [ ] Observable outcome 3

## Notes (optional)

- Anything that needs human decision
- Open questions

---

# Example: FEAT-002 — App Search

## Goal

Allow users to search for apps by name or description from the discover page.

## Non-Goals

- Advanced filters (category, platform, date range)
- Search result ranking optimization
- Search suggestions / autocomplete

## User-Visible Behavior

- Search input visible at top of discover page
- Typing and pressing Enter triggers search
- Results replace the default app list
- Clear button resets to default browse view
- Loading state shows skeleton cards
- Empty state shows "No apps found" message

## Edge Cases

- Relay timeout → show error with retry button
- No results → show empty state, not error
- Search while previous search loading → cancel previous
- Offline → search cached events only, indicate limited results

## Acceptance Criteria

- [ ] User can search apps by name
- [ ] Search works offline against cached data
- [ ] Loading state shown during search
- [ ] Empty state shown when no results
- [ ] Previous search cancelled when new search starts

## Notes

- Consider debouncing input vs explicit submit button
- NIP-50 search support varies by relay
