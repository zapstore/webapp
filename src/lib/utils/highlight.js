/**
 * Syntax highlighting via highlight.js.
 *
 * Only the languages below are bundled — add more by importing from
 * 'highlight.js/lib/languages/<name>' and calling hljs.registerLanguage().
 *
 * The colour theme lives in app.css under the `.hljs-*` selector block.
 */
import hljs from 'highlight.js/lib/core';

// ── Registered languages ──────────────────────────────────────────────────────
import langJson from 'highlight.js/lib/languages/json';
import langJs from 'highlight.js/lib/languages/javascript';
import langTs from 'highlight.js/lib/languages/typescript';
import langBash from 'highlight.js/lib/languages/bash';
import langPython from 'highlight.js/lib/languages/python';
import langRust from 'highlight.js/lib/languages/rust';
import langYaml from 'highlight.js/lib/languages/yaml';
import langMarkdown from 'highlight.js/lib/languages/markdown';
import langCss from 'highlight.js/lib/languages/css';
import langXml from 'highlight.js/lib/languages/xml'; // covers HTML/XML/SVG

hljs.registerLanguage('json', langJson);
hljs.registerLanguage('javascript', langJs);
hljs.registerLanguage('js', langJs);
hljs.registerLanguage('typescript', langTs);
hljs.registerLanguage('ts', langTs);
hljs.registerLanguage('bash', langBash);
hljs.registerLanguage('sh', langBash);
hljs.registerLanguage('shell', langBash);
hljs.registerLanguage('python', langPython);
hljs.registerLanguage('py', langPython);
hljs.registerLanguage('rust', langRust);
hljs.registerLanguage('rs', langRust);
hljs.registerLanguage('yaml', langYaml);
hljs.registerLanguage('yml', langYaml);
hljs.registerLanguage('markdown', langMarkdown);
hljs.registerLanguage('md', langMarkdown);
hljs.registerLanguage('css', langCss);
hljs.registerLanguage('html', langXml);
hljs.registerLanguage('xml', langXml);
hljs.registerLanguage('svg', langXml);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Highlight `code` for the given `lang`.
 * Returns an HTML string with `<span class="hljs-*">` elements for use with
 * CodeBlock's `html` prop. Falls back to escaped plain text for unknown languages.
 *
 * @param {string} code Raw source text
 * @param {string} lang Language from fenced code block info string (e.g. "json", "JSON")
 * @returns {string} HTML string
 */
export function highlightCode(code, lang) {
    if (!code) return '';
    const l = (lang ?? '').toLowerCase().trim();
    try {
        if (l && hljs.getLanguage(l)) {
            return hljs.highlight(code, { language: l, ignoreIllegals: true }).value;
        }
        return hljs.highlightAuto(code).value;
    } catch {
        return escapeHtml(code);
    }
}

/** Escape HTML special chars. */
export function escapeHtml(str) {
    return (str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Highlight a pre-stringified JSON string (for DetailsTab etc.).
 * @param {string} json
 * @returns {string}
 */
export function highlightJson(json) {
    return highlightCode(json, 'json');
}
