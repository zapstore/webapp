---
date: 2026-04-12
tags: [nip-55, android, authentication, applesauce]
problem: Custom NIP-55 callback implementation failed because page state is lost during app switching
---

# DEC-001 — Use Applesauce AmberClipboardSigner

## Problem

Custom NIP-55 implementation using callback URLs timed out. When the page redirects to `nostrsigner:` URL, all JavaScript state is destroyed. Callback page dispatched events that nothing received.

## Context

First attempt: custom `AndroidSigner` class that:
1. Redirected to `nostrsigner:?callbackUrl=...`
2. Registered Promise callbacks in a Map
3. Callback page dispatched custom events

Failed because: page unload destroys all state. Callback event had no listener.

Second attempt: callback page writes directly to localStorage, does full page reload.

Still failed: Amber wasn't redirecting to the callback URL correctly.

## Decision

Use `AmberClipboardSigner` from `applesauce-signers` package instead of custom implementation.

## Options Considered

- **Option A: Custom callback URL approach** — Failed. State management across page navigations is fragile.

- **Option B: localStorage + full reload** — Still failed. Callback URL flow has issues.

- **Option C: AmberClipboardSigner (chosen)** — Battle-tested implementation using clipboard API. No callback URLs needed.

## Rationale

AmberClipboardSigner works differently:
1. Opens Amber via `intent:` URL (not `nostrsigner:`)
2. Listens for `visibilitychange` event (fires when user returns)
3. Reads result from clipboard (Amber copies result before returning)

Benefits:
- No callback URLs or page reloads
- Visibility change event fires reliably
- Clipboard is the communication channel, not URL params
- Already tested and maintained by applesauce team

## How to Avoid This Problem Next Time

- **Check if a library already solves the problem** before writing custom code
- **applesauce-signers has multiple signer implementations** — ExtensionSigner, AmberClipboardSigner, NostrConnectSigner, etc.
- **Clipboard-based communication** is more reliable than callback URLs for Android app ↔ web communication
- Reference: `applesauce-signers/signers/amber-clipboard-signer.js`
