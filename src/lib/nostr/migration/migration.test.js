import { describe, it, expect, vi } from 'vitest';
import {
	LEGACY_FILE_1063_PEACH,
	LEGACY_FILE_1063_SHOSHO,
	LEGACY_FILE_1063_MEISO,
	MODERN_ASSET_3063_MERCASATS,
	MODERN_ASSET_3063_THUMBKEY,
	MODERN_RELEASE_30063_THUMBKEY,
	LEGACY_RELEASE_30063_PEACH,
	LEGACY_APP_32267_PEACH
} from './fixtures.js';
import {
	isLegacyRelease,
	isModernRelease,
	transformFile1063ToAsset3063,
	transformLegacyRelease,
	updateAppWithNewRelease,
	migrateApp
} from './migration.js';

describe('Legacy Detection', () => {
	it('identifies release pointing to kind 1063 as legacy', () => {
		const artifacts = [LEGACY_FILE_1063_PEACH];
		expect(isLegacyRelease(LEGACY_RELEASE_30063_PEACH, artifacts)).toBe(true);
	});

	it('identifies release pointing to kind 3063 as modern', () => {
		const artifacts = [MODERN_ASSET_3063_THUMBKEY];
		expect(isLegacyRelease(MODERN_RELEASE_30063_THUMBKEY, artifacts)).toBe(false);
	});

	it('identifies mixed artifacts (some 1063, some 3063) as legacy', () => {
		const artifacts = [LEGACY_FILE_1063_PEACH, MODERN_ASSET_3063_MERCASATS];
		expect(isLegacyRelease(LEGACY_RELEASE_30063_PEACH, artifacts)).toBe(true);
	});

	it('isModernRelease returns true when all artifacts are 3063', () => {
		const artifacts = [MODERN_ASSET_3063_MERCASATS, MODERN_ASSET_3063_THUMBKEY];
		expect(isModernRelease(MODERN_RELEASE_30063_THUMBKEY, artifacts)).toBe(true);
	});

	it('isModernRelease returns false for empty artifacts', () => {
		expect(isModernRelease(MODERN_RELEASE_30063_THUMBKEY, [])).toBe(false);
	});
});

describe('File 1063 → Asset 3063 Transformation', () => {
	it('transforms all required fields correctly', () => {
		const appDTag = 'com.peachbitcoin.peach.mainnet';
		const result = transformFile1063ToAsset3063(LEGACY_FILE_1063_PEACH, appDTag);

		expect(result.kind).toBe(3063);
		expect(result.content).toBe('');

		expect(result.tags.find((t) => t[0] === 'i')?.[1]).toBe(appDTag);
		expect(result.tags.find((t) => t[0] === 'x')?.[1]).toBe(
			'd186ac80f3f617040392c41e29436e54eeb691104bf0416d7fa8a16cae3a996d'
		);
	});

	it('renames apk_signature_hash to apk_certificate_hash', () => {
		const result = transformFile1063ToAsset3063(LEGACY_FILE_1063_PEACH, 'test.app');

		expect(result.tags.find((t) => t[0] === 'apk_signature_hash')).toBeUndefined();
		expect(result.tags.find((t) => t[0] === 'apk_certificate_hash')?.[1]).toBe(
			'c68262135866db32897c0853d832a1a59cae6b5bf3bc415d3829077de89e6c31'
		);
	});

	it('renames min_sdk_version to min_platform_version', () => {
		const result = transformFile1063ToAsset3063(LEGACY_FILE_1063_PEACH, 'test.app');

		expect(result.tags.find((t) => t[0] === 'min_sdk_version')).toBeUndefined();
		expect(result.tags.find((t) => t[0] === 'min_platform_version')?.[1]).toBe('24');
	});

	it('renames target_sdk_version to target_platform_version', () => {
		const result = transformFile1063ToAsset3063(LEGACY_FILE_1063_PEACH, 'test.app');

		expect(result.tags.find((t) => t[0] === 'target_sdk_version')).toBeUndefined();
		expect(result.tags.find((t) => t[0] === 'target_platform_version')?.[1]).toBe('36');
	});

	it('preserves all URL tags', () => {
		const result = transformFile1063ToAsset3063(LEGACY_FILE_1063_PEACH, 'test.app');
		const urls = result.tags.filter((t) => t[0] === 'url').map((t) => t[1]);

		expect(urls).toContain(
			'https://github.com/Peach2Peach/peach-app/releases/download/v0.69.0%28340%29/app-prod-arm64-v8a-release.apk'
		);
		expect(urls).toContain(
			'https://cdn.zapstore.dev/d186ac80f3f617040392c41e29436e54eeb691104bf0416d7fa8a16cae3a996d'
		);
	});

	it('preserves all platform (f) tags', () => {
		const result = transformFile1063ToAsset3063(LEGACY_FILE_1063_SHOSHO, 'test.app');
		const platforms = result.tags.filter((t) => t[0] === 'f').map((t) => t[1]);

		expect(platforms).toContain('android-arm64-v8a');
		expect(platforms).toContain('android-armeabi-v7a');
	});

	it('handles file with multiple platforms (Meiso)', () => {
		const result = transformFile1063ToAsset3063(LEGACY_FILE_1063_MEISO, 'jp.godzhigella.meiso');
		const platforms = result.tags.filter((t) => t[0] === 'f').map((t) => t[1]);

		expect(platforms).toHaveLength(3);
		expect(platforms).toContain('android-arm64-v8a');
		expect(platforms).toContain('android-armeabi-v7a');
		expect(platforms).toContain('android-x86_64');
	});

	it('preserves version and version_code', () => {
		const result = transformFile1063ToAsset3063(LEGACY_FILE_1063_PEACH, 'test.app');

		expect(result.tags.find((t) => t[0] === 'version')?.[1]).toBe('0.69.0');
		expect(result.tags.find((t) => t[0] === 'version_code')?.[1]).toBe('340');
	});

	it('preserves mime type and size', () => {
		const result = transformFile1063ToAsset3063(LEGACY_FILE_1063_PEACH, 'test.app');

		expect(result.tags.find((t) => t[0] === 'm')?.[1]).toBe(
			'application/vnd.android.package-archive'
		);
		expect(result.tags.find((t) => t[0] === 'size')?.[1]).toBe('54970334');
	});

	it('handles missing optional fields gracefully', () => {
		const minimalFile = {
			kind: 1063,
			id: 'test-id',
			pubkey: 'test-pubkey',
			created_at: 1000,
			tags: [
				['x', 'abc123def456'],
				['version', '1.0.0'],
				['f', 'android-arm64-v8a'],
				['m', 'application/vnd.android.package-archive'],
				['url', 'https://example.com/app.apk']
			],
			content: '',
			sig: 'mock'
		};

		const result = transformFile1063ToAsset3063(minimalFile, 'test.app');

		expect(result.kind).toBe(3063);
		expect(result.tags.find((t) => t[0] === 'min_platform_version')).toBeUndefined();
		expect(result.tags.find((t) => t[0] === 'apk_certificate_hash')).toBeUndefined();
		expect(result.tags.find((t) => t[0] === 'version_code')).toBeUndefined();
	});
});

