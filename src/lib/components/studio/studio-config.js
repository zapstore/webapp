// ── Test pubkey override ─────────────────────────────────────────────────────
// Pretend to be any developer for Studio (apps list + analytics). Accepts 64-char hex or npub1….
// When set, NIP-07 is not required for loading Studio data.
// Set to null to use the browser's NIP-07 pubkey (if available).
//
// Example: export const TEST_PUBKEY = 'npub1…';
export const TEST_PUBKEY = null;

// ── Dev toggle: force the "no apps published" empty state ────────────────────
// Set to true to see the Insights empty state regardless of actual app data.
export const FORCE_EMPTY_INSIGHTS = false;
