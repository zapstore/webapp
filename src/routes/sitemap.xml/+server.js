import { SITE_URL } from '$lib/config';

export const prerender = true;

const blogModules = import.meta.glob('/src/content/blog/**/*.md', { eager: true });
const docsModules = import.meta.glob('/src/content/docs/**/*.md', { eager: true });

function getBlogSlugs() {
	const slugs = [];
	for (const [path, mod] of Object.entries(blogModules)) {
		const rel = path.replace('/src/content/blog/', '');
		const parts = rel.split('/');
		if (parts[0] && (parts[0].endsWith('.md') || parts.length === 1)) {
			slugs.push({ slug: parts[0].replace('.md', ''), date: mod.metadata?.date });
		} else if (parts.length === 2 && parts[1] === '_index.md') {
			slugs.push({ slug: parts[0], date: mod.metadata?.date });
		}
	}
	return slugs;
}

function getDocsSlugs() {
	const slugs = [];
	for (const [path] of Object.entries(docsModules)) {
		const rel = path.replace('/src/content/docs/', '').replace('.md', '');
		if (!rel.endsWith('_index') && !rel.includes('/')) {
			slugs.push(rel);
		}
	}
	return slugs;
}

/** @type {Array<{path: string, priority: string, changefreq: string}>} */
const STATIC_ROUTES = [
	{ path: '/', priority: '1.0', changefreq: 'weekly' },
	{ path: '/apps', priority: '0.9', changefreq: 'daily' },
	{ path: '/stacks', priority: '0.8', changefreq: 'daily' },
	{ path: '/discover', priority: '0.8', changefreq: 'daily' },
	{ path: '/community', priority: '0.7', changefreq: 'weekly' },
	{ path: '/community/forum', priority: '0.7', changefreq: 'daily' },
	{ path: '/community/support', priority: '0.5', changefreq: 'monthly' },
	{ path: '/blog', priority: '0.7', changefreq: 'weekly' },
	{ path: '/docs', priority: '0.8', changefreq: 'weekly' },
	{ path: '/studio', priority: '0.6', changefreq: 'monthly' },
	{ path: '/terms', priority: '0.3', changefreq: 'yearly' }
];

export function GET() {
	const blogSlugs = getBlogSlugs();
	const docsSlugs = getDocsSlugs();

	const urls = [
		...STATIC_ROUTES.map((r) => ({
			loc: `${SITE_URL}${r.path}`,
			changefreq: r.changefreq,
			priority: r.priority,
			lastmod: undefined
		})),
		...blogSlugs.map(({ slug, date }) => ({
			loc: `${SITE_URL}/blog/${slug}`,
			changefreq: 'yearly',
			priority: '0.6',
			lastmod: date ? new Date(date).toISOString().split('T')[0] : undefined
		})),
		...docsSlugs.map((slug) => ({
			loc: `${SITE_URL}/docs/${slug}`,
			changefreq: 'monthly',
			priority: '0.7',
			lastmod: undefined
		}))
	];

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
	.map(
		(u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
  </url>`
	)
	.join('\n')}
</urlset>`;

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'public, max-age=3600'
		}
	});
}