describe('Release Transformation', () => {
	it('adds i tag with app identifier', () => {
		const newAssetIds = ['new-asset-id-123'];
		const appDTag = 'com.peachbitcoin.peach.mainnet';

		const result = transformLegacyRelease(LEGACY_RELEASE_30063_PEACH, appDTag, newAssetIds);

		expect(result.tags.find((t) => t[0] === 'i')?.[1]).toBe(appDTag);
	});

	it('adds channel (c) tag defaulting to main', () => {
		const result = transformLegacyRelease(LEGACY_RELEASE_30063_PEACH, 'test.app', ['asset-id']);

		expect(result.tags.find((t) => t[0] === 'c')?.[1]).toBe('main');
	});

	it('replaces old e tags with new asset IDs', () => {
		const newAssetIds = ['new-asset-1', 'new-asset-2'];
		const result = transformLegacyRelease(LEGACY_RELEASE_30063_PEACH, 'test.app', newAssetIds);

		const eTags = result.tags.filter((t) => t[0] === 'e');
		expect(eTags.length).toBe(2);
		expect(eTags[0][1]).toBe('new-asset-1');
		expect(eTags[1][1]).toBe('new-asset-2');

		expect(eTags.find((t) => t[1] === LEGACY_FILE_1063_PEACH.id)).toBeUndefined();
	});

	it('includes relay hint in e tags', () => {
		const result = transformLegacyRelease(LEGACY_RELEASE_30063_PEACH, 'test.app', ['asset-id']);

		const eTag = result.tags.find((t) => t[0] === 'e');
		expect(eTag?.[2]).toBe('wss://relay.zapstore.dev');
	});

	it('preserves release notes in content', () => {
		const result = transformLegacyRelease(LEGACY_RELEASE_30063_PEACH, 'test.app', ['asset-id']);

		expect(result.content).toBe('Bug fixes and performance improvements');
	});

	it('removes legacy a tag (app reference)', () => {
		const result = transformLegacyRelease(LEGACY_RELEASE_30063_PEACH, 'test.app', ['asset-id']);

		expect(result.tags.find((t) => t[0] === 'a')).toBeUndefined();
	});

	it('extracts version from d tag correctly', () => {
		const result = transformLegacyRelease(LEGACY_RELEASE_30063_PEACH, 'test.app', ['asset-id']);

		expect(result.tags.find((t) => t[0] === 'version')?.[1]).toBe('0.69.0');
	});

	it('constructs correct d tag format', () => {
		const result = transformLegacyRelease(
			LEGACY_RELEASE_30063_PEACH,
			'com.peachbitcoin.peach.mainnet',
			['asset-id']
		);

		expect(result.tags.find((t) => t[0] === 'd')?.[1]).toBe(
			'com.peachbitcoin.peach.mainnet@0.69.0'
		);
	});
});

