/**
 * Resolves the Studio policy for the signed-in pubkey via `/api/studio/resolve-catalog-pubkey`.
 * Returns the catalog author pubkey (whose kind 32267 events power the sidebar) and whether
 * the signer is permitted to URL-access apps from the Zapstore indexer catalog.
 *
 * Caches per signer in sessionStorage so a return visit can work offline after one online resolve.
 */

const CACHE_PREFIX = 'zs.studio.catalogPolicy:v1:';

/**
 * @param {string} signerPubkeyHex
 * @returns {Promise<{ catalogPubkey: string, indexerAccess: boolean }>}
 */
export async function resolveStudioCatalogPubkey(signerPubkeyHex) {
	const s = String(signerPubkeyHex ?? '').toLowerCase();
	const fallback = { catalogPubkey: s, indexerAccess: false };
	if (!/^[0-9a-f]{64}$/.test(s)) return fallback;

	const cacheKey = CACHE_PREFIX + s;
	try {
		const res = await fetch(
			`/api/studio/resolve-catalog-pubkey?signer=${encodeURIComponent(s)}`
		);
		if (res.ok) {
			const data = await res.json();
			const cat = data?.catalogPubkey;
			if (typeof cat === 'string' && /^[0-9a-f]{64}$/i.test(cat)) {
				const policy = {
					catalogPubkey: cat.toLowerCase(),
					indexerAccess: data?.indexerAccess === true
				};
				try {
					sessionStorage.setItem(cacheKey, JSON.stringify(policy));
				} catch {
					/* private mode / quota */
				}
				return policy;
			}
		}
	} catch {
		/* offline / network */
	}

	try {
		const cached = sessionStorage.getItem(cacheKey);
		if (cached) {
			const parsed = JSON.parse(cached);
			if (
				parsed &&
				typeof parsed.catalogPubkey === 'string' &&
				/^[0-9a-f]{64}$/i.test(parsed.catalogPubkey)
			) {
				return {
					catalogPubkey: parsed.catalogPubkey.toLowerCase(),
					indexerAccess: parsed.indexerAccess === true
				};
			}
		}
	} catch {
		/* ignore */
	}

	return fallback;
}
