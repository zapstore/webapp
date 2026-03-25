/**
 * Proxies GET requests to the Zapstore relay analytics HTTP API (JSON over HTTP).
 *
 * Set STUDIO_ANALYTICS_HTTP_URL to the relay bind address, e.g. http://127.0.0.1:3336
 * (no trailing slash). This server-side fetch avoids CORS.
 *
 * In `vite dev` / `bun run dev`, when the var is unset we default to http://127.0.0.1:3336
 * so local relay analytics works without editing .env. Production builds must set the env var.
 *
 * Forwards paths like v1/impressions → {base}/v1/impressions?...
 */

import { dev } from '$app/environment';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const DEV_DEFAULT_ANALYTICS_BASE = 'http://127.0.0.1:3336';

/** @satisfies {import('@sveltejs/kit').RequestHandler} */
export async function GET({ params, url, fetch: skFetch }) {
	const configured = env.STUDIO_ANALYTICS_HTTP_URL?.replace(/\/$/, '');
	const base =
		configured || (dev ? DEV_DEFAULT_ANALYTICS_BASE.replace(/\/$/, '') : '');
	if (!base) {
		return json({ error: 'Studio analytics HTTP API not configured (STUDIO_ANALYTICS_HTTP_URL)' }, { status: 503 });
	}

	const raw = params.path;
	const subpath = Array.isArray(raw) ? raw.filter(Boolean).join('/') : String(raw ?? '');
	if (!subpath || subpath.includes('..')) {
		return json({ error: 'Invalid path' }, { status: 400 });
	}

	const target = `${base}/${subpath}${url.search}`;

	let relayRes;
	try {
		relayRes = await skFetch(target, {
			headers: { Accept: 'application/json' }
		});
	} catch (err) {
		console.error('[Studio analytics-http] unreachable:', err);
		return json({ error: 'Analytics server unreachable' }, { status: 502 });
	}

	const ct = relayRes.headers.get('content-type') || '';
	if (ct.includes('application/json')) {
		try {
			let data = await relayRes.json();
			// Relay may encode “no rows” as JSON `null`; contract is a top-level array (Studio + browser expect `[]`).
			if (relayRes.ok && (data === null || data === undefined)) {
				data = [];
			}
			return json(data, { status: relayRes.status });
		} catch {
			return json({ error: 'Invalid JSON from analytics server' }, { status: 502 });
		}
	}

	const text = await relayRes.text();
	return new Response(text, {
		status: relayRes.status,
		headers: { 'Content-Type': ct || 'text/plain; charset=utf-8' }
	});
}
