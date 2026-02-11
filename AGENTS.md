# AI Agents

Zapstore Webapp is a local-first, Nostr-native web application for discovering
and browsing apps distributed via Nostr app catalogs.

## Quick Reference

| What | Where |
|------|-------|
| **Design system (colors, gradients, panels, buttons, icons, etc.)** | **`DESIGN_SYSTEM.md`** |
| Architecture & patterns | `spec/guidelines/ARCHITECTURE.md` |
| Non-negotiable rules | `spec/guidelines/INVARIANTS.md` |
| Quality standards | `spec/guidelines/QUALITY_BAR.md` |
| Product vision | `spec/guidelines/VISION.md` |
| Feature specs | `spec/features/` |
| Active work | `work/` |

## Current Phase

**Phase 1: Apps** — Browse and discover apps, releases, search.

**All UI and visual design MUST follow the design system.** From here on, work is design-led: always check **`DESIGN_SYSTEM.md`** for panels, buttons, colors, preset gradients, icons, loading states, modals, and typography. Do not invent custom gradients, borders, or styles—use the preset gradients and tokens defined there and in `src/app.css`.

## File Ownership

| Path | Owner | AI May Modify |
|------|-------|---------------|
| `spec/guidelines/*` | Human | No |
| `spec/features/*` | Human | No (unless explicitly asked) |
| `work/*.md` | AI | Yes |
| `src/**` | Shared | Yes |

## Rules

1. Read `spec/guidelines/ARCHITECTURE.md` first for technical context
2. Never modify files in `spec/guidelines/` without explicit permission
3. If a spec is unclear, report it—do not guess
4. Prefer small, localized changes. Avoid unrelated refactors.
5. After dependency changes, run: `bun install`
6. Fix any TypeScript/lint errors introduced by your changes

## Spec-First Workflow

- Behavior changes require a feature spec in `spec/features/` first
- During implementation, specs are read-only
- If a spec is unclear or incorrect, stop and report a "Spec Issue"

## Task Completeness

For non-trivial work, changes are not complete unless:

- Work packet reflects the actual work performed
- No significant code exists outside the task plan
- Edge cases and failure modes are addressed

## Key Commands

```bash
bun run dev      # Development server
bun run build    # Build for production (prerenders all pages)
bun run preview  # Preview production build
bun run check    # TypeScript check
```

## Architecture Summary

SvelteKit app with Applesauce-based Nostr data layer:

- **Prerendering**: All pages built at deploy time via `+page.server.ts`
- **Local-first**: EventStore (memory) + IndexedDB (persistence)
- **Background refresh**: RelayPool fetches fresh data after hydration

See `spec/guidelines/ARCHITECTURE.md` for details.
