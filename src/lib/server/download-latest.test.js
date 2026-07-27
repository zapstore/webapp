import { describe, expect, it } from 'vitest';
import {
	allowedCORSOrigin,
	blossomBlobUrl,
	latestApkHeaders
} from './download-latest.js';

describe('allowedCORSOrigin', () => {
	it('allows zapstore.dev, subdomains, and localhost', () => {
		expect(allowedCORSOrigin('https://zapstore.dev')).toBe(true);
		expect(allowedCORSOrigin('https://www.zapstore.dev')).toBe(true);
		expect(allowedCORSOrigin('https://app.zapstore.dev')).toBe(true);
		expect(allowedCORSOrigin('http://localhost')).toBe(true);
		expect(allowedCORSOrigin('http://localhost:5173')).toBe(true);
		expect(allowedCORSOrigin('http://127.0.0.1:3000')).toBe(true);
		expect(allowedCORSOrigin('https://localhost:5173')).toBe(true);
	});

	it('rejects other origins', () => {
		expect(allowedCORSOrigin('http://zapstore.dev')).toBe(false);
		expect(allowedCORSOrigin('https://evil.com')).toBe(false);
		expect(allowedCORSOrigin('https://zapstore.dev.evil.com')).toBe(false);
		expect(allowedCORSOrigin('https://notzapstore.dev')).toBe(false);
		expect(allowedCORSOrigin('')).toBe(false);
	});
});

describe('latestApkHeaders', () => {
	it('sets disposition, version, hash, and expose headers', () => {
		const hash = '96846060af9f9fcc09ceb1ac07e58a1a77d715c5d0f89b3f14e2632fba2505e2';
		const headers = latestApkHeaders('1.2.3', hash);
		expect(headers.get('Content-Disposition')).toBe(
			'attachment; filename="zapstore-1.2.3.apk"'
		);
		expect(headers.get('X-Zapstore-Version')).toBe('1.2.3');
		expect(headers.get('X-Zapstore-Sha256')).toBe(hash);
		expect(headers.get('Access-Control-Expose-Headers')).toBe(
			'Content-Disposition, Content-Length, X-Zapstore-Version, X-Zapstore-Sha256'
		);
		expect(headers.get('Content-Type')).toBe('application/vnd.android.package-archive');
	});
});

describe('blossomBlobUrl', () => {
	it('builds the content-addressed CDN URL', () => {
		const hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
		expect(blossomBlobUrl(hash)).toBe(`https://cdn.zapstore.dev/${hash}`);
	});
});
