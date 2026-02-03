import { readdir, stat, readFile } from 'fs/promises';
import { join, resolve } from 'path';

const CONTENT_DIR = resolve(process.cwd(), 'src/content');

interface MarkdownFile {
	slug: string;
	path: string;
	isIndex: boolean;
	directory: string;
	filename: string;
	frontmatter: {
		title: string | null;
		weight: number | null;
		sidebarOpen: boolean | null;
	};
}

/**
 * Get all markdown files in a directory recursively
 * Supports _index.md as folder root pattern
 * Server-side only
 */
export async function getMarkdownFiles(contentType = 'docs', basePath = ''): Promise<MarkdownFile[]> {
	const dir = join(CONTENT_DIR, contentType, basePath);
	const files: MarkdownFile[] = [];

	try {
		const entries = await readdir(dir);

		for (const entry of entries) {
			const fullPath = join(dir, entry);
			const stats = await stat(fullPath);

			if (stats.isDirectory()) {
				// Recursively get files from subdirectories
				const subFiles = await getMarkdownFiles(contentType, join(basePath, entry));
				files.push(...subFiles);
			} else if (entry.endsWith('.md')) {
				const slug =
					entry === '_index.md'
						? basePath || '' // _index.md becomes the folder's root
						: join(basePath, entry.replace('.md', ''));

				// Read frontmatter for title/weight/sidebar.open
				let fm: { title?: string; weight?: number; sidebarOpen?: boolean } = {};
				try {
					const raw = await readFile(fullPath, 'utf8');
					fm = extractFrontmatter(raw);
				} catch {
					// ignore parsing errors, keep defaults
				}

				files.push({
					slug: slug.replace(/\\/g, '/'), // Normalize path separators
					path: fullPath,
					isIndex: entry === '_index.md',
					directory: basePath,
					filename: entry,
					frontmatter: {
						title: fm.title ?? null,
						weight: typeof fm.weight === 'number' ? fm.weight : null,
						sidebarOpen: typeof fm.sidebarOpen === 'boolean' ? fm.sidebarOpen : null
					}
				});
			}
		}
	} catch (error) {
		console.error(`Error reading ${contentType} directory:`, error);
	}

	return files;
}

function extractFrontmatter(raw: string): { title?: string; weight?: number; sidebarOpen?: boolean } {
	// Expect frontmatter at the very top delimited by --- lines
	const match = raw.match(/^---\n([\s\S]*?)\n---/);
	if (!match || !match[1]) return {};
	const yaml = match[1];

	const out: { title?: string; weight?: number; sidebarOpen?: boolean } = {};

	// title: string
	const titleMatch = yaml.match(/^title\s*:\s*(.+)$/m);
	if (titleMatch && titleMatch[1]) {
		out.title = cleanupYamlValue(titleMatch[1]);
	}

	// weight: number
	const weightMatch = yaml.match(/^weight\s*:\s*([0-9]+)/m);
	if (weightMatch && weightMatch[1]) {
		out.weight = Number(weightMatch[1]);
	}

	// sidebar.open: boolean
	// Capture sidebar block
	const sidebarBlockMatch = yaml.match(/^sidebar\s*:\s*\n([\s\S]*?)(?:\n[^\s]|$)/m);
	if (sidebarBlockMatch && sidebarBlockMatch[1]) {
		const block = sidebarBlockMatch[1];
		const openMatch = block.match(/^\s*open\s*:\s*(true|false)\s*$/m);
		if (openMatch && openMatch[1]) {
			out.sidebarOpen = openMatch[1] === 'true';
		}
	}

	return out;
}

function cleanupYamlValue(v: string): string {
	let s = v.trim();
	if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
		s = s.slice(1, -1);
	}
	return s;
}
