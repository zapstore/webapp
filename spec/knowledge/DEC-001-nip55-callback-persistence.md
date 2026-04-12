---
date: 2026-04-12
tags: [nip-55, android, authentication, callback]
problem: NIP-55 callback events were never received because the original page unloaded when redirecting to Amber
---

# DEC-001 — NIP-55 Callback Persistence

## Problem

When using NIP-55 on Android, the sign-in flow timed out after 60 seconds even though the user approved in Amber. The callback page dispatched a custom event, but no listener received it.

## Context

NIP-55 works via URL scheme redirects:
1. Web app redirects to `nostrsigner:` URL
2. Amber opens, user approves
3. Amber redirects back to callback URL with result

The initial implementation:
- Created an `AndroidSigner` class with callback handlers stored in a Map
- Registered a `window.addEventListener('nip55-callback', ...)` listener
- Callback page dispatched the event on return

The problem: when the page redirects to `nostrsigner:`, **all JavaScript state is destroyed**. The listener, the Promise, and the callback Map are gone. When Amber redirects back, it's a fresh page load with no listeners.

## Decision

Save authentication result directly to localStorage in the callback page, then trigger a full page reload instead of client-side navigation.

## Options Considered

- **Option A: Custom event dispatch** — Callback dispatches event, AndroidSigner listens. Failed because listeners are destroyed on page unload.

- **Option B: sessionStorage polling** — Store result in sessionStorage, poll on return. Adds complexity and delay.

- **Option C: Direct localStorage + full reload (chosen)** — Callback writes `pubkey` to localStorage, does `window.location.href` reload. `initAuth()` picks up pubkey on fresh load.

## Rationale

Option C is simplest and most reliable:
- No complex event coordination across page boundaries
- Works with SvelteKit's existing `initAuth()` pattern
- Full reload ensures clean state (no stale Promises or handlers)
- localStorage survives page reloads by design

The tradeoff (full page reload vs client-side nav) is acceptable for auth which happens once per session.

## How to Avoid This Problem Next Time

- **Never rely on in-memory state across page navigations** when using URL scheme redirects (NIP-55, OAuth, etc.)
- **Use persistent storage (localStorage) for cross-navigation data**
- **Full page reload is often simpler** than trying to coordinate state across navigations
- Reference: `src/routes/auth/callback/+page.svelte` shows the correct pattern
