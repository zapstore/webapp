# Webapp — Agent Instructions

Local-first, Nostr-native web app for discovering and browsing apps distributed via Nostr.

Behavioral authority lives in `spec/`. If this file conflicts, those guidelines win.

## Current Phase

**Phase 1: Apps** — Browse, discover, search.

All UI MUST follow the design system in `spec/DESIGN_SYSTEM.md`. For component APIs (ProfilePic, AppPic, Modal, etc.), see `spec/DESIGN_COMPONENTS.md`.

## Quick Reference

| What | Where |
|------|-------|
| Design system (tokens, panels, buttons) | `spec/DESIGN_SYSTEM.md` |
| Component APIs (ProfilePic, Modal, etc.) | `spec/DESIGN_COMPONENTS.md` |
| Architecture & patterns | `spec/ARCHITECTURE.md` |
| Non-negotiable rules | `spec/INVARIANTS.md` |
| Quality standards | `spec/QUALITY_BAR.md` |
| Product vision | `spec/VISION.md` |
| Decisions, work history, learnings | Engram (`mem_search`, `mem_save`) |

Guideline `.md` files are symlinked into `.cursor/rules/` and auto-load — see `.cursor/rules/manifest.mdc` for the loading map. `DESIGN_COMPONENTS.md` is reference-only.

## File Ownership

| Path | Owner | AI May Modify |
|------|-------|---------------|
| `spec/*.md` | Human | No |
| `src/**` | Shared | Yes |
| Engram observations | AI | Yes (proactive saves expected) |

## Key Commands

```bash
bun run dev      # Development server
bun run build    # Production build
bun run check    # TypeScript check
bun install      # After dependency changes
```
