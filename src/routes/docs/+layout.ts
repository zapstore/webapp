export const prerender = true;

interface NavNode {
	id: string;
	title: string;
	href: string | null;
	children: NavNode[];
	weight: number | null;
}

interface DocModule {
	metadata?: {
		title?: string;
		weight?: number;
	};
}

// Eager load all docs at build time - instant lookups, no server fetch needed
const modules = import.meta.glob<DocModule>('/src/content/docs/**/*.md', { eager: true });

// Pre-compute navigation at module load time (runs once)
function buildNavigation(): NavNode[] {
	const nav: NavNode[] = [];
	const folders: Record<string, NavNode> = {};

	for (const [path, mod] of Object.entries(modules)) {
		const rel = path.replace('/src/content/docs/', '').replace('.md', '');
		const parts = rel.split('/');
		const isIndex = parts[parts.length - 1] === '_index';
		const title = mod.metadata?.title || formatTitle(parts[parts.length - 1] || '');
		const weight = mod.metadata?.weight ?? 999;

		if (parts.length === 1 && !isIndex) {
			nav.push({
				id: `/docs/${rel}`,
				title,
				href: `/docs/${rel}`,
				children: [],
				weight
			});
		} else if (parts.length === 2 && isIndex) {
			const folder = parts[0];
			if (!folders[folder]) {
				folders[folder] = {
					id: `/docs/${folder}`,
					title,
					href: `/docs/${folder}`,
					children: [],
					weight
				};
			} else {
				folders[folder].title = title;
				folders[folder].href = `/docs/${folder}`;
				folders[folder].weight = weight;
			}
		} else if (parts.length === 2 && !isIndex) {
			const folder = parts[0];
			if (!folders[folder]) {
				folders[folder] = {
					id: `/docs/${folder}`,
					title: formatTitle(folder),
					href: null,
					children: [],
					weight: 999
				};
			}
			folders[folder].children.push({
				id: `/docs/${rel}`,
				title,
				href: `/docs/${rel}`,
				children: [],
				weight
			});
		}
	}

	for (const folder of Object.values(folders)) {
		folder.children.sort((a, b) => (a.weight ?? 999) - (b.weight ?? 999) || a.title.localeCompare(b.title));
		nav.push(folder);
	}

	nav.sort((a, b) => (a.weight ?? 999) - (b.weight ?? 999) || a.title.localeCompare(b.title));
	return nav;
}

function formatTitle(name: string): string {
	if (name === '_index') return 'Overview';
	return name.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// Navigation is computed once at module load
const navigation = buildNavigation();

export function load() {
	return { navigation };
}
