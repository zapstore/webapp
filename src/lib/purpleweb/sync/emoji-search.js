import { ZAPSTORE_RELAY } from '$lib/config';
import { queryEvents } from '../storage/dexie.js';
import { fetchFromRelays } from './service.js';

export const KIND_USER_EMOJI_LIST = 10030;
export const KIND_EMOJI_SET = 30030;

async function queryThenHydrate(filter, feature) {
	let events = await queryEvents(filter);
	if ((!events || events.length === 0) && typeof window !== 'undefined') {
		await fetchFromRelays([ZAPSTORE_RELAY], filter, { timeout: 5000, feature });
		events = await queryEvents(filter);
	}
	return events ?? [];
}

/**
 * Load custom emoji events for a user from Dexie, hydrating missing events from relays.
 *
 * Returns raw events so the UI-facing emoji service can keep pure shortcode
 * scoring and normalization outside the relay/storage boundary.
 *
 * @param {string | null | undefined} userPubkey
 */
export async function loadCustomEmojiEventsForUser(userPubkey) {
	if (!userPubkey) {
		return { userEmojiListEvents: [], userEmojiSets: [], referencedEmojiSets: [] };
	}

	const emojiListFilter = {
		kinds: [KIND_USER_EMOJI_LIST],
		authors: [userPubkey],
		limit: 1
	};
	const emojiSetFilter = {
		kinds: [KIND_EMOJI_SET],
		authors: [userPubkey],
		limit: 50
	};

	const [userEmojiListEvents, userEmojiSets] = await Promise.all([
		queryThenHydrate(emojiListFilter, 'emoji-search-list'),
		queryThenHydrate(emojiSetFilter, 'emoji-search-sets')
	]);

	const coords = [];
	for (const event of userEmojiListEvents) {
		for (const tag of event.tags?.filter((t) => t[0] === 'a' && t[1]?.startsWith('30030:')) ?? []) {
			const parts = String(tag[1]).split(':');
			const kind = Number(parts[0]);
			const pubkey = parts[1];
			const identifier = parts.slice(2).join(':');
			if (kind && pubkey && identifier !== undefined) coords.push({ kind, pubkey, identifier });
		}
	}

	let referencedEmojiSets = [];
	if (coords.length > 0) {
		const authors = [...new Set(coords.map((coord) => coord.pubkey))];
		const dTags = [...new Set(coords.map((coord) => coord.identifier))];
		referencedEmojiSets = await queryThenHydrate(
			{ kinds: [KIND_EMOJI_SET], authors, '#d': dTags, limit: coords.length + 5 },
			'emoji-search-referenced-sets'
		);
	}

	return { userEmojiListEvents, userEmojiSets, referencedEmojiSets };
}
