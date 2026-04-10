/**
 * Legacy → Modern event migration logic.
 * Transforms kind 1063 files to kind 3063 assets.
 */

import { ZAPSTORE_RELAY } from '$lib/config.js';

/**
 * Check if a release uses legacy format (references kind 1063 instead of 3063)
 * @param {import('nostr-tools').NostrEvent} release - Release event (kind 30063)
 * @param {import('nostr-tools').NostrEvent[]} artifacts - Referenced artifact events
 * @returns {boolean}
 */
export function isLegacyRelease(release, artifacts) {
	return artifacts.some((a) => a.kind === 1063);
}

/**
 * Check if a release uses modern format (references kind 3063)
 * @param {import('nostr-tools').NostrEvent} release - Release event (kind 30063)
 * @param {import('nostr-tools').NostrEvent[]} artifacts - Referenced artifact events
 * @returns {boolean}
 */
export function isModernRelease(release, artifacts) {
	if (!artifacts.length) return false;
	return artifacts.every((a) => a.kind === 3063);
}

/**
 * Get tag value from event
 * @param {import('nostr-tools').NostrEvent} event
 * @param {string} name
 * @returns {string | undefined}
 */
function getTag(event, name) {
	return event.tags.find((t) => t[0] === name)?.[1];
}

/**
 * Get all tag values for a given tag name
 * @param {import('nostr-tools').NostrEvent} event
 * @param {string} name
 * @returns {string[]}
 */
function getTags(event, name) {
	return event.tags.filter((t) => t[0] === name).map((t) => t[1]);
}

/**
 * Transform a kind 1063 File Metadata event to kind 3063 Asset event template.
 * Does NOT sign - returns unsigned template.
 *
 * Tag mapping (legacy → modern):
 * - apk_signature_hash → apk_certificate_hash
 * - min_sdk_version → min_platform_version
 * - target_sdk_version → target_platform_version
 * - (new) i tag added with app identifier
 *
 * @param {import('nostr-tools').NostrEvent} file1063 - Legacy file metadata event
 * @param {string} appDTag - App identifier (d tag value)
 * @returns {{ kind: number, tags: string[][], content: string }}
 */
export function transformFile1063ToAsset3063(file1063, appDTag) {
	const knownTags = new Set([
		'x',
		'url',
		'fallback',
		'm',
		'size',
		'f',
		'version',
		'version_code',
		'apk_signature_hash',
		'min_sdk_version',
		'target_sdk_version'
	]);

	const unknownTags = file1063.tags.filter((t) => !knownTags.has(t[0]));

	/** @type {string[][]} */
	const tags = [['i', appDTag], ['x', getTag(file1063, 'x')]];

	const version = getTag(file1063, 'version');
	if (version) tags.push(['version', version]);

	for (const url of getTags(file1063, 'url')) {
		tags.push(['url', url]);
	}
	for (const url of getTags(file1063, 'fallback')) {
		tags.push(['url', url]);
	}

	const mime = getTag(file1063, 'm');
	if (mime) tags.push(['m', mime]);

	const size = getTag(file1063, 'size');
	if (size) tags.push(['size', size]);

	for (const platform of getTags(file1063, 'f')) {
		tags.push(['f', platform]);
	}

	const minSdk = getTag(file1063, 'min_sdk_version');
	if (minSdk) tags.push(['min_platform_version', minSdk]);

	const targetSdk = getTag(file1063, 'target_sdk_version');
	if (targetSdk) tags.push(['target_platform_version', targetSdk]);

	const versionCode = getTag(file1063, 'version_code');
	if (versionCode) tags.push(['version_code', versionCode]);

	const apkSigHash = getTag(file1063, 'apk_signature_hash');
	if (apkSigHash) tags.push(['apk_certificate_hash', apkSigHash]);

	for (const tag of unknownTags) {
		tags.push([...tag]);
	}

	return {
		kind: 3063,
		created_at: file1063.created_at,
		tags: tags.filter((t) => t[1] !== undefined),
		content: ''
	};
}

