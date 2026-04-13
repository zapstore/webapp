# FEAT-002 — NIP-55 Android Signer

## Goal

Allow Android users to sign in and sign events using NIP-55 compatible signer apps (Amber), complementing the existing NIP-07 browser extension support for desktop users.

## Non-Goals

- iOS signer support (no iOS NIP-55 signers exist yet)
- NIP-46 (Nostr Connect) remote signing
- Multiple signer selection UI

## User-Visible Behavior

### Device Detection

The app detects device type and signer availability:
- **Desktop with extension** → NIP-07 path
- **Android with clipboard support** → NIP-55 (Amber) path
- **iOS/Other mobile** → Read-only mode with explanation

### Sign-In Flow

**Desktop (NIP-07):**
1. User clicks "Sign In"
2. Browser extension popup appears inline
3. User approves
4. Signed in immediately (no page reload)

**Android (NIP-55 via Amber Clipboard API):**
1. User clicks "Sign In with Amber"
2. App opens Amber via `intent:` URL
3. Amber app opens for approval
4. User approves in Amber, result copied to clipboard
5. User returns to webapp (visibility change detected)
6. Webapp reads pubkey from clipboard
7. User is signed in

**iOS/Other Mobile:**
1. User clicks "Sign In"
2. Modal explains sign-in requires desktop or Android
3. Read-only mode notice shown

### Signing Events (Post-Auth)

**Desktop:** Extension popup appears inline, signs immediately.

**Android:** Each signing operation:
1. Opens Amber via intent URL
2. User approves, result copied to clipboard
3. User returns, webapp reads signed event from clipboard

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
- **User rejects in Amber:** Empty clipboard, error shown
- **Clipboard not supported:** Signer not available
- **Offline:** Sign-in button hidden or disabled

## Acceptance Criteria

- [ ] Desktop users can sign in with NIP-07 extension
- [ ] Android users can sign in with Amber (NIP-55)
- [ ] iOS users see "not available" message
- [ ] Pubkey persists across page reloads (localStorage)
- [ ] Signer type persists across sessions
- [ ] Read-only mode works fully offline
- [ ] GetStartedModal shows device-appropriate content
- [ ] Signing operations work on Android

## Technical Notes

### Implementation

Custom `AmberSigner` class following NIP-55 spec for web applications:

1. Navigates to `nostrsigner:?type=get_public_key&...` via `window.location.href`
2. Amber opens, user approves, Amber copies result to clipboard
3. User returns to webapp (visibility change detected)
4. Webapp reads pubkey from clipboard via `navigator.clipboard.readText()`

No callback URLs needed - Amber copies to clipboard when no callbackUrl is provided.

### Files

| File | Purpose |
|------|---------|
| `src/lib/utils/device.js` | Device detection utilities |
| `src/lib/nostr/signers/amber-signer.js` | NIP-55 web app implementation |
| `src/lib/stores/auth.svelte.js` | Dual signer support (ExtensionSigner + AmberSigner) |
| `src/lib/components/modals/GetStartedModal.svelte` | Device-specific UI |

### State Persistence

| Storage | Key | Value |
|---------|-----|-------|
| localStorage | `zapstore:pubkey` | Hex pubkey |
| localStorage | `zapstore:signer_type` | `'extension'` or `'android'` |

### Signer Detection

```javascript
// Desktop: NIP-07 extension
isDesktopDevice() && window.nostr  → 'extension'

// Android: Amber clipboard API
AmberClipboardSigner.SUPPORTED  → 'android'
// (checks: Android user agent + clipboard.readText support)
```
