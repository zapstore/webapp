/**
 * Image caching for Blossom/hash-based URLs
 *
 * Blossom images are content-addressed (SHA-256 hash in URL).
 * They are immutable - the same URL always returns the same content.
 * We cache these in IndexedDB for instant loading on repeat visits.
 */

import { getDb, STORE_NAMES } from './db';

const IMAGE_STORE_NAME = STORE_NAMES.IMAGES;

// Max images to cache (rough estimate: ~500KB avg = 250MB total)
const MAX_CACHED_IMAGES = 500;
const EVICTION_BATCH = 50;

interface CachedImage {
	url: string;
	blob: Blob;
	cachedAt: number;
	lastAccessed: number;
}

// SHA-256 hash pattern (64 hex characters)
const SHA256_PATTERN = /[a-f0-9]{64}/i;

// Known Blossom servers (can be extended)
const BLOSSOM_HOSTS = [
	'blossom.band',
	'cdn.satellite.earth',
	'nostr.build',
	'void.cat',
	'files.v0l.io',
	'media.zapstore.dev'
];

/**
 * Check if a URL is a Blossom/hash-based URL (immutable content)
 */
export function isBlossomUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		const hostname = parsed.hostname;
		
		// Check if it's a known Blossom host
		const isKnownHost = BLOSSOM_HOSTS.some(host => 
			hostname === host || hostname.endsWith(`.${host}`)
		);
		
		// Check if URL contains a SHA-256 hash (content-addressed)
		const hasHash = SHA256_PATTERN.test(parsed.pathname);
		
		return isKnownHost || hasHash;
	} catch {
		return false;
	}
}

/**
 * Extract cache key from URL (for hash-based URLs, use just the hash)
 */
function getCacheKey(url: string): string {
	try {
		const parsed = new URL(url);
		const hashMatch = parsed.pathname.match(SHA256_PATTERN);
		// If URL has a hash, use it as key (allows same image from different servers)
		return hashMatch ? hashMatch[0] : url;
	} catch {
		return url;
	}
}

/**
 * Get a cached image blob by URL
 */
export async function getCachedImage(url: string): Promise<string | null> {
	if (!isBlossomUrl(url)) return null;
	
	try {
		const db = await getDb();
		const key = getCacheKey(url);
		const record = await db.get(IMAGE_STORE_NAME, key);
		
		if (!record) return null;
		
		// Update last accessed time
		record.lastAccessed = Date.now();
		await db.put(IMAGE_STORE_NAME, record);
		
		// Return blob URL
		return URL.createObjectURL(record.blob);
	} catch (error) {
		console.warn('[ImageCache] Failed to get cached image:', error);
		return null;
	}
}

/**
 * Cache an image blob
 */
export async function cacheImage(url: string, blob: Blob): Promise<void> {
	if (!isBlossomUrl(url)) return;
	
	try {
		const db = await getDb();
		const key = getCacheKey(url);
		
		const record: CachedImage = {
			url: key,
			blob,
			cachedAt: Date.now(),
			lastAccessed: Date.now()
		};
		
		await db.put(IMAGE_STORE_NAME, record);
		await evictIfNeeded();
	} catch (error) {
		console.warn('[ImageCache] Failed to cache image:', error);
	}
}

/**
 * Fetch and cache an image, returning a blob URL
 */
export async function fetchAndCacheImage(url: string): Promise<string> {
	// Try cache first for Blossom URLs
	if (isBlossomUrl(url)) {
		const cached = await getCachedImage(url);
		if (cached) return cached;
	}
	
	// Fetch from network
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
	
	const blob = await response.blob();
	
	// Cache if it's a Blossom URL
	if (isBlossomUrl(url)) {
		await cacheImage(url, blob);
	}
	
	return URL.createObjectURL(blob);
}

/**
 * LRU eviction when cache limit reached
 */
async function evictIfNeeded(): Promise<void> {
	try {
		const db = await getDb();
		const count = await db.count(IMAGE_STORE_NAME);
		
		if (count <= MAX_CACHED_IMAGES) return;
		
		const tx = db.transaction(IMAGE_STORE_NAME, 'readwrite');
		const store = tx.objectStore(IMAGE_STORE_NAME);
		const index = store.index('lastAccessed');
		
		let cursor = await index.openCursor();
		let deleted = 0;
		
		while (cursor && deleted < EVICTION_BATCH) {
			await cursor.delete();
			deleted++;
			cursor = await cursor.continue();
		}
		
		await tx.done;
		console.log(`[ImageCache] Evicted ${deleted} old images`);
	} catch (error) {
		console.warn('[ImageCache] Eviction failed:', error);
	}
}

/**
 * Clear the image cache
 */
export async function clearImageCache(): Promise<void> {
	try {
		const db = await getDb();
		await db.clear(IMAGE_STORE_NAME);
	} catch (error) {
		console.warn('[ImageCache] Failed to clear cache:', error);
	}
}

/**
 * Get cache statistics
 */
export async function getImageCacheStats(): Promise<{ count: number; estimatedSize: number }> {
	try {
		const db = await getDb();
		const records = await db.getAll(IMAGE_STORE_NAME);
		
		const estimatedSize = records.reduce((sum: number, r: { blob?: Blob }) => sum + (r.blob?.size || 0), 0);
		
		return { count: records.length, estimatedSize };
	} catch {
		return { count: 0, estimatedSize: 0 };
	}
}
