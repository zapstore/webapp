/**
 * Studio analytics proxy.
 *
 * Forwards authenticated requests to the relay's analytics HTTP endpoint and
 * returns the result. The relay handles NIP-98 verification and DB queries.
 *
 * Environment variable (required):
 *   RELAY_ANALYTICS_URL — base URL of the relay's analytics API, e.g.
 *                         https://relay.zapstore.dev  (no trailing slash)
 *
 * Returns 503 when the env var is not configured (local dev without relay).
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export async function GET({ request, url }) {
	const relayUrl = env.RELAY_ANALYTICS_URL;
	if (!relayUrl) {
		return json(
			{ error: 'Analytics relay URL not configured on this server' },
			{ status: 503 }
		);
	}

	// Forward query params (pubkey, from, to) and the NIP-98 Authorization header as-is.
	const targetUrl = `${relayUrl}/analytics${url.search}`;

	const authHeader = request.headers.get('Authorization');
	if (!authHeader) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let relayRes;
	try {
		relayRes = await fetch(targetUrl, {
			headers: {
				Authorization: authHeader,
				'Content-Type': 'application/json'
			}
		});
	} catch (err) {
		console.error('[Studio analytics] relay unreachable:', err);
		return json({ error: 'Analytics relay unreachable' }, { status: 502 });
	}

	if (!relayRes.ok) {
		const text = await relayRes.text().catch(() => '');
		return json({ error: text || relayRes.statusText }, { status: relayRes.status });
	}

	const data = await relayRes.json();
	return json(data);
}
