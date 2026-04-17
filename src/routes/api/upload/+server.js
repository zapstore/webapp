/**
 * POST /api/upload — Same-origin proxy for Blossom uploads (CORS bypass).
 *
 * - Default: nostr.build multipart + NIP-98 (Authorization decodes to kind 27235).
 * - `X-Blossom-Server: zapstore`: Zapstore CDN — same as zsp (`PUT https://cdn.zapstore.dev/upload`,
 *   kind 24242 auth in Authorization, `Content-Digest` = SHA-256 hex of body).
 */
import { json } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { ZAPSTORE_BLOSSOM_URL } from '$lib/config.js';

const NOSTR_BUILD_UPLOAD_URL = 'https://nostr.build/api/v2/upload/files';
const ZAPSTORE_PUT_URL = `${ZAPSTORE_BLOSSOM_URL}/upload`;
const KIND_BLOSSOM_AUTH = 24242;

/** Max body size for upload (e.g. 10MB). */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * @param {Buffer} buf
 * @returns {string}
 */
function sha256Hex(buf) {
	return createHash('sha256').update(buf).digest('hex');
}

/**
 * @param {string} auth
 * @returns {Record<string, unknown>}
 */
function decodeNostrAuthPayload(auth) {
	const raw = auth.slice('Nostr '.length).trim();
	const json = Buffer.from(raw, 'base64').toString('utf8');
	return /** @type {Record<string, unknown>} */ (JSON.parse(json));
}

export async function POST({ request }) {
	const auth = request.headers.get('Authorization');
	if (!auth || !auth.startsWith('Nostr ')) {
		return json({ error: 'Missing or invalid Authorization (Nostr base64)' }, { status: 401 });
	}

	let formData;
	try {
		formData = await request.formData();
	} catch {
		return json({ error: 'Invalid form data' }, { status: 400 });
	}

	const file = formData.get('file');
	if (!file || !(file instanceof Blob)) {
		return json({ error: 'Missing file in form data' }, { status: 400 });
	}
	if (file.size > MAX_FILE_SIZE) {
		return json({ error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` }, { status: 413 });
	}

	const buffer = Buffer.from(await file.arrayBuffer());
	const blossomTarget = request.headers.get('x-blossom-server');

	if (blossomTarget === 'zapstore') {
		let authEvent;
		try {
			authEvent = decodeNostrAuthPayload(auth);
		} catch {
			return json({ error: 'Invalid Authorization payload' }, { status: 401 });
		}
		if (authEvent.kind !== KIND_BLOSSOM_AUTH) {
			return json({ error: 'Zapstore Blossom requires kind 24242 authorization' }, { status: 401 });
		}
		const tags = /** @type {unknown} */ (authEvent.tags);
		const xTag =
			Array.isArray(tags) ? tags.find((t) => Array.isArray(t) && t[0] === 'x')?.[1] : undefined;
		const xLower = typeof xTag === 'string' ? xTag.toLowerCase() : '';
		const digestHex = sha256Hex(buffer);
		if (!xLower || xLower !== digestHex) {
			return json(
				{ error: 'File hash does not match Blossom auth event x tag' },
				{ status: 400 }
			);
		}

		const blobUrl = `${ZAPSTORE_BLOSSOM_URL}/${digestHex}`;
		try {
			const headRes = await fetch(blobUrl, { method: 'HEAD' });
			if (headRes.ok) {
				return json({ url: blobUrl, sha256: digestHex, existed: true });
			}
		} catch {
			/* continue to PUT */
		}

		const contentType =
			file.type && typeof file.type === 'string' && file.type.length > 0
				? file.type
				: 'application/octet-stream';

		const blossomResponse = await fetch(ZAPSTORE_PUT_URL, {
			method: 'PUT',
			headers: {
				Authorization: auth,
				'Content-Type': contentType,
				'Content-Digest': digestHex,
				'Content-Length': String(buffer.length)
			},
			body: buffer
		});

		if (!blossomResponse.ok) {
			const reason =
				blossomResponse.headers.get('X-Reason')?.trim() ||
				(await blossomResponse.text().then((t) => t.trim().slice(0, 512))) ||
				`Upload failed: ${blossomResponse.status}`;
			return json({ error: reason }, { status: blossomResponse.status });
		}

		let parsed = {};
		try {
			parsed = await blossomResponse.json();
		} catch {
			/* zsp client tolerates empty / non-JSON */
		}
		const url =
			typeof parsed.url === 'string' && parsed.url.length > 0 ? parsed.url : blobUrl;
		return json({ url, sha256: digestHex });
	}

	const forwardForm = new FormData();
	forwardForm.append('file', file, file.name ?? 'file');

	const blossomResponse = await fetch(NOSTR_BUILD_UPLOAD_URL, {
		method: 'POST',
		headers: {
			Authorization: auth
		},
		body: forwardForm
	});

	const contentType = blossomResponse.headers.get('content-type') ?? '';
	const isJson = contentType.includes('application/json');
	const body = isJson
		? await blossomResponse.json().catch(() => ({}))
		: await blossomResponse.text();

	if (!blossomResponse.ok) {
		const message =
			typeof body === 'object' && (body?.message ?? body?.error)
				? (body.message ?? body.error)
				: `Upload failed: ${blossomResponse.status}`;
		return json({ error: message }, { status: blossomResponse.status });
	}

	return json(body);
}
