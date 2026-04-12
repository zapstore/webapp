# FEAT-002 — NIP-55 Android Signer

## Goal

Allow Android users to sign in and sign events using NIP-55 compatible signer apps (Amber), complementing the existing NIP-07 browser extension support for desktop users.

## Non-Goals

- iOS signer support (no iOS NIP-55 signers exist yet)
- NIP-46 (Nostr Connect) remote signing
- Multiple signer selection UI
- Signer app detection/availability checking

## User-Visible Behavior

### Device Detection

The app detects device type on load:
- **Desktop** → NIP-07 (browser extension) path
- **Android** → NIP-55 (Amber) path
- **iOS/Other mobile** → Read-only mode with explanation

### Sign-In Flow

**Desktop (NIP-07):**
1. User clicks "Sign In"
2. Browser extension popup appears inline
3. User approves
4. Signed in immediately (no page reload)

**Android (NIP-55):**
1. User clicks "Sign In with Amber"
2. App redirects to `nostrsigner:` URL scheme
3. Amber app opens for approval
4. User approves in Amber
5. Amber redirects to `/auth/callback?pubkey=...`
6. Callback saves pubkey to localStorage
7. Full page reload to original page
8. User is signed in

**iOS/Other Mobile:**
1. User clicks "Sign In"
2. Modal explains sign-in requires desktop or Android
3. Read-only mode notice shown

### GetStartedModal States

| Device | Signer Available | Modal Content |
|--------|------------------|---------------|
| Desktop | Yes (extension) | "Sign in with extension" button |
| Desktop | No | "No extension found" + Alby link + read-only notice |
| Android | Always | "Sign in with Amber" button + app-switching helper text |
| Android | No Amber | "No signer found" + Amber download link + read-only notice |
| iOS | N/A | "Sign in not available" + read-only notice |

### Signing Events (Post-Auth)

**Desktop:** Extension popup appears inline, signs immediately.

**Android:** Each signing operation:
1. Redirects to Amber
2. User approves in Amber
3. Amber returns signed event via callback
4. Page reloads with result

### Read-Only Mode

Users without signers can:
- Browse all apps, stacks, profiles
- Search and discover
- View all content

Users without signers cannot:
- Comment or post
- Zap
- Create stacks
- Add labels

## Edge Cases

- **Amber not installed:** Show download link, explain read-only mode
- **User rejects in Amber:** Return to app unsigned, no error shown
- **Callback timeout:** 60 seconds, then show timeout error
- **Offline:** Sign-in button hidden or disabled
- **Mid-signing app switch:** State preserved in sessionStorage

## Acceptance Criteria

- [ ] Desktop users can sign in with NIP-07 extension
- [ ] Android users can sign in with Amber (NIP-55)
- [ ] iOS users see "not available" message
- [ ] Pubkey persists across page reloads (localStorage)
- [ ] Signer type persists across sessions
- [ ] Read-only mode works fully offline
- [ ] GetStartedModal shows device-appropriate content
- [ ] Signing operations work on Android (app switching)

## Technical Notes

### Files

| File | Purpose |
|------|---------|
| `src/lib/utils/device.js` | Device detection utilities |
| `src/lib/nostr/signers/android-signer.js` | NIP-55 protocol implementation |
| `src/routes/auth/callback/+page.svelte` | Callback handler for Amber returns |
| `src/lib/stores/auth.svelte.js` | Dual signer support |
| `src/lib/components/modals/GetStartedModal.svelte` | Device-specific UI |

### NIP-55 URL Scheme

```
nostrsigner:?type=get_public_key&callbackUrl=https://zapstore.dev/auth/callback?id=xxx
```

Amber adds `pubkey` parameter on redirect:
```
https://zapstore.dev/auth/callback?id=xxx&pubkey=<hex-pubkey>
```

### State Persistence

| Storage | Key | Value |
|---------|-----|-------|
| localStorage | `zapstore:pubkey` | Hex pubkey |
| localStorage | `zapstore:signer_type` | `'extension'` or `'android'` |
| sessionStorage | `nip55_return_url` | URL to return to after callback |
| sessionStorage | `nip55_callback_<id>` | Callback result (for signing ops) |

### Callback Flow

The callback page (`/auth/callback`) handles the return from Amber:
1. Parse URL parameters (`pubkey`, `event`, `signature`)
2. Save `pubkey` directly to localStorage (for auth)
3. Store callback data in sessionStorage (for signing ops)
4. Full page reload to return URL (triggers `initAuth()`)

Full page reload is required because the original Promise/listener is lost when the page navigates to Amber.
