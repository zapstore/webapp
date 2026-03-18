import { Marked, Lexer } from 'marked';
/**
 * Markdown → sanitized HTML for user-generated content
 * (app descriptions, release notes, forum posts, etc.)
 *
 * Uses `marked` for parsing and a post-processing sanitizer that:
 *  - Strips dangerous tags (<script>, <style>, <iframe>, etc.)
 *  - Strips event-handler attributes (onclick, onerror, …)
 *  - Strips javascript: URLs
 *  - Forces external links to open in a new tab with noopener
 *
 * renderNostrMarkdown adds: bare nostr: URIs, custom :emoji:, wikilinks.
 */
const marked = new Marked({
    breaks: true, // Convert single \n to <br>
    gfm: true, // GitHub Flavored Markdown (tables, strikethrough, etc.)
});

// ── Nostr URI helpers ─────────────────────────────────────────────────────────
const NOSTR_BECH32_RE = /nostr:[a-z]+1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+/g;
const ALREADY_LINKED_RE = /\(nostr:[a-z]+1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+\)/g;

function shortenNostrUri(uri) {
    const entity = uri.slice('nostr:'.length);
    const prefix = entity.match(/^[a-z]+/)?.[0] ?? '';
    const data = entity.slice(prefix.length);
    if (data.length > 12) {
        return `@${prefix}1${data.slice(0, 6)}…${data.slice(-4)}`;
    }
    return `@${entity}`;
}

function processNostrUris(text) {
    const skip = new Set();
    let m;
    const skipRe = new RegExp(ALREADY_LINKED_RE.source, 'g');
    while ((m = skipRe.exec(text)) !== null) {
        skip.add(m.index + 1);
    }
    return text.replace(new RegExp(NOSTR_BECH32_RE.source, 'g'), (match, offset) => {
        if (skip.has(offset)) return match;
        return `[${shortenNostrUri(match)}](${match})`;
    });
}

// ── Custom emoji helpers ──────────────────────────────────────────────────────
function isSafeUrl(url) {
    return /^https?:\/\//.test(url) || /^data:image\//.test(url);
}

function normalizeWikiSlug(raw) {
    return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
// ── Sanitiser ────────────────────────────────────────────────────────────
const DANGEROUS_TAG_RE = /<(script|style|iframe|object|embed|form|input|textarea|select|button|applet|base|link|meta)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const DANGEROUS_SELF_CLOSING_RE = /<\/?(script|style|iframe|object|embed|form|input|textarea|select|button|applet|base|link|meta)\b[^>]*\/?>/gi;
const EVENT_HANDLER_RE = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
// Match entire href attribute whose value starts with javascript:
const JAVASCRIPT_URL_RE = /href\s*=\s*(?:"[^"]*javascript\s*:[^"]*"|'[^']*javascript\s*:[^']*'|javascript\s*:[^\s>]*)/gi;
function sanitizeHtml(html) {
    // 1. Remove dangerous tags (with content)
    html = html.replace(DANGEROUS_TAG_RE, '');
    // 2. Remove any remaining dangerous opening / self-closing tags
    html = html.replace(DANGEROUS_SELF_CLOSING_RE, '');
    // 3. Remove event handlers from remaining tags
    html = html.replace(EVENT_HANDLER_RE, '');
    // 4. Neutralise javascript: hrefs (replace entire attribute with safe value)
    html = html.replace(JAVASCRIPT_URL_RE, 'href="#"');
    // 5. Make all <a> links open in new tab safely
    html = html.replace(/<a\s+(?![^>]*target=)/gi, '<a target="_blank" rel="noopener noreferrer" ');
    // Ensure existing <a target=...> also get rel
    html = html.replace(/<a\s+([^>]*?)target="[^"]*"([^>]*)>/gi, (match, pre, post) => {
        if (/rel=/.test(pre + post))
            return match;
        return `<a ${pre}target="_blank" rel="noopener noreferrer"${post}>`;
    });
    return html;
}
// ── Public API ───────────────────────────────────────────────────────────
/**
 * Render Nostr-flavoured markdown to sanitised HTML.
 *
 * @param {string} text
 * @param {{ emojiMap?: Record<string, string>, wikiLinkFn?: (slug: string) => string }} [options]
 * @returns {string} Safe HTML for use with Svelte `{@html …}`
 */
export function renderNostrMarkdown(text, options = {}) {
    if (!text) return '';
    const { emojiMap = {}, wikiLinkFn } = options;
    let processed = text;

    if (wikiLinkFn) {
        processed = processed.replace(
            /(`+)[\s\S]*?\1|\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,
            (match, backtick, target, display) => {
                if (backtick !== undefined) return match;
                const slug = normalizeWikiSlug(target);
                const label = (display ?? target).trim();
                return `[${label}](${wikiLinkFn(slug)})`;
            }
        );
    }

    processed = processNostrUris(processed);

    const hasEmoji = Object.keys(emojiMap).length > 0;
    if (hasEmoji) {
        processed = processed.replace(/:([a-zA-Z0-9_-]+):/g, (match, shortcode) => {
            const url = emojiMap[shortcode];
            if (url && isSafeUrl(url)) {
                return `<img class="nostr-emoji" src="${url}" alt=":${shortcode}:" title=":${shortcode}:" loading="lazy" />`;
            }
            return match;
        });
    }

    const html = /** @type {string} */ (marked.parse(processed));
    return sanitizeHtml(html);
}

/**
 * Parse a markdown string and return sanitised HTML.
 * Delegates to renderNostrMarkdown (nostr: URIs linked automatically).
 */
export function renderMarkdown(text, options = {}) {
    return renderNostrMarkdown(text, options);
}

/**
 * Tokenize Nostr-flavoured markdown into a marked token tree.
 * Use with `<MarkdownBody>` for component-based rendering (code blocks, tables, etc.).
 *
 * @param {string} text
 * @param {{ emojiMap?: Record<string, string>, wikiLinkFn?: (slug: string) => string }} [options]
 * @returns {import('marked').Token[]}
 */
export function tokenizeNostrMarkdown(text, options = {}) {
    if (!text) return [];
    const { emojiMap = {}, wikiLinkFn } = options;
    let processed = text;

    if (wikiLinkFn) {
        processed = processed.replace(
            /(`+)[\s\S]*?\1|\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,
            (match, backtick, target, display) => {
                if (backtick !== undefined) return match;
                const slug = normalizeWikiSlug(target);
                const label = (display ?? target).trim();
                return `[${label}](${wikiLinkFn(slug)})`;
            }
        );
    }

    processed = processNostrUris(processed);

    const hasEmoji = Object.keys(emojiMap).length > 0;
    if (hasEmoji) {
        processed = processed.replace(/:([a-zA-Z0-9_-]+):/g, (match, shortcode) => {
            const url = emojiMap[shortcode];
            if (url && isSafeUrl(url)) {
                return `<img class="nostr-emoji" src="${url}" alt=":${shortcode}:" title=":${shortcode}:" loading="lazy" />`;
            }
            return match;
        });
    }

    const lexer = new Lexer({ breaks: true, gfm: true });
    return lexer.lex(processed);
}
