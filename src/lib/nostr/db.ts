/**
 * Shared IndexedDB connection
 *
 * Manages the database connection and schema for both events and images.
 */

import { openDB, type IDBPDatabase } from 'idb';
import { IDB_NAME, IDB_VERSION } from '$lib/config';

const EVENTS_STORE = 'events';
const IMAGES_STORE = 'images';

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * Get the IndexedDB database instance
 */
export function getDb(): Promise<IDBPDatabase> {
	if (!dbPromise) {
		dbPromise = openDB(IDB_NAME, IDB_VERSION, {
			upgrade(db) {
				// Events store
				if (!db.objectStoreNames.contains(EVENTS_STORE)) {
					const eventsStore = db.createObjectStore(EVENTS_STORE, { keyPath: 'id' });
					eventsStore.createIndex('lastAccessed', 'lastAccessed');
					eventsStore.createIndex('kind', 'kind');
				}

				// Images store
				if (!db.objectStoreNames.contains(IMAGES_STORE)) {
					const imagesStore = db.createObjectStore(IMAGES_STORE, { keyPath: 'url' });
					imagesStore.createIndex('lastAccessed', 'lastAccessed');
				}
			}
		});
	}
	return dbPromise;
}

export const STORE_NAMES = {
	EVENTS: EVENTS_STORE,
	IMAGES: IMAGES_STORE
} as const;
