import { describe, it, expect, vi } from 'vitest';
import {
	STACK_MISSING_BOTH_TAGS,
	STACK_MISSING_H_TAG,
	STACK_MISSING_F_TAG,
	STACK_COMPLETE,
	STACK_PRIVATE,
	STACK_BOOKMARKS,
	STACK_INSTALLED_BACKUP,
	REAL_PUBLIC_STACK_EXAMPLE
} from './stack-fixtures.js';
import {
	stackNeedsMigration,
	getStackMissingTags,
	transformStackForMigration,
	migrateStack
} from './stack-migration.js';
import { ZAPSTORE_COMMUNITY_PUBKEY, PLATFORM_FILTER } from '$lib/config.js';

const PLATFORM = PLATFORM_FILTER['#f'][0];

describe('Stack Migration Detection', () => {
	it('detects stack missing both h and f tags', () => {
		expect(stackNeedsMigration(STACK_MISSING_BOTH_TAGS)).toBe(true);
	});

	it('detects stack missing only h tag', () => {
		expect(stackNeedsMigration(STACK_MISSING_H_TAG)).toBe(true);
	});

	it('detects stack missing only f tag', () => {
		expect(stackNeedsMigration(STACK_MISSING_F_TAG)).toBe(true);
	});

	it('skips complete stack with all tags', () => {
		expect(stackNeedsMigration(STACK_COMPLETE)).toBe(false);
	});

	it('skips private stack (has encrypted content)', () => {
		expect(stackNeedsMigration(STACK_PRIVATE)).toBe(false);
	});

	it('skips saved apps bookmark stack', () => {
		expect(stackNeedsMigration(STACK_BOOKMARKS)).toBe(false);
	});

	it('skips installed apps backup stack', () => {
		expect(stackNeedsMigration(STACK_INSTALLED_BACKUP)).toBe(false);
	});

	it('skips real public stack with all tags', () => {
		expect(stackNeedsMigration(REAL_PUBLIC_STACK_EXAMPLE)).toBe(false);
	});
});

describe('Get Missing Tags', () => {
	it('identifies both tags missing', () => {
		const result = getStackMissingTags(STACK_MISSING_BOTH_TAGS);
		expect(result.missingH).toBe(true);
		expect(result.missingF).toBe(true);
	});

	it('identifies only h tag missing', () => {
		const result = getStackMissingTags(STACK_MISSING_H_TAG);
		expect(result.missingH).toBe(true);
		expect(result.missingF).toBe(false);
	});

	it('identifies only f tag missing', () => {
		const result = getStackMissingTags(STACK_MISSING_F_TAG);
		expect(result.missingH).toBe(false);
		expect(result.missingF).toBe(true);
	});

	it('identifies complete stack has no missing tags', () => {
		const result = getStackMissingTags(STACK_COMPLETE);
		expect(result.missingH).toBe(false);
		expect(result.missingF).toBe(false);
	});
});

describe('Stack Transformation', () => {
	it('adds both missing tags', () => {
		const result = transformStackForMigration(STACK_MISSING_BOTH_TAGS);

		expect(result.kind).toBe(30267);
		expect(result.tags.some((t) => t[0] === 'h' && t[1] === ZAPSTORE_COMMUNITY_PUBKEY)).toBe(true);
		expect(result.tags.some((t) => t[0] === 'f' && t[1] === PLATFORM)).toBe(true);
	});

	it('adds only missing h tag when f exists', () => {
		const result = transformStackForMigration(STACK_MISSING_H_TAG);

		const hTags = result.tags.filter((t) => t[0] === 'h');
		const fTags = result.tags.filter((t) => t[0] === 'f');

		expect(hTags.length).toBe(1);
		expect(hTags[0][1]).toBe(ZAPSTORE_COMMUNITY_PUBKEY);
		expect(fTags.length).toBe(1); // Should not add duplicate f tag
	});

	it('adds only missing f tag when h exists', () => {
		const result = transformStackForMigration(STACK_MISSING_F_TAG);

		const hTags = result.tags.filter((t) => t[0] === 'h');
		const fTags = result.tags.filter((t) => t[0] === 'f');

		expect(hTags.length).toBe(1); // Should not add duplicate h tag
		expect(fTags.length).toBe(1);
		expect(fTags[0][1]).toBe(PLATFORM);
	});

	it('increments created_at by 1 second', () => {
		const result = transformStackForMigration(STACK_MISSING_BOTH_TAGS);

		expect(result.created_at).toBe(STACK_MISSING_BOTH_TAGS.created_at + 1);
	});

	it('preserves all existing tags', () => {
		const result = transformStackForMigration(STACK_MISSING_BOTH_TAGS);

		// Original tags should still be present
		expect(result.tags.some((t) => t[0] === 'd' && t[1] === 'my-bitcoin-apps')).toBe(true);
		expect(result.tags.some((t) => t[0] === 'name' && t[1] === 'Bitcoin Apps')).toBe(true);
		expect(result.tags.filter((t) => t[0] === 'a').length).toBe(2);
	});

	it('preserves app references (a tags)', () => {
		const result = transformStackForMigration(STACK_MISSING_BOTH_TAGS);
		const aTags = result.tags.filter((t) => t[0] === 'a');

		expect(aTags.length).toBe(2);
		expect(aTags[0][1]).toContain('32267:');
		expect(aTags[0][2]).toBe('wss://relay.zapstore.dev');
	});

	it('preserves empty content for public stacks', () => {
		const result = transformStackForMigration(STACK_MISSING_BOTH_TAGS);

		expect(result.content).toBe('');
	});
});

