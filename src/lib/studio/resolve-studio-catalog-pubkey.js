/**
 * Fetches catalog author pubkey from the server (indexer-view signer list lives server-side only).
 * Caches per signer in sessionStorage so a return visit can work offline after one online resolve.
 */

const CACHE_PREFIX = 'zs.studio.catalogPubkey:v1:';

/** @param {string} signerPubkeyHex */
export async function resolveStudioCatalogPubkey(signerPubkeyHex) {
	const s = String(signerPubkeyHex ?? '').toLowerCase();
	if (!/^[0-9a-f]{64}$/.test(s)) return s;

	const cacheKey = CACHE_PREFIX + s;
	try {
		const res = await fetch(
			`/api/studio/resolve-catalog-pubkey?signer=${encodeURIComponent(s)}`
		);
		if (res.ok) {
			const data = await res.json();
			const cat = data?.catalogPubkey;
			if (typeof cat === 'string' && /^[0-9a-f]{64}$/i.test(cat)) {
				const out = cat.toLowerCase();
				try {
					sessionStorage.setItem(cacheKey, out);
				} catch {
					/* private mode / quota */
				}
				return out;
			}
		}
	} catch {
		/* offline / network */
	}

	try {
		const cached = sessionStorage.getItem(cacheKey);
		if (cached && /^[0-9a-f]{64}$/i.test(cached)) return cached.toLowerCase();
	} catch {
		/* ignore */
	}

	return s;
}
