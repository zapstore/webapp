import { error } from '@sveltejs/kit';
export const prerender = true;
// Eager load all docs at build time - instant lookups
const modules = import.meta.glob('/src/content/docs/**/*.md', { eager: true });
export function entries() {
    return [
        { slug: 'quickstart' },
        { slug: 'publish' },
        { slug: 'faq' },
        { slug: 'trust-model' },
    ];
}
function normalizeSlug(param) {
    if (param === undefined || param === null || param === '')
        return '';
    const raw = typeof param === 'string' ? param : Array.isArray(param) ? param.join('/') : String(param);
    return raw.replace(/\\/g, '/').split('/').filter((s) => s.length > 0).join('/');
}
export function load({ params }) {
    const slug = normalizeSlug(params.slug);
    let targetPath;
    if (!slug) {
        // Root docs page - try _index.md first, then fallback to other files
        const indexPath = '/src/content/docs/_index.md';
        if (modules[indexPath]) {
            targetPath = indexPath;
        }
        else {
            // Fallback to first available file
            const availablePaths = Object.keys(modules);
            targetPath = availablePaths.find((path) => path.includes('_index.md')) || availablePaths[0];
        }
    }
    else {
        // Try different possible paths
        const possiblePaths = [`/src/content/docs/${slug}.md`, `/src/content/docs/${slug}/_index.md`];
        // Find the first existing path
        targetPath = possiblePaths.find((path) => modules[path]);
    }
    const post = targetPath ? modules[targetPath] : undefined;
    if (!post) {
        throw error(404, `Documentation page not found: ${slug}`);
    }
    return {
        content: post.default,
        metadata: post.metadata || {}
    };
}
