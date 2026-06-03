/**
 * Parse docs markdown files (frontmatter + body) from raw ?raw imports.
 */

/**
 * @param {string} yaml
 * @returns {Record<string, string | number | boolean>}
 */
function parseSimpleYaml(yaml) {
	/** @type {Record<string, string | number | boolean>} */
	const meta = {};
	for (const line of yaml.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const colon = trimmed.indexOf(':');
		if (colon === -1) continue;
		const key = trimmed.slice(0, colon).trim();
		let value = trimmed.slice(colon + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (value === 'true') meta[key] = true;
		else if (value === 'false') meta[key] = false;
		else if (/^\d+$/.test(value)) meta[key] = Number(value);
		else meta[key] = value;
	}
	return meta;
}

/**
 * @param {string} raw Full file contents including frontmatter.
 */
export function parseDocMarkdown(raw) {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) {
		return { metadata: {}, body: raw.trim() };
	}
	return {
		metadata: parseSimpleYaml(match[1]),
		body: match[2].trim()
	};
}

/**
 * @param {string} slug Normalized slug (no leading/trailing slashes).
 * @param {Record<string, string>} rawModules import.meta.glob(..., { query: '?raw' })
 */
export function resolveDocRawPath(slug, rawModules) {
	if (!slug) {
		const indexPath = '/src/content/docs/_index.md';
		if (rawModules[indexPath]) return indexPath;
		const available = Object.keys(rawModules);
		return available.find((p) => p.includes('_index.md')) ?? available[0];
	}
	const candidates = [`/src/content/docs/${slug}.md`, `/src/content/docs/${slug}/_index.md`];
	return candidates.find((path) => rawModules[path]);
}
