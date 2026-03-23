/**
 * Syntax highlighting via highlight.js.
 *
 * Only the languages below are bundled — add more by importing from
 * 'highlight.js/lib/languages/<name>' and calling hljs.registerLanguage().
 *
 * The colour theme lives in app.css under the `.hljs-*` selector block.
 */

import { browser } from '$app/environment';

// Lazy-loaded hljs instance
let hljsInstance = null;
let hljsPromise = null;

async function getHljs() {
    if (!browser) return null; // SSR: no highlighting
    if (hljsInstance) return hljsInstance;
    if (hljsPromise) return hljsPromise;
    
    hljsPromise = (async () => {
        const hljs = (await import('highlight.js/lib/core')).default;
        
        // Register languages
        const [langJson, langJs, langTs, langBash, langPython, langRust, langYaml, langMarkdown, langCss, langXml] = await Promise.all([
            import('highlight.js/lib/languages/json'),
            import('highlight.js/lib/languages/javascript'),
            import('highlight.js/lib/languages/typescript'),
            import('highlight.js/lib/languages/bash'),
            import('highlight.js/lib/languages/python'),
            import('highlight.js/lib/languages/rust'),
            import('highlight.js/lib/languages/yaml'),
            import('highlight.js/lib/languages/markdown'),
            import('highlight.js/lib/languages/css'),
            import('highlight.js/lib/languages/xml')
        ]);
        
        hljs.registerLanguage('json', langJson.default);
        hljs.registerLanguage('javascript', langJs.default);
        hljs.registerLanguage('js', langJs.default);
        hljs.registerLanguage('typescript', langTs.default);
        hljs.registerLanguage('ts', langTs.default);
        hljs.registerLanguage('bash', langBash.default);
        hljs.registerLanguage('sh', langBash.default);
        hljs.registerLanguage('shell', langBash.default);
        hljs.registerLanguage('python', langPython.default);
        hljs.registerLanguage('py', langPython.default);
        hljs.registerLanguage('rust', langRust.default);
        hljs.registerLanguage('rs', langRust.default);
        hljs.registerLanguage('yaml', langYaml.default);
        hljs.registerLanguage('yml', langYaml.default);
        hljs.registerLanguage('markdown', langMarkdown.default);
        hljs.registerLanguage('md', langMarkdown.default);
        hljs.registerLanguage('css', langCss.default);
        hljs.registerLanguage('html', langXml.default);
        hljs.registerLanguage('xml', langXml.default);
        hljs.registerLanguage('svg', langXml.default);
        
        hljsInstance = hljs;
        return hljs;
    })();
    
    return hljsPromise;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Highlight `code` for the given `lang`.
 * Returns an HTML string with `<span class="hljs-*">` elements for use with
 * CodeBlock's `html` prop. Falls back to escaped plain text for unknown languages.
 *
 * @param {string} code Raw source text
 * @param {string} lang Language from fenced code block info string (e.g. "json", "JSON")
 * @returns {Promise<string>} HTML string
 */
export async function highlightCode(code, lang) {
    if (!code) return '';
    const l = (lang ?? '').toLowerCase().trim();
    try {
        const hljs = await getHljs();
        if (!hljs) return escapeHtml(code); // SSR fallback
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
 * @returns {Promise<string>}
 */
export async function highlightJson(json) {
    return highlightCode(json, 'json');
}
