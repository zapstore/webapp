# Webapp — Agent Instructions

Local-first, Nostr-native web app for discovering and browsing apps distributed via Nostr.

All behavioral authority lives in `spec/guidelines/`. If this file conflicts, guidelines win.

## Current Phase

**Phase 1: Apps** — Browse, discover, search.

All UI MUST follow the design system in `spec/guidelines/DESIGN_SYSTEM.md`. For component APIs (ProfilePic, AppPic, Modal, etc.), see `spec/guidelines/DESIGN_COMPONENTS.md`.

## Quick Reference

| What | Where |
|------|-------|
| Design system (tokens, panels, buttons) | `spec/guidelines/DESIGN_SYSTEM.md` |
| Component APIs (ProfilePic, Modal, etc.) | `spec/guidelines/DESIGN_COMPONENTS.md` |
| Architecture & patterns | `spec/guidelines/ARCHITECTURE.md` |
| Non-negotiable rules | `spec/guidelines/INVARIANTS.md` |
| Quality standards | `spec/guidelines/QUALITY_BAR.md` |
| Product vision | `spec/guidelines/VISION.md` |
| Feature specs | `spec/features/` |
| Active work | `spec/work/` |
| Decisions & learnings | `spec/knowledge/` |

Guidelines are symlinked into `.cursor/rules/` and auto-load. `DESIGN_COMPONENTS.md` is reference-only — read it when working on those components.

## File Ownership

| Path | Owner | AI May Modify |
|------|-------|---------------|
| `spec/guidelines/*` | Human | No |
| `spec/features/*` | Human | No (unless asked) |
| `spec/work/*.md` | AI | Yes |
| `spec/knowledge/*.md` | AI | Yes |
| `src/**` | Shared | Yes |

## Key Commands

```bash
bun run dev      # Development server
bun run build    # Production build
bun run check    # TypeScript check
bun install      # After dependency changes
```
