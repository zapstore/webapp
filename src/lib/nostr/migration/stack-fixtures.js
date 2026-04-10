/**
 * Test fixtures for stack migration.
 * Includes both synthetic test cases and real event structures.
 */

import { ZAPSTORE_COMMUNITY_PUBKEY, PLATFORM_FILTER } from '$lib/config.js';

const PLATFORM = PLATFORM_FILTER['#f'][0]; // android-arm64-v8a

// ═══════════════════════════════════════════════════════════════════
// PUBLIC STACKS NEEDING MIGRATION
// ═══════════════════════════════════════════════════════════════════

/** Public stack missing both h and f tags */
export const STACK_MISSING_BOTH_TAGS = {
	kind: 30267,
	id: 'stack-missing-both-tags',
	pubkey: '726a1e261cc6474674e8285e3951b3bb139be9a773d1acf49dc868db861a1c11',
	created_at: 1775800000,
	tags: [
		['d', 'my-bitcoin-apps'],
		['name', 'Bitcoin Apps'],
		['title', 'Bitcoin Apps'],
		['a', '32267:78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55130f026307d:com.example.app1', 'wss://relay.zapstore.dev'],
		['a', '32267:78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55130f026307d:com.example.app2', 'wss://relay.zapstore.dev']
	],
	content: '', // Empty content = public stack
	sig: 'mock-signature'
};

/** Public stack missing only h tag (has f tag) */
export const STACK_MISSING_H_TAG = {
	kind: 30267,
	id: 'stack-missing-h-tag',
	pubkey: '726a1e261cc6474674e8285e3951b3bb139be9a773d1acf49dc868db861a1c11',
	created_at: 1775800100,
	tags: [
		['d', 'nostr-clients'],
		['name', 'Nostr Clients'],
		['title', 'Nostr Clients'],
		['f', PLATFORM],
		['a', '32267:78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55130f026307d:com.example.client1', 'wss://relay.zapstore.dev']
	],
	content: '',
	sig: 'mock-signature'
};

/** Public stack missing only f tag (has h tag) */
export const STACK_MISSING_F_TAG = {
	kind: 30267,
	id: 'stack-missing-f-tag',
	pubkey: '726a1e261cc6474674e8285e3951b3bb139be9a773d1acf49dc868db861a1c11',
	created_at: 1775800200,
	tags: [
		['d', 'productivity-tools'],
		['name', 'Productivity Tools'],
		['title', 'Productivity Tools'],
		['h', ZAPSTORE_COMMUNITY_PUBKEY],
		['a', '32267:78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55130f026307d:com.example.tool1', 'wss://relay.zapstore.dev']
	],
	content: '',
	sig: 'mock-signature'
};

// ═══════════════════════════════════════════════════════════════════
// STACKS NOT NEEDING MIGRATION
// ═══════════════════════════════════════════════════════════════════

/** Public stack with all required tags - no migration needed */
export const STACK_COMPLETE = {
	kind: 30267,
	id: 'stack-complete',
	pubkey: '726a1e261cc6474674e8285e3951b3bb139be9a773d1acf49dc868db861a1c11',
	created_at: 1775800300,
	tags: [
		['d', 'complete-stack'],
		['name', 'Complete Stack'],
		['title', 'Complete Stack'],
		['h', ZAPSTORE_COMMUNITY_PUBKEY],
		['f', PLATFORM],
		['a', '32267:78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55130f026307d:com.example.app', 'wss://relay.zapstore.dev']
	],
	content: '',
	sig: 'mock-signature'
};

/** Private stack (has encrypted content) - should not migrate */
export const STACK_PRIVATE = {
	kind: 30267,
	id: 'stack-private',
	pubkey: '726a1e261cc6474674e8285e3951b3bb139be9a773d1acf49dc868db861a1c11',
	created_at: 1775800400,
	tags: [
		['d', 'private-stack'],
		['name', 'Private Stack'],
		['f', PLATFORM]
	],
	content: 'encrypted-content-here-base64==?iv=abc123', // Non-empty = private
	sig: 'mock-signature'
};

/** Saved apps bookmark stack - should not migrate */
export const STACK_BOOKMARKS = {
	kind: 30267,
	id: 'stack-bookmarks',
	pubkey: '726a1e261cc6474674e8285e3951b3bb139be9a773d1acf49dc868db861a1c11',
	created_at: 1775800500,
	tags: [
		['d', 'zapstore-bookmarks'],
		['name', 'Saved Apps'],
		['f', PLATFORM]
	],
	content: 'encrypted-bookmarks==?iv=def456',
	sig: 'mock-signature'
};

/** Installed apps backup stack - should not migrate */
export const STACK_INSTALLED_BACKUP = {
	kind: 30267,
	id: 'stack-installed-backup',
	pubkey: '726a1e261cc6474674e8285e3951b3bb139be9a773d1acf49dc868db861a1c11',
	created_at: 1775800600,
	tags: [
		['d', 'zapstore-installed-backup'],
		['name', 'Installed Apps'],
		['f', PLATFORM]
	],
	content: 'encrypted-installed==?iv=ghi789',
	sig: 'mock-signature'
};

// ═══════════════════════════════════════════════════════════════════
// REAL STACK EVENT STRUCTURE (from relay.zapstore.dev)
// ═══════════════════════════════════════════════════════════════════

/** Real public stack structure - example of properly formatted stack */
export const REAL_PUBLIC_STACK_EXAMPLE = {
	kind: 30267,
	id: 'example-real-public-stack',
	pubkey: '726a1e261cc6474674e8285e3951b3bb139be9a773d1acf49dc868db861a1c11',
	created_at: 1775849285,
	tags: [
		['d', 'bitcoin-wallet-apps'],
		['name', 'Bitcoin Wallets'],
		['title', 'Bitcoin Wallets'],
		['description', 'Best Bitcoin wallet apps for Android'],
		['h', ZAPSTORE_COMMUNITY_PUBKEY],
		['f', PLATFORM],
		['a', '32267:78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55130f026307d:com.sparrowwallet.sparrow', 'wss://relay.zapstore.dev'],
		['a', '32267:78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55130f026307d:com.btcontract.wallet', 'wss://relay.zapstore.dev']
	],
	content: '',
	sig: 'real-signature-here'
};
