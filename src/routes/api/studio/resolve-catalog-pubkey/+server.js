import { json } from '@sveltejs/kit';
import { resolveStudioCatalogPubkeyServer } from '$lib/studio/resolve-studio-catalog-pubkey.server.js';

/**
 * Resolves the Studio policy for a signer pubkey: which catalog author backs the
 * sidebar, and whether the signer may URL-access apps from the indexer catalog.
 * GET ?signer=<64hex>
 */
export async function GET({ url }) {
	const signer = url.searchParams.get('signer') ?? '';
	const raw = String(signer).trim().toLowerCase();
	if (!/^[0-9a-f]{64}$/.test(raw)) {
		return json({ error: 'signer must be a 64-character hex pubkey' }, { status: 400 });
	}
	const policy = resolveStudioCatalogPubkeyServer(raw);
	return json(policy);
}
