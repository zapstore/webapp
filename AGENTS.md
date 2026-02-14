# AI Agents

Zapstore Webapp is a local-first, Nostr-native web application for discovering
and browsing apps distributed via Nostr app catalogs.

## Quick Reference

| What | Where |
|------|-------|
| **Design system (colors, gradients, panels, buttons, icons, etc.)** | **`spec/guidelines/DESIGN_SYSTEM.md`** |
| Architecture & patterns | `spec/guidelines/ARCHITECTURE.md` |
| Non-negotiable rules | `spec/guidelines/INVARIANTS.md` |
| Quality standards | `spec/guidelines/QUALITY_BAR.md` |
| Product vision | `spec/guidelines/VISION.md` |
| Feature specs | `spec/features/` |
| Active work | `work/` |

## Current Phase

**Phase 1: Apps** — Browse and discover apps, releases, search.

**All UI and visual design MUST follow the design system.** From here on, work is design-led: always check **`spec/guidelines/DESIGN_SYSTEM.md`** for panels, buttons, colors, preset gradients, icons, loading states, modals, and typography. Do not invent custom gradients, borders, or styles—use the preset gradients and tokens defined there and in `src/app.css`.

## File Ownership

| Path | Owner | AI May Modify |
|------|-------|---------------|
| `spec/guidelines/*` | Human | No |
| `spec/features/*` | Human | No (unless explicitly asked) |
| `work/*.md` | AI | Yes |
| `src/**` | Shared | Yes |

## Spec Loading

All specs in `spec/guidelines/` have YAML frontmatter and are symlinked into `.cursor/rules/` as `.mdc` files. Cursor loads them automatically:

- **Always loaded**: ARCHITECTURE, INVARIANTS, QUALITY_BAR, VISION (`alwaysApply: true`)
- **Loaded when editing UI**: DESIGN_SYSTEM (glob-scoped to `*.svelte`, `*.css`)

Do NOT re-read these files — their content is already in your context.

## Rules

1. Never modify files in `spec/guidelines/` without explicit permission
2. If a spec is unclear, report it—do not guess
3. Prefer small, localized changes. Avoid unrelated refactors.
4. After dependency changes, run: `bun install`
5. Fix any TypeScript/lint errors introduced by your changes

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
bun run build    # Build for production (static content only; catalog pages are SSR)
bun run preview  # Preview production build
bun run check    # TypeScript check
```

## Architecture Summary

SvelteKit app with Nostr-native data layer:

- **Server**: In-memory Nostr relay cache fed by polling (every 60s). Cache starts on server boot and stays fresh.
- **Client**: Dexie.js (IndexedDB) with `liveQuery` for reactive queries. No separate in-memory EventStore.
- **Server-rendering**: Catalog pages (apps, stacks, discover) are server-rendered at runtime with seed data from in-memory cache.
- **Prerendering**: Only static content pages (blog, docs, marketing) are prerendered at build time.
- **Local-first**: Dexie (IndexedDB) is the single client-side source of truth
- **Background refresh**: Persistent relay connections write to Dexie → liveQuery updates UI reactively

See `spec/guidelines/ARCHITECTURE.md` for details.
