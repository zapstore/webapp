/**
 * GET/HEAD /download-latest — Same-origin latest Zapstore APK.
 *
 * Resolves the newest kind 3063 asset for dev.zapstore.app from the catalog
 * relay, then HEADs/streams the Blossom blob with Content-Disposition and
 * X-Zapstore-* metadata. Analytics headers are attached on GET upstream.
 *
 * Same-origin avoids Firefox dropping cross-origin CDN attachment navigations.
 */
import { error } from '@sveltejs/kit';
import { fetchLatestZapstoreAsset } from '$lib/purpleweb/server.js';
import {
	applyDownloadLatestCORS,
	blossomBlobUrl,
	blossomInstallHeaders,
	latestApkHeaders
} from '$lib/server/download-latest.js';

/**
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {'HEAD' | 'GET'} method
 */
async function handle(event, method) {
	const origin = event.request.headers.get('Origin');

	let asset;
	try {
		asset = await fetchLatestZapstoreAsset();
	} catch (err) {
		console.error('download-latest: failed to resolve asset', err);
		throw error(500, 'internal error');
	}

	if (!asset) {
		throw error(404, 'not found');
	}

	const headers = latestApkHeaders(asset.version, asset.hash);
	applyDownloadLatestCORS(headers, origin);

	const blobUrl = blossomBlobUrl(asset.hash);

	if (method === 'HEAD') {
		try {
			const upstream = await fetch(blobUrl, { method: 'HEAD' });
			const length = upstream.headers.get('Content-Length');
			if (upstream.ok && length) {
				headers.set('Content-Length', length);
			}
		} catch {
			// Metadata still useful without size.
		}
		return new Response(null, { status: 200, headers });
	}

	let upstream;
	try {
		upstream = await fetch(blobUrl, { headers: blossomInstallHeaders() });
	} catch (err) {
		console.error('download-latest: upstream fetch failed', err);
		throw error(502, 'Download failed');
	}

	if (!upstream.ok || !upstream.body) {
		throw error(upstream.status === 404 ? 404 : 502, 'Download failed');
	}

	const length = upstream.headers.get('Content-Length');
	if (length) headers.set('Content-Length', length);

	return new Response(upstream.body, { status: 200, headers });
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export function HEAD(event) {
	return handle(event, 'HEAD');
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export function GET(event) {
	return handle(event, 'GET');
}
