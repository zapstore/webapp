/**
 * Npub display helpers — same trimmed format as NpubDisplay.svelte (`npub1abc......xyz`).
 */
import { nip19 } from 'nostr-tools';

const GENERIC_LABELS = new Set(['anonymous', 'author', 'unknown', 'someone']);

/**
 * @param {string} npubStr
 * @param {boolean} [shouldTruncate=true]
 */
export function formatNpubDisplay(npubStr, shouldTruncate = true) {
	if (!npubStr) return '';
	const s = String(npubStr).trim();
	if (!shouldTruncate) return s;
	if (s.length < 14) return s;
	const afterPrefix = s.startsWith('npub1') ? s.slice(5, 8) : s.slice(0, 3);
	return s.startsWith('npub1')
		? `npub1${afterPrefix}......${s.slice(-6)}`
		: `${afterPrefix}......${s.slice(-6)}`;
}

/**
 * @param {string | null | undefined} pubkey Hex pubkey
 */
export function npubFromPubkey(pubkey) {
	if (!pubkey || !String(pubkey).trim()) return '';
	try {
		return nip19.npubEncode(String(pubkey).trim());
	} catch {
		return '';
	}
}

/**
 * @param {string | null | undefined} pubkey Hex pubkey
 */
export function formatNpubFromPubkey(pubkey) {
	const npub = npubFromPubkey(pubkey);
	return npub ? formatNpubDisplay(npub) : '';
}

/**
 * @param {string | null | undefined} value
 */
export function isRealProfileName(value) {
	const t = String(value ?? '').trim();
	if (!t) return false;
	if (t.toLowerCase().startsWith('npub1')) return false;
	if (/^[a-f0-9]{64}$/i.test(t)) return false;
	if (GENERIC_LABELS.has(t.toLowerCase())) return false;
	return true;
}

/**
 * UI label: profile display name, or trimmed npub — never "Author" / "Anonymous".
 * @param {{ displayName?: string, name?: string } | null | undefined} profile
 * @param {string | null | undefined} pubkey Hex pubkey
 */
export function profileDisplayLabel(profile, pubkey) {
	const label = profile?.displayName?.trim() || profile?.name?.trim() || '';
	if (isRealProfileName(label)) return label;
	return formatNpubFromPubkey(pubkey);
}

/**
 * ProfilePic `name` prop: only when kind:0 has a real display name (else null → user icon).
 * @param {{ displayName?: string, name?: string } | null | undefined} profile
 */
export function profileNameForPic(profile) {
	const label = profile?.displayName?.trim() || profile?.name?.trim() || '';
	return isRealProfileName(label) ? label : null;
}