describe('App Update', () => {
	it('updates a tag with new release reference', () => {
		const result = updateAppWithNewRelease(LEGACY_APP_32267_PEACH, '0.70.0');

		const aTag = result.tags.find((t) => t[0] === 'a');
		expect(aTag?.[1]).toBe(
			`30063:${LEGACY_APP_32267_PEACH.pubkey}:com.peachbitcoin.peach.mainnet@0.70.0`
		);
	});

	it('preserves all other tags', () => {
		const result = updateAppWithNewRelease(LEGACY_APP_32267_PEACH, '0.70.0');

		expect(result.tags.find((t) => t[0] === 'd')?.[1]).toBe('com.peachbitcoin.peach.mainnet');
		expect(result.tags.find((t) => t[0] === 'name')?.[1]).toBe('Peach Bitcoin');
		expect(result.tags.find((t) => t[0] === 'f')?.[1]).toBe('android-arm64-v8a');
		expect(result.tags.find((t) => t[0] === 'icon')).toBeDefined();
		expect(result.tags.find((t) => t[0] === 'repository')).toBeDefined();
	});

	it('preserves content', () => {
		const result = updateAppWithNewRelease(LEGACY_APP_32267_PEACH, '0.70.0');

		expect(result.content).toBe('P2P Bitcoin trading without KYC');
	});
});

