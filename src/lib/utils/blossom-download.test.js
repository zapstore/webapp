import { describe, expect, it } from 'vitest';
import { apkFilenameFromName, blossomDownloadProxyUrl } from './blossom-download.js';

describe('blossomDownloadProxyUrl', () => {
	it('builds a same-origin proxy URL with human filename', () => {
		const url = blossomDownloadProxyUrl(
			'https://cdn.zapstore.dev/96846060af9f9fcc09ceb1ac07e58a1a77d715c5d0f89b3f14e2632fba2505e2.apk',
			'zapstore-1.1.1.apk'
		);
		expect(url).toBe(
			'/api/download?url=https%3A%2F%2Fcdn.zapstore.dev%2F96846060af9f9fcc09ceb1ac07e58a1a77d715c5d0f89b3f14e2632fba2505e2.apk&filename=zapstore-1.1.1.apk'
		);
	});

	it('never uses a content-hash filename', () => {
		const hash = '96846060af9f9fcc09ceb1ac07e58a1a77d715c5d0f89b3f14e2632fba2505e2';
		const url = blossomDownloadProxyUrl(`https://cdn.zapstore.dev/${hash}.apk`, hash);
		expect(url).toContain('filename=app.apk');
		expect(url).not.toContain(`filename=${hash}`);
	});
});

describe('apkFilenameFromName', () => {
	it('keeps human names and rejects hashes', () => {
		expect(apkFilenameFromName('Zapstore')).toBe('Zapstore.apk');
		expect(apkFilenameFromName('zapstore-1.1.1.apk')).toBe('zapstore-1.1.1.apk');
		expect(
			apkFilenameFromName('96846060af9f9fcc09ceb1ac07e58a1a77d715c5d0f89b3f14e2632fba2505e2')
		).toBe('app.apk');
	});
});