/**
 * Transform a legacy release to modern format template.
 * Does NOT sign - returns unsigned template.
 *
 * Changes:
 * - Adds 'i' tag with app identifier
 * - Adds 'c' tag with channel (defaults to 'main')
 * - Replaces 'e' tags with new asset IDs
 * - Removes legacy 'a' tag (app reference)
 *
 * @param {import('nostr-tools').NostrEvent} legacyRelease - Legacy release event
 * @param {string} appDTag - App identifier (d tag value)
 * @param {string[]} newAssetIds - IDs of the newly created 3063 assets
 * @returns {{ kind: number, tags: string[][], content: string }}
 */
export function transformLegacyRelease(legacyRelease, appDTag, newAssetIds) {
	const dTag = getTag(legacyRelease, 'd') || '';
	const version = dTag.includes('@') ? dTag.split('@')[1] : getTag(legacyRelease, 'version') || dTag;

	return {
		kind: 30063,
		created_at: legacyRelease.created_at,
		tags: [
			['i', appDTag],
			['version', version],
			['d', `${appDTag}@${version}`],
			['c', 'main'],
			...newAssetIds.map((id) => ['e', id, ZAPSTORE_RELAY])
		],
		content: legacyRelease.content || ''
	};
}

/**
 * Update app event template with new release reference.
 * Does NOT sign - returns unsigned template.
 *
 * @param {import('nostr-tools').NostrEvent} app - Original app event
 * @param {string} version - New release version
 * @returns {{ kind: number, tags: string[][], content: string }}
 */
export function updateAppWithNewRelease(app, version) {
	const appDTag = getTag(app, 'd');

	return {
		kind: 32267,
		created_at: app.created_at,
		tags: app.tags.map((t) => {
			if (t[0] === 'a' && t[1]?.startsWith('30063:')) {
				return ['a', `30063:${app.pubkey}:${appDTag}@${version}`];
			}
			return [...t];
		}),
		content: app.content || ''
	};
}

/**
 * @typedef {Object} MigrationInput
 * @property {import('nostr-tools').NostrEvent} app - App event (kind 32267)
 * @property {import('nostr-tools').NostrEvent} release - Release event (kind 30063)
 * @property {import('nostr-tools').NostrEvent[]} artifacts - Artifact events (kind 1063)
 */

/**
 * @typedef {Object} MigrationResult
 * @property {boolean} success
 * @property {string[]} [assetIds] - IDs of created 3063 assets
 * @property {string} [releaseId] - ID of created 30063 release
 * @property {string} [appId] - ID of updated 32267 app
 * @property {string} [error] - Error message if failed
 */

/**
 * Migrate a single app from legacy to modern format.
 *
 * Steps:
 * 1. Transform each 1063 file to 3063 asset and sign
 * 2. Create new 30063 release pointing to new assets and sign
 * 3. Update 32267 app with new release reference and sign
 * 4. Publish all events
 *
 * @param {MigrationInput} input
 * @param {function} signEvent - NIP-07 signer function
 * @param {function} publishToRelays - Function to publish event to relays
 * @returns {Promise<MigrationResult>}
 */
export async function migrateApp({ app, release, artifacts }, signEvent, publishToRelays) {
	const appDTag = getTag(app, 'd');
	if (!appDTag) {
		return { success: false, error: 'App missing d tag' };
	}

	const legacyFiles = artifacts.filter((a) => a.kind === 1063);
	if (legacyFiles.length === 0) {
		return { success: false, error: 'No legacy 1063 files found' };
	}

	/** @type {import('nostr-tools').NostrEvent[]} */
	const signedEvents = [];

	try {
		const newAssetIds = [];

		for (const file of legacyFiles) {
			const assetTemplate = transformFile1063ToAsset3063(file, appDTag);
			const signed = await signEvent(assetTemplate);
			signedEvents.push(signed);
			newAssetIds.push(signed.id);
		}

		const releaseTemplate = transformLegacyRelease(release, appDTag, newAssetIds);
		const signedRelease = await signEvent(releaseTemplate);
		signedEvents.push(signedRelease);

		const version = releaseTemplate.tags.find((t) => t[0] === 'version')?.[1];
		const appTemplate = updateAppWithNewRelease(app, version);
		const signedApp = await signEvent(appTemplate);
		signedEvents.push(signedApp);

		for (const event of signedEvents) {
			await publishToRelays(event);
		}

		return {
			success: true,
			assetIds: newAssetIds,
			releaseId: signedRelease.id,
			appId: signedApp.id
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
