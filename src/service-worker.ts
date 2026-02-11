/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Unique cache name for this deployment
const CACHE_NAME = `zapstore-${version}`;

// Separate cache for external images (persists across app deployments)
const IMAGE_CACHE_NAME = 'zapstore-images-v1';

// Max number of images to keep in cache (LRU cleanup)
const MAX_IMAGE_CACHE_SIZE = 500;

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
	...build, // Built app files (JS, CSS)
	...files // Static files
];

// Check if a request is for an image
function isImageRequest(request: Request): boolean {
	const accept = request.headers.get('accept') || '';
	const url = request.url.toLowerCase();
	return (
		accept.includes('image/') ||
		url.endsWith('.png') ||
		url.endsWith('.jpg') ||
		url.endsWith('.jpeg') ||
		url.endsWith('.gif') ||
		url.endsWith('.webp') ||
		url.endsWith('.svg') ||
		url.endsWith('.ico')
	);
}

// Trim image cache to max size (LRU: delete oldest entries)
async function trimImageCache(): Promise<void> {
	const cache = await caches.open(IMAGE_CACHE_NAME);
	const keys = await cache.keys();
	if (keys.length > MAX_IMAGE_CACHE_SIZE) {
		// Delete oldest entries (first in the list)
		const deleteCount = keys.length - MAX_IMAGE_CACHE_SIZE;
		await Promise.all(keys.slice(0, deleteCount).map((key) => cache.delete(key)));
	}
}

// Install: precache static assets
sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(PRECACHE_ASSETS))
			.then(() => sw.skipWaiting())
	);
});

// Activate: clean up old caches (preserve image cache)
sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key !== CACHE_NAME && key !== IMAGE_CACHE_NAME)
						.map((key) => caches.delete(key))
				)
			)
			.then(() => sw.clients.claim())
	);
});

// Fetch: cache-first for static assets and images, network-first for pages
sw.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	// Skip non-GET requests
	if (event.request.method !== 'GET') return;

	// Skip WebSocket requests
	if (url.protocol === 'wss:' || url.protocol === 'ws:') return;

	// Handle external images: cache-first for instant loading
	if (url.origin !== sw.location.origin && isImageRequest(event.request)) {
		event.respondWith(
			caches.match(event.request).then((cached) => {
				if (cached) {
					return cached;
				}

				// Not in cache: fetch and cache the image
				return fetch(event.request)
					.then((response) => {
						// Only cache successful responses
						if (response.ok && response.status === 200) {
							const clone = response.clone();
							caches.open(IMAGE_CACHE_NAME).then((cache) => {
								cache.put(event.request, clone);
								// Trim cache in background (don't block response)
								trimImageCache();
							});
						}
						return response;
					})
					.catch(() => {
						// Return a transparent 1x1 pixel for failed image requests
						return new Response(
							new Uint8Array([
								0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x21,
								0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00,
								0x01, 0x00, 0x00, 0x02, 0x01, 0x00, 0x00
							]),
							{ headers: { 'Content-Type': 'image/gif' } }
						);
					});
			})
		);
		return;
	}

	// Precached assets: cache-first (works for same-origin paths or cross-origin CDN URLs when PUBLIC_ASSET_BASE is set)
	const urlString = event.request.url;
	const isPrecached =
		PRECACHE_ASSETS.includes(urlString) || PRECACHE_ASSETS.includes(url.pathname);
	if (isPrecached) {
		event.respondWith(
			caches.match(event.request).then((cached) => cached || fetch(event.request))
		);
		return;
	}

	// Skip other external requests (e.g. third-party APIs)
	if (url.origin !== sw.location.origin) return;

	// For HTML pages: network-first with cache fallback
	if (event.request.headers.get('accept')?.includes('text/html')) {
		event.respondWith(
			fetch(event.request)
				.then((response) => {
					// Cache successful responses
					if (response.ok) {
						const clone = response.clone();
						caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
					}
					return response;
				})
				.catch(() => {
					// Offline: serve from cache
					return caches.match(event.request).then(
						(cached) =>
							cached ||
							new Response('Offline', {
								status: 503,
								statusText: 'Service Unavailable'
							})
					);
				})
		);
		return;
	}

	// For other requests: try network, fall back to cache
	event.respondWith(
		fetch(event.request).catch(() =>
			caches.match(event.request).then(
				(cached) =>
					cached ||
					new Response('Offline', {
						status: 503,
						statusText: 'Service Unavailable'
					})
			)
		)
	);
});