describe('Full Migration Flow', () => {
	it('produces valid events that can be signed and published', async () => {
		const mockSignEvent = vi.fn(async (template) => ({
			...template,
			id: 'signed-' + Math.random().toString(36).slice(2),
			pubkey: LEGACY_APP_32267_PEACH.pubkey,
			sig: 'mock-signature',
			created_at: Math.floor(Date.now() / 1000)
		}));

		const mockPublish = vi.fn(async () => true);

		const result = await migrateApp(
			{
				app: LEGACY_APP_32267_PEACH,
				release: LEGACY_RELEASE_30063_PEACH,
				artifacts: [LEGACY_FILE_1063_PEACH]
			},
			mockSignEvent,
			mockPublish
		);

		expect(result.success).toBe(true);
		expect(mockSignEvent).toHaveBeenCalledTimes(3);
		expect(mockPublish).toHaveBeenCalledTimes(3);
	});

	it('handles multiple artifacts per release', async () => {
		const secondFile = {
			...LEGACY_FILE_1063_SHOSHO,
			id: 'second-file-id'
		};

		const mockSignEvent = vi.fn(async (t) => ({
			...t,
			id: 'id-' + t.kind + '-' + Math.random().toString(36).slice(2),
			pubkey: LEGACY_APP_32267_PEACH.pubkey,
			sig: 'sig',
			created_at: Math.floor(Date.now() / 1000)
		}));
		const mockPublish = vi.fn(async () => true);

		const result = await migrateApp(
			{
				app: LEGACY_APP_32267_PEACH,
				release: LEGACY_RELEASE_30063_PEACH,
				artifacts: [LEGACY_FILE_1063_PEACH, secondFile]
			},
			mockSignEvent,
			mockPublish
		);

		expect(result.success).toBe(true);
		expect(result.assetIds).toHaveLength(2);
		expect(mockSignEvent).toHaveBeenCalledTimes(4);
	});

	it('returns error on signing failure', async () => {
		const mockSignEvent = vi
			.fn()
			.mockResolvedValueOnce({
				kind: 3063,
				id: 'asset-1',
				sig: 'sig',
				pubkey: 'pk',
				created_at: 1000,
				tags: [],
				content: ''
			})
			.mockRejectedValueOnce(new Error('User rejected signing'));

		const mockPublish = vi.fn();

		const result = await migrateApp(
			{
				app: LEGACY_APP_32267_PEACH,
				release: LEGACY_RELEASE_30063_PEACH,
				artifacts: [LEGACY_FILE_1063_PEACH]
			},
			mockSignEvent,
			mockPublish
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain('User rejected signing');
		expect(mockPublish).not.toHaveBeenCalled();
	});

	it('returns error if app missing d tag', async () => {
		const badApp = { ...LEGACY_APP_32267_PEACH, tags: [] };

		const result = await migrateApp(
			{
				app: badApp,
				release: LEGACY_RELEASE_30063_PEACH,
				artifacts: [LEGACY_FILE_1063_PEACH]
			},
			vi.fn(),
			vi.fn()
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain('App missing d tag');
	});

	it('returns error if no legacy files found', async () => {
		const result = await migrateApp(
			{
				app: LEGACY_APP_32267_PEACH,
				release: LEGACY_RELEASE_30063_PEACH,
				artifacts: [MODERN_ASSET_3063_MERCASATS]
			},
			vi.fn(),
			vi.fn()
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain('No legacy 1063 files found');
	});

	it('returns asset IDs, release ID, and app ID on success', async () => {
		const mockSignEvent = vi.fn(async (template) => ({
			...template,
			id: `signed-${template.kind}`,
			pubkey: LEGACY_APP_32267_PEACH.pubkey,
			sig: 'mock-signature',
			created_at: Math.floor(Date.now() / 1000)
		}));
		const mockPublish = vi.fn(async () => true);

		const result = await migrateApp(
			{
				app: LEGACY_APP_32267_PEACH,
				release: LEGACY_RELEASE_30063_PEACH,
				artifacts: [LEGACY_FILE_1063_PEACH]
			},
			mockSignEvent,
			mockPublish
		);

		expect(result.success).toBe(true);
		expect(result.assetIds).toEqual(['signed-3063']);
		expect(result.releaseId).toBe('signed-30063');
		expect(result.appId).toBe('signed-32267');
	});
});

describe('Edge Cases', () => {
	it('handles file without version_code (non-Android)', () => {
		const nonAndroidFile = {
			kind: 1063,
			id: 'non-android-file',
			pubkey: 'test-pubkey',
			created_at: 1000,
			tags: [
				['x', 'abc123def456789012345678901234567890123456789012345678901234'],
				['version', '1.0.0'],
				['f', 'linux-x86_64'],
				['m', 'application/x-executable'],
				['url', 'https://example.com/app']
			],
			content: '',
			sig: 'mock'
		};

		const result = transformFile1063ToAsset3063(nonAndroidFile, 'test.app');

		expect(result.kind).toBe(3063);
		expect(result.tags.find((t) => t[0] === 'version_code')).toBeUndefined();
		expect(result.tags.find((t) => t[0] === 'apk_certificate_hash')).toBeUndefined();
	});

	it('handles empty release notes', () => {
		const releaseNoNotes = { ...LEGACY_RELEASE_30063_PEACH, content: '' };
		const result = transformLegacyRelease(releaseNoNotes, 'test.app', ['asset-id']);

		expect(result.content).toBe('');
	});

	it('verifies real modern release matches expected format', () => {
		expect(MODERN_RELEASE_30063_THUMBKEY.tags.find((t) => t[0] === 'i')?.[1]).toBe(
			'com.dessalines.thumbkey'
		);
		expect(MODERN_RELEASE_30063_THUMBKEY.tags.find((t) => t[0] === 'version')?.[1]).toBe('5.1.7');
		expect(MODERN_RELEASE_30063_THUMBKEY.tags.find((t) => t[0] === 'c')?.[1]).toBe('main');
		expect(MODERN_RELEASE_30063_THUMBKEY.tags.find((t) => t[0] === 'e')?.[1]).toBe(
			MODERN_ASSET_3063_THUMBKEY.id
		);
	});

	it('verifies real modern asset matches expected format', () => {
		expect(MODERN_ASSET_3063_MERCASATS.tags.find((t) => t[0] === 'i')?.[1]).toBe(
			'com.kilombino.mercasats'
		);
		expect(MODERN_ASSET_3063_MERCASATS.tags.find((t) => t[0] === 'apk_certificate_hash')).toBeDefined();
		expect(MODERN_ASSET_3063_MERCASATS.tags.find((t) => t[0] === 'min_platform_version')).toBeDefined();
		expect(MODERN_ASSET_3063_MERCASATS.tags.find((t) => t[0] === 'target_platform_version')).toBeDefined();
	});

	it('transformed legacy file matches modern asset structure', () => {
		const transformed = transformFile1063ToAsset3063(
			LEGACY_FILE_1063_PEACH,
			'com.peachbitcoin.peach.mainnet'
		);

		expect(transformed.tags.find((t) => t[0] === 'i')).toBeDefined();
		expect(transformed.tags.find((t) => t[0] === 'apk_certificate_hash')).toBeDefined();
		expect(transformed.tags.find((t) => t[0] === 'min_platform_version')).toBeDefined();
		expect(transformed.tags.find((t) => t[0] === 'target_platform_version')).toBeDefined();

		expect(transformed.tags.find((t) => t[0] === 'apk_signature_hash')).toBeUndefined();
		expect(transformed.tags.find((t) => t[0] === 'min_sdk_version')).toBeUndefined();
		expect(transformed.tags.find((t) => t[0] === 'target_sdk_version')).toBeUndefined();
	});
});
