/**
 * Short-text parser for comments, zap messages, profile descriptions, etc.
 * Produces a list of segments so the UI can render text, @mentions (npub/nprofile),
 * custom emoji (:shortcode:), and nostr refs (nevent/naddr) without raw @html.
 *
 * Input format matches ShortTextInput serialization:
 * - text may contain nostr:npub..., nostr:nprofile..., nostr:nevent..., nostr:naddr..., and :shortcode:
 * - emojiTags maps shortcode -> url for custom emoji
 */
import * as nip19 from "nostr-tools/nip19";
/** Bech32 data part: alphanumeric (excluding b,i,o); length varies by type */
const NOSTR_PREFIX = "nostr:(npub|nprofile|nevent|naddr)1";
const NOSTR_REGEX = new RegExp(`${NOSTR_PREFIX}[a-z0-9]+`, "gi");
/** Emoji shortcode: colon-delimited, no spaces (1–100 chars) */
const EMOJI_REGEX = /:([^:\s]{1,100}):/g;
const emojiMap = (emojiTags) => {
    const m = new Map();
    if (!emojiTags)
        return m;
    for (const { shortcode, url } of emojiTags) {
        const key = shortcode.toLowerCase();
        if (!m.has(key))
            m.set(key, url);
    }
    return m;
};

/** Strip punctuation often glued to URLs in prose (closing parens, etc.). */
function trimTrailingUrlNoise(s) {
    return s.replace(/[),.;:!?'"`\]]+$/g, '');
}

/**
 * True when a whole line is probably a direct image/video embed (MediaBlock), not a generic web link.
 * Serialized composer media is usually Blossom (nostr.build / void.cat) or has a media file extension.
 */
export function isLikelyDirectMediaUrl(raw) {
    const u = String(raw ?? '').trim();
    if (!/^https?:\/\//i.test(u))
        return false;
    let parsed;
    try {
        parsed = new URL(u);
    }
    catch {
        return false;
    }
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if ((host === 'nostr.build' || host.endsWith('.nostr.build')) && path.startsWith('/api/'))
        return false;
    const pathOnly = path;
    if (/\.(mp4|webm|ogg|mov)$/i.test(pathOnly))
        return true;
    if (/\.(jpg|jpeg|png|gif|webp|avif|svg|bmp|ico)$/i.test(pathOnly))
        return true;
    if (host === 'void.cat')
        return true;
    if (host === 'nostr.build' || host.endsWith('.nostr.build'))
        return true;
    return false;
}

const AUTOLINK_URL_RE = /https?:\/\/[^\s<>'"]+/gi;

/**
 * Split a plain text span into text + https URL chunks for inline autolinks.
 * @returns {Array<{ type: 'text', value: string } | { type: 'url', href: string }>}
 */
export function splitTextAutolinkUrls(text) {
    if (!text)
        return [{ type: 'text', value: '' }];
    const parts = [];
    let last = 0;
    AUTOLINK_URL_RE.lastIndex = 0;
    let m;
    while ((m = AUTOLINK_URL_RE.exec(text)) !== null) {
        const href = trimTrailingUrlNoise(m[0]);
        if (m.index > last)
            parts.push({ type: 'text', value: text.slice(last, m.index) });
        parts.push({ type: 'url', href });
        last = m.index + m[0].length;
    }
    if (last < text.length)
        parts.push({ type: 'text', value: text.slice(last) });
    return parts.length ? parts : [{ type: 'text', value: text }];
}

/**
 * Parse short text into segments for rendering.
 * Escapes are not applied here; the renderer must escape text segments.
 */
export function parseShortText(input) {
    const { text, emojiTags } = input;
    const emojiLookup = emojiMap(emojiTags);
    const matches = [];
    // Find all nostr:... mentions and refs
    let m;
    NOSTR_REGEX.lastIndex = 0;
    while ((m = NOSTR_REGEX.exec(text)) !== null) {
        const raw = m[0];
        const rest = raw.slice(6);
        try {
            const decoded = nip19.decode(rest);
            if (decoded.type === "npub" || decoded.type === "nprofile") {
                const pubkey = decoded.type === "npub" ? decoded.data : decoded.data.pubkey;
                matches.push({
                    index: m.index,
                    length: raw.length,
                    segment: {
                        type: "mention",
                        npub: rest,
                        pubkey,
                        label: undefined
                    }
                });
            }
            else if (decoded.type === "nevent" || decoded.type === "naddr") {
                matches.push({
                    index: m.index,
                    length: raw.length,
                    segment: {
                        type: "nostr_ref",
                        raw,
                        kind: decoded.type,
                        naddr: decoded.type === "naddr" ? rest : undefined
                    }
                });
            }
        }
        catch {
            // Invalid bech32: treat as text (don't add to matches)
        }
    }
    // Find all :shortcode: emoji (only if not already part of a nostr match)
    EMOJI_REGEX.lastIndex = 0;
    while ((m = EMOJI_REGEX.exec(text)) !== null) {
        const full = m[0];
        const shortcode = m[1];
        const start = m.index;
        const end = start + full.length;
        // Skip if this span overlaps any existing match
        const overlaps = matches.some((x) => (start >= x.index && start < x.index + x.length) || (end > x.index && end <= x.index + x.length));
        if (!overlaps && shortcode) {
            const url = emojiLookup.get(shortcode.toLowerCase()) ?? null;
            matches.push({
                index: start,
                length: full.length,
                segment: { type: "emoji", shortcode, url: url ?? "" }
            });
        }
    }
    // Sort by index and merge overlapping (first wins)
    matches.sort((a, b) => a.index - b.index);
    const merged = [];
    for (const match of matches) {
        const last = merged[merged.length - 1];
        if (merged.length === 0 || !last || match.index >= last.index + last.length) {
            merged.push(match);
        }
    }
    // Build segments with text in between
    const segments = [];
    let lastEnd = 0;
    for (const { index, length, segment } of merged) {
        if (index > lastEnd) {
            const value = text.slice(lastEnd, index);
            segments.push({ type: "text", value });
        }
        segments.push(segment);
        lastEnd = index + length;
    }
    if (lastEnd < text.length) {
        segments.push({ type: "text", value: text.slice(lastEnd) });
    }
    if (segments.length === 0) {
        segments.push({ type: "text", value: text });
    }
    return segments;
}
