/**
 * Shared NIP-50 app search ordering (modal preview + full /apps?q= results).
 */
import { ZAPSTORE_PUBKEY } from '$lib/services/profile-search';

/** @param {{ pubkey?: string, dTag?: string }} app */
export function isIndexerCatalogApp(app) {
	if (!app?.pubkey || !ZAPSTORE_PUBKEY) return false;
	if (app.pubkey.toLowerCase() !== ZAPSTORE_PUBKEY.toLowerCase()) return false;
	if (app.dTag?.startsWith('dev.zapstore.')) return false;
	return true;
}

/** @param {{ createdAt?: number }[]} apps — newest first (release-recency proxy via app event time). */
export function sortAppsByLatestRelease(apps) {
	return [...apps].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/** Self-published first, then indexer republish; within each group newest first. */
export function sortAppsDeveloperFirst(apps) {
	return [...apps].sort((a, b) => {
		const ai = isIndexerCatalogApp(a) ? 1 : 0;
		const bi = isIndexerCatalogApp(b) ? 1 : 0;
		if (ai !== bi) return ai - bi;
		return (b.createdAt ?? 0) - (a.createdAt ?? 0);
	});
}

/**
 * NIP-50 relevance order: keep relay result order, but move indexer catalog
 * republish entries after developer-owned hits (stable within each group).
 * @param {{ pubkey?: string, dTag?: string }[]} apps
 */
export function sortAppsRelevanceDeveloperFirst(apps) {
	const tagged = apps.map((app, i) => ({ app, i }));
	const dev = tagged
		.filter((x) => !isIndexerCatalogApp(x.app))
		.sort((a, b) => a.i - b.i)
		.map((x) => x.app);
	const idx = tagged
		.filter((x) => isIndexerCatalogApp(x.app))
		.sort((a, b) => a.i - b.i)
		.map((x) => x.app);
	return [...dev, ...idx];
}
