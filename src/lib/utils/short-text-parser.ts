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

export type ShortTextSegment =
  | { type: "text"; value: string }
  | { type: "mention"; npub: string; pubkey: string; label?: string }
  | { type: "emoji"; shortcode: string; url: string | null }
  | { type: "nostr_ref"; raw: string; kind: "nevent" | "naddr" };

export interface ShortTextInput {
  text: string;
  emojiTags?: { shortcode: string; url: string }[];
}

const emojiMap = (emojiTags: { shortcode: string; url: string }[] | undefined): Map<string, string> => {
  const m = new Map<string, string>();
  if (!emojiTags) return m;
  for (const { shortcode, url } of emojiTags) {
    const key = shortcode.toLowerCase();
    if (!m.has(key)) m.set(key, url);
  }
  return m;
};

interface Match {
  index: number;
  length: number;
  segment: ShortTextSegment;
}

/**
 * Parse short text into segments for rendering.
 * Escapes are not applied here; the renderer must escape text segments.
 */
export function parseShortText(input: ShortTextInput): ShortTextSegment[] {
  const { text, emojiTags } = input;
  const emojiLookup = emojiMap(emojiTags);
  const matches: Match[] = [];

  // Find all nostr:... mentions and refs
  let m: RegExpExecArray | null;
  NOSTR_REGEX.lastIndex = 0;
  const lower = text.toLowerCase();
  while ((m = NOSTR_REGEX.exec(text)) !== null) {
    const raw = m[0];
    const prefix = raw.slice(0, 6); // "nostr:"
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
      } else if (decoded.type === "nevent" || decoded.type === "naddr") {
        matches.push({
          index: m.index,
          length: raw.length,
          segment: {
            type: "nostr_ref",
            raw,
            kind: decoded.type
          }
        });
      }
    } catch {
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
    const overlaps = matches.some(
      (x) => (start >= x.index && start < x.index + x.length) || (end > x.index && end <= x.index + x.length)
    );
    if (!overlaps) {
      const url = emojiLookup.get(shortcode.toLowerCase()) ?? null;
      matches.push({
        index: start,
        length: full.length,
        segment: { type: "emoji", shortcode, url }
      });
    }
  }

  // Sort by index and merge overlapping (first wins)
  matches.sort((a, b) => a.index - b.index);
  const merged: Match[] = [];
  for (const match of matches) {
    if (merged.length === 0 || match.index >= merged[merged.length - 1].index + merged[merged.length - 1].length) {
      merged.push(match);
    }
  }

  // Build segments with text in between
  const segments: ShortTextSegment[] = [];
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