describe('Full Stack Migration Flow', () => {
	it('successfully migrates stack with missing tags', async () => {
		const mockSignEvent = vi.fn(async (template) => ({
			...template,
			id: 'signed-stack-id',
			pubkey: STACK_MISSING_BOTH_TAGS.pubkey,
			sig: 'mock-signature'
		}));
		const mockPublish = vi.fn(async () => true);

		const result = await migrateStack(STACK_MISSING_BOTH_TAGS, mockSignEvent, mockPublish);

		expect(result.success).toBe(true);
		expect(result.stackId).toBe('signed-stack-id');
		expect(mockSignEvent).toHaveBeenCalledTimes(1);
		expect(mockPublish).toHaveBeenCalledTimes(1);
	});

	it('rejects migration for stack that does not need it', async () => {
		const mockSignEvent = vi.fn();
		const mockPublish = vi.fn();

		const result = await migrateStack(STACK_COMPLETE, mockSignEvent, mockPublish);

		expect(result.success).toBe(false);
		expect(result.error).toContain('does not need migration');
		expect(mockSignEvent).not.toHaveBeenCalled();
		expect(mockPublish).not.toHaveBeenCalled();
	});

	it('handles signing failure', async () => {
		const mockSignEvent = vi.fn().mockRejectedValue(new Error('User rejected'));
		const mockPublish = vi.fn();

		const result = await migrateStack(STACK_MISSING_BOTH_TAGS, mockSignEvent, mockPublish);

		expect(result.success).toBe(false);
		expect(result.error).toContain('User rejected');
		expect(mockPublish).not.toHaveBeenCalled();
	});

	it('passes correct template to signer', async () => {
		const mockSignEvent = vi.fn(async (template) => ({
			...template,
			id: 'test-id',
			pubkey: 'test-pubkey',
			sig: 'test-sig'
		}));
		const mockPublish = vi.fn();

		await migrateStack(STACK_MISSING_BOTH_TAGS, mockSignEvent, mockPublish);

		const signedTemplate = mockSignEvent.mock.calls[0][0];
		expect(signedTemplate.kind).toBe(30267);
		expect(signedTemplate.created_at).toBe(STACK_MISSING_BOTH_TAGS.created_at + 1);
		expect(signedTemplate.tags.some((t) => t[0] === 'h')).toBe(true);
		expect(signedTemplate.tags.some((t) => t[0] === 'f')).toBe(true);
	});
});

describe('Edge Cases', () => {
	it('handles stack with multiple f tags (wrong platform)', () => {
		const stackWithWrongPlatform = {
			...STACK_MISSING_H_TAG,
			tags: [
				...STACK_MISSING_H_TAG.tags.filter((t) => t[0] !== 'f'),
				['f', 'ios-arm64'] // Wrong platform
			]
		};

		expect(stackNeedsMigration(stackWithWrongPlatform)).toBe(true);

		const { missingF } = getStackMissingTags(stackWithWrongPlatform);
		expect(missingF).toBe(true);
	});

	it('handles stack with wrong h tag value', () => {
		const stackWithWrongH = {
			...STACK_MISSING_F_TAG,
			tags: [
				...STACK_MISSING_F_TAG.tags.filter((t) => t[0] !== 'h'),
				['h', 'wrong-pubkey-value']
			]
		};

		expect(stackNeedsMigration(stackWithWrongH)).toBe(true);

		const { missingH } = getStackMissingTags(stackWithWrongH);
		expect(missingH).toBe(true);
	});

	it('does not add duplicate h tag if correct one exists', () => {
		const result = transformStackForMigration(STACK_MISSING_F_TAG);
		const hTags = result.tags.filter((t) => t[0] === 'h' && t[1] === ZAPSTORE_COMMUNITY_PUBKEY);

		expect(hTags.length).toBe(1);
	});

	it('handles whitespace-only content as empty (public)', () => {
		const stackWithWhitespace = {
			...STACK_MISSING_BOTH_TAGS,
			content: '   \n\t  '
		};

		// Whitespace-only should be treated as empty (public stack)
		expect(stackNeedsMigration(stackWithWhitespace)).toBe(true);
	});
});
