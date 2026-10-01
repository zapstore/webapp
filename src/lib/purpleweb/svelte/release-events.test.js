import { describe, expect, it } from 'vitest';
import { parseRelease } from '$lib/nostr/models.js';
import { collapseReleaseEvents } from './release-events.js';

// Real events from wss://relay.zapstore.dev for org.btcmap@1.2.0: the app
// author's original and the catalog indexer's mirrored copy of the same
// release address, with different ids and pubkeys.
const AUTHOR_PUBKEY = '3eab247c63bb35dfa38e07ca102f6da28ba9b9d4687197743bde3a2b1d80aeed';
const MIRROR_PUBKEY = '78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55130f026307d';

const AUTHOR_RELEASE = {
	kind: 30063,
	id: 'f929b7ff5497d8338ae5653c9831337797dc142f85814272bc85ba450352d2c5',
	pubkey: AUTHOR_PUBKEY,
	created_at: 1790771101,
	tags: [
		['i', 'org.btcmap'],
		['version', '1.2.0'],
		['d', 'org.btcmap@1.2.0'],
		['c', 'main'],
		['f', 'android-arm64-v8a'],
		[
			'e',
			'2b44fb3701f98098042d2c748b280b18127bc27517c08c30025c6ac4ea4fb555',
			'wss://relay.zapstore.dev'
		]
	],
	content: 'See the changelog for details.'
};

const MIRROR_RELEASE = {
	kind: 30063,
	id: 'f2f6277ed32b1e20c6344b1c6c62a0fb24dc28622f9fd4de0db7ae215e85d896',
	pubkey: MIRROR_PUBKEY,
	created_at: 1790771101,
	tags: [
		['i', 'org.btcmap'],
		['version', '1.2.0'],
		['d', 'org.btcmap@1.2.0'],
		['c', 'main'],
		['f', 'android-arm64-v8a'],
		['f', 'android-armeabi-v7a'],
		['f', 'android-x86'],
		['f', 'android-x86_64'],
		[
			'e',
			'3aa0a441b86bf2326e1224365ef4434edff4282c2494992d6cb2dfa21fdbca8d',
			'wss://relay.zapstore.dev'
		]
	],
	content: 'See the changelog for details.'
};

const OLDER_AUTHOR_RELEASE = {
	kind: 30063,
	id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
	pubkey: AUTHOR_PUBKEY,
	created_at: 1790000000,
	tags: [
		['i', 'org.btcmap'],
		['version', '1.1.0'],
		['d', 'org.btcmap@1.1.0'],
		['c', 'main'],
		['f', 'android-arm64-v8a'],
		[
			'e',
			'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
			'wss://relay.zapstore.dev'
		]
	],
	content: ''
};

describe('collapseReleaseEvents', () => {
	it('keeps the author event when a mirrored copy of the same release address exists', () => {
		const collapsed = collapseReleaseEvents([AUTHOR_RELEASE, MIRROR_RELEASE], AUTHOR_PUBKEY);

		expect(collapsed).toHaveLength(1);
		expect(collapsed[0].id).toBe(AUTHOR_RELEASE.id);
		expect(collapsed[0].pubkey).toBe(AUTHOR_PUBKEY);

		// The parsed row (and its `e` asset ids, used for the direct download
		// URL and mainEventIds) must come from the author's copy too.
		const [release] = collapsed.map(parseRelease);
		expect(release.id).toBe(AUTHOR_RELEASE.id);
		expect(release.artifacts).toEqual([
			'2b44fb3701f98098042d2c748b280b18127bc27517c08c30025c6ac4ea4fb555'
		]);
	});

	it('keeps the author event regardless of input order', () => {
		const collapsed = collapseReleaseEvents([MIRROR_RELEASE, AUTHOR_RELEASE], AUTHOR_PUBKEY);

		expect(collapsed).toHaveLength(1);
		expect(collapsed[0].id).toBe(AUTHOR_RELEASE.id);
	});

	it('keeps the mirrored copy when it is the only event for the release address', () => {
		const collapsed = collapseReleaseEvents([MIRROR_RELEASE], AUTHOR_PUBKEY);

		expect(collapsed).toHaveLength(1);
		expect(collapsed[0].id).toBe(MIRROR_RELEASE.id);
		expect(collapsed[0].pubkey).toBe(MIRROR_PUBKEY);
	});

	it('keeps one event per version and orders by created_at desc', () => {
		const collapsed = collapseReleaseEvents(
			[MIRROR_RELEASE, OLDER_AUTHOR_RELEASE, AUTHOR_RELEASE],
			AUTHOR_PUBKEY
		);

		expect(collapsed.map((event) => event.id)).toEqual([
			AUTHOR_RELEASE.id,
			OLDER_AUTHOR_RELEASE.id
		]);
	});

	it('falls back to the event id when a release has no d tag', () => {
		const noDTagA = {
			...AUTHOR_RELEASE,
			id: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
			tags: [['version', '2.0.0']]
		};
		const noDTagB = {
			...MIRROR_RELEASE,
			id: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
			tags: [['version', '2.0.1']]
		};

		const collapsed = collapseReleaseEvents([noDTagA, noDTagB], AUTHOR_PUBKEY);

		expect(collapsed).toHaveLength(2);
	});
});
