import { json } from '@sveltejs/kit';
import { fetchAppsByReleases } from '$lib/nostr/server';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 80;

function parseLimit(raw) {
	const limit = Number(raw);
	if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
	return Math.min(Math.floor(limit), MAX_LIMIT);
}

function parseCursor(raw) {
	if (!raw) return undefined;
	const cursor = Number(raw);
	if (!Number.isFinite(cursor)) return undefined;
	return Math.floor(cursor);
}

export async function GET({ url }) {
	const limit = parseLimit(url.searchParams.get('limit'));
	const cursor = parseCursor(url.searchParams.get('cursor'));
	const { apps, nextCursor, seedEvents } = await fetchAppsByReleases(limit, cursor);
	return json({ apps, nextCursor, seedEvents });
}
