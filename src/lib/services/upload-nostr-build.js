/**
 * Media uploads: (1) Zapstore CDN — same protocol as zsp (`internal/blossom/client.go`):
 * kind 24242 signed auth, PUT `/upload`, `Content-Digest` = SHA-256 hex. (2) nostr.build —
 * NIP-98 POST multipart (comments / forum).
 */

import { ZAPSTORE_BLOSSOM_URL } from '$lib/config.js';

/** Hardcoded Blossom server (nostr.build). NIP-98 is signed for this URL. */
const BLOSSOM_UPLOAD_URL = 'https://nostr.build/api/v2/upload/files';
/** Same-origin proxy to avoid CORS when uploading from the browser. */
const UPLOAD_PROXY_URL = '/api/upload';

/** Matches zsp `KindBlossomAuth` / `BuildBlossomAuthEvent` (`internal/nostr/events.go`). */
const KIND_BLOSSOM_AUTH = 24242;
/** Matches zsp `blossom.AuthExpiration` (5 minutes). */
const ZAPSTORE_BLOSSOM_AUTH_TTL_SEC = 5 * 60;

/**
 * @param {ArrayBuffer} buf
 * @returns {Promise<string>} lowercase hex SHA-256
 */
async function sha256HexOfBuffer(buf) {
	const hashBuf = await crypto.subtle.digest('SHA-256', buf);
	return [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {string} fileHashHex
 * @param {number} expirationUnix
 * @returns {{ kind: number, created_at: number, tags: string[][], content: string }}
 */
function buildZapstoreBlossomAuthTemplate(fileHashHex, expirationUnix) {
	return {
		kind: KIND_BLOSSOM_AUTH,
		created_at: Math.floor(Date.now() / 1000),
		tags: [
			['t', 'upload'],
			['x', fileHashHex],
			['expiration', String(expirationUnix)]
		],
		content: `Upload ${fileHashHex}`
	};
}

/**
 * Upload a file to Zapstore's Blossom CDN (same flow as zsp: HEAD optional skip, PUT `/upload`).
 * @param {File} file
 * @param {function} signEvent - NIP-07 signEvent from auth store
 * @returns {Promise<string>} Public URL `https://cdn.zapstore.dev/<sha256>`
 */
export async function uploadFileToZapstoreCdn(file, signEvent) {
	if (!file || !signEvent) {
		throw new Error('file and signEvent are required');
	}
	const buf = await file.arrayBuffer();
	const hash = await sha256HexOfBuffer(buf);
	const expirationUnix = Math.floor(Date.now() / 1000) + ZAPSTORE_BLOSSOM_AUTH_TTL_SEC;
	const template = buildZapstoreBlossomAuthTemplate(hash, expirationUnix);
	const signed = await signEvent(template);
	if (!signed?.id) {
		throw new Error('Signing failed - no valid Blossom auth event returned');
	}
	const authHeader = `Nostr ${btoa(JSON.stringify(signed))}`;
	const form = new FormData();
	form.append('file', file);

	const response = await fetch(UPLOAD_PROXY_URL, {
		method: 'POST',
		headers: {
			Authorization: authHeader,
			'X-Blossom-Server': 'zapstore'
		},
		body: form
	});

	if (!response.ok) {
		const text = await response.text();
		let message = `Upload failed: ${response.status}`;
		try {
			const json = JSON.parse(text);
			if (json.message) message = json.message;
			else if (json.error) message = json.error;
		} catch {
			if (text) message = text.slice(0, 200);
		}
		throw new Error(message);
	}

	const data = await response.json().catch(() => ({}));
	if (data.url && typeof data.url === 'string') return data.url;
	return `${ZAPSTORE_BLOSSOM_URL}/${hash}`;
}

/**
 * Build NIP-98 Authorization header value for a given URL and method.
 * @param {string} url - Full URL (e.g. upload endpoint)
 * @param {string} method - HTTP method (e.g. 'POST')
 * @param {function} signEvent - NIP-07/nostr signEvent
 * @returns {Promise<string>} - "Nostr <base64-encoded-signed-event>"
 */
async function buildNip98Header(url, method, signEvent) {
	const template = {
		kind: 27235,
		created_at: Math.floor(Date.now() / 1000),
		tags: [
			['u', url],
			['method', method]
		],
		content: ''
	};
	const signed = await signEvent(template);
	return `Nostr ${btoa(JSON.stringify(signed))}`;
}

/**
 * Upload a single file to nostr.build. Returns the public URL of the uploaded file.
 * @param {File} file - The file to upload (image or video)
 * @param {function} signEvent - NIP-07 signEvent from auth store
 * @returns {Promise<string>} - Public URL of the uploaded file
 */
export async function uploadFileToNostrBuild(file, signEvent) {
	if (!file || !signEvent) {
		throw new Error('file and signEvent are required');
	}
	const auth = await buildNip98Header(BLOSSOM_UPLOAD_URL, 'POST', signEvent);
	const form = new FormData();
	form.append('file', file);

	// Use same-origin proxy to avoid CORS; NIP-98 is still signed for BLOSSOM_UPLOAD_URL
	const response = await fetch(UPLOAD_PROXY_URL, {
		method: 'POST',
		headers: {
			Authorization: auth
		},
		body: form
	});

	if (!response.ok) {
		const text = await response.text();
		let message = `Upload failed: ${response.status}`;
		try {
			const json = JSON.parse(text);
			if (json.message) message = json.message;
			else if (json.error) message = json.error;
		} catch {
			if (text) message = text.slice(0, 200);
		}
		throw new Error(message);
	}

	const data = await response.json().catch(() => ({}));
	// Blossom/NIP-94: response is often a raw array of tags [['url', '...'], ['m', '...'], ...]
	const tags = Array.isArray(data) ? data : (data.tags ?? data.data?.[0]?.tags ?? []);
	if (Array.isArray(tags)) {
		const urlTag = tags.find((t) => Array.isArray(t) && (t[0] === 'url' || t[0] === 'u') && t[1]);
		if (urlTag?.[1]) return String(urlTag[1]);
	}
	if (data.url) return data.url;
	if (data.data?.[0]?.url) return data.data[0].url;
	throw new Error('Upload response did not contain a URL');
}

/**
 * Accepted MIME types for forum/comment media (images and videos).
 */
export const ACCEPTED_MEDIA_TYPES = 'image/*,video/*';
export const ACCEPTED_MEDIA_EXTENSIONS = '.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.ogg,.mov';
