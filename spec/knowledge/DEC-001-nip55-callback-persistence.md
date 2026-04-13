---
date: 2026-04-12
tags: [nip-55, android, authentication, clipboard]
problem: NIP-55 web app integration requires correct URL format and clipboard communication
---

# DEC-001 — NIP-55 Web App Implementation

## Problem

Multiple attempts at NIP-55 integration failed:
1. Custom callback URL approach - state lost on page navigation
2. Applesauce AmberClipboardSigner - used wrong URL format (`intent:` instead of `nostrsigner:`)

## Context

NIP-55 defines two modes for web apps:
1. With `callbackUrl` - Amber redirects back with result in URL
2. Without `callbackUrl` - Amber copies result to clipboard

The applesauce library used Android `intent:` URL format which doesn't work from web browsers. Web apps must use `nostrsigner:` scheme directly with `window.location.href`.

## Decision

Write custom `AmberSigner` class following NIP-55 spec exactly:
1. Use `nostrsigner:?type=...` URL format
2. Navigate via `window.location.href`
3. Listen for `visibilitychange` event
4. Read from clipboard on return

## Options Considered

- **Option A: Callback URL approach** — Failed. Page state destroyed, callback events lost.

- **Option B: Applesauce AmberClipboardSigner** — Failed. Uses `intent:` URLs which don't work from web.

- **Option C: Custom implementation per NIP-55 spec (chosen)** — Uses correct `nostrsigner:` format for web apps.

## Rationale

The NIP-55 spec explicitly shows web app usage:
```js
window.href = `nostrsigner:?compressionType=none&returnType=signature&type=get_public_key`;
```

Without `callbackUrl`, Amber copies result to clipboard. We read it when user returns (visibility change).

## How to Avoid This Problem Next Time

- **Read the NIP spec** — NIP-55 has explicit web app examples
- **Web apps use `nostrsigner:` scheme** — not `intent:` URLs
- **No callbackUrl = clipboard mode** — simpler, no redirect handling needed
- **Use `window.location.href`** — not `window.open()` for URL scheme navigation
- Reference: `src/lib/nostr/signers/amber-signer.js`
