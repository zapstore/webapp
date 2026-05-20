import { EVENT_KINDS, FORUM_RELAY, ZAPSTORE_COMMUNITY_PUBKEY } from '$lib/config.js';
import { queryEvent } from '../storage/dexie.js';
import { parseForumPost } from '$lib/nostr/models.js';
import { createDetailQuery } from './createDetailQuery.svelte.js';

/**
 * Dexie read for a single forum post by event id, scoped to the configured
 * community (`#h` tag). Returns `{ post: ... | null }`.
 *
 * @param {{ eventId?: string }} input
 */
async function loadForumPost(input) {
	const eventId = input?.eventId ?? '';
	if (!eventId) return { post: null };
	const event = await queryEvent({
		kinds: [EVENT_KINDS.FORUM_POST],
		ids: [eventId],
		'#h': [ZAPSTORE_COMMUNITY_PUBKEY]
	});
	if (!event) return { post: null };
	const parsed = parseForumPost(event);
	if (!parsed) return { post: null };
	return { post: { ...parsed, _raw: event } };
}

/**
 * Forum post detail query — local-first reactive read of a single forum post.
 *
 * The community feed (`/community/forum`) writes its loaded posts to Dexie,
 * so navigating from the feed to a detail page typically returns from cache
 * immediately. Cold visits hydrate from `FORUM_RELAY`.
 *
 * @param {() => { eventId?: string, seedPost?: any, seedEvents?: import('nostr-tools').Event[] }} getInput
 * @param {{ hydrate?: boolean, timeout?: number }} [options]
 */
export function createForumPostQuery(getInput, options = {}) {
	const shouldHydrate = options.hydrate !== false;

	return createDetailQuery({
		initial: { post: null },
		notFoundMessage: 'Post not found',
		timeout: options.timeout ?? 5000,
		featurePrefix: 'purpleweb-forum-post',
		getInput,
		getSeed: (input) => ({ post: input?.seedPost ?? null }),
		getSeedEvents: (input) => input?.seedEvents ?? [],
		load: loadForumPost,
		isPresent: (value) => value?.post != null,
		hydrate({ input, hydrateOnce }) {
			if (!shouldHydrate) return;
			const eventId = input?.eventId ?? '';
			if (!eventId) return;
			hydrateOnce(
				`forum-post:${eventId}`,
				[FORUM_RELAY],
				{
					kinds: [EVENT_KINDS.FORUM_POST],
					ids: [eventId],
					'#h': [ZAPSTORE_COMMUNITY_PUBKEY],
					limit: 1
				},
				'purpleweb-forum-post'
			);
		}
	});
}
