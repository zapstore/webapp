import { describe, expect, it, vi, afterEach } from 'vitest';
import {
	apkFilenameFromName,
	blossomDownloadProxyUrl,
	fetchZapstoreLatestApk,
	parseZapstoreLatestHeaders
} from './blossom-download.js';

describe('blossomDownloadProxyUrl', () => {
	it('builds a same-origin proxy URL with human filename', () => {
		const url = blossomDownloadProxyUrl(
			'https://cdn.zapstore.dev/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.apk',
			'Example App.apk'
		);
		expect(url).toBe(
			'/api/download?url=https%3A%2F%2Fcdn.zapstore.dev%2Faaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.apk&filename=Example%20App.apk'
		);
	});

	it('never uses a content-hash filename', () => {
		const hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
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
			apkFilenameFromName('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
		).toBe('app.apk');
	});
});

describe('parseZapstoreLatestHeaders', () => {
	it('reads version, hash, and size from download-latest headers', () => {
		const headers = new Headers({
			'x-zapstore-version': '1.1.1',
			'x-zapstore-sha256': '96846060AF9F9FCC09CEB1AC07E58A1A77D715C5D0F89B3F14E2632FBA2505E2',
			'content-length': '16811285'
		});
		expect(parseZapstoreLatestHeaders(headers)).toEqual({
			version: '1.1.1',
			sha256: '96846060af9f9fcc09ceb1ac07e58a1a77d715c5d0f89b3f14e2632fba2505e2',
			bytes: 16811285
		});
	});

	it('rejects incomplete metadata', () => {
		expect(() => parseZapstoreLatestHeaders(new Headers())).toThrow(/Incomplete/);
	});
});

describe('fetchZapstoreLatestApk', () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('HEADs same-origin download-latest and returns parsed metadata', async () => {
		const fetchMock = vi.fn(async () =>
			new Response(null, {
				status: 200,
				headers: {
					'x-zapstore-version': '1.1.1',
					'x-zapstore-sha256': '96846060af9f9fcc09ceb1ac07e58a1a77d715c5d0f89b3f14e2632fba2505e2',
					'content-length': '16811285'
				}
			})
		);
		globalThis.fetch = fetchMock;

		await expect(fetchZapstoreLatestApk()).resolves.toEqual({
			version: '1.1.1',
			sha256: '96846060af9f9fcc09ceb1ac07e58a1a77d715c5d0f89b3f14e2632fba2505e2',
			bytes: 16811285
		});
		expect(fetchMock).toHaveBeenCalledWith('/download-latest', {
			method: 'HEAD',
			signal: undefined
		});
	});
});
