/**
 * Blossom (NIP-96) file upload — standard HTTP upload with NIP-98 auth.
 * Uses nostr.build as the hardcoded Blossom server for now; response is standard NIP-94 tags.
 * Caller must pass signEvent (e.g. from auth store).
 */

/** Hardcoded Blossom server (nostr.build). NIP-98 is signed for this URL. */
const BLOSSOM_UPLOAD_URL = 'https://nostr.build/api/v2/upload/files';
/** Same-origin proxy to avoid CORS when uploading from the browser. */
const UPLOAD_PROXY_URL = '/api/upload';

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
