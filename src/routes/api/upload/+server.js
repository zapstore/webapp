/**
 * POST /api/upload — Proxy file upload to Blossom (nostr.build) to avoid CORS.
 * Browser sends FormData (file) + Authorization (NIP-98) to same-origin; we forward to nostr.build.
 */
import { json } from '@sveltejs/kit';

const BLOSSOM_UPLOAD_URL = 'https://nostr.build/api/v2/upload/files';

/** Max body size for upload (e.g. 10MB). Adjust if needed. */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST({ request }) {
	const auth = request.headers.get('Authorization');
	if (!auth || !auth.startsWith('Nostr ')) {
		return json({ error: 'Missing or invalid Authorization (Nostr base64)' }, { status: 401 });
	}

	let formData;
	try {
		formData = await request.formData();
	} catch (e) {
		return json({ error: 'Invalid form data' }, { status: 400 });
	}

	const file = formData.get('file');
	if (!file || !(file instanceof Blob)) {
		return json({ error: 'Missing file in form data' }, { status: 400 });
	}
	if (file.size > MAX_FILE_SIZE) {
		return json({ error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` }, { status: 413 });
	}

	const forwardForm = new FormData();
	forwardForm.append('file', file, file.name ?? 'file');

	const blossomResponse = await fetch(BLOSSOM_UPLOAD_URL, {
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
		const message = typeof body === 'object' && (body?.message ?? body?.error) ? (body.message ?? body.error) : `Upload failed: ${blossomResponse.status}`;
		return json({ error: message }, { status: blossomResponse.status });
	}

	return json(body);
}
