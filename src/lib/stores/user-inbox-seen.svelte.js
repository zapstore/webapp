/**
 * Inbox read state (localStorage, per pubkey):
 * - **Card dots:** event id is marked seen when the user engages that row (open thread, rail, root link).
 * - **Header dot:** cleared when the inbox panel opens; counts only notifications with `created_at`
 *   after that moment until the panel is opened again (see `markInboxHeaderOpenedNow`).
 */
import { browser } from '$app/environment';
import { SvelteSet } from 'svelte/reactivity';

const STORAGE_PREFIX = 'zapstore-inbox-seen:v1:';
const HEADER_OPENED_PREFIX = 'zapstore-inbox-header-opened-at:v1:';
const MAX_IDS = 3000;

/**
 * Bump `.count` when seen set changes so unread counts / dots react.
 * (Cannot export reassigned `$state` from a .svelte.js module.)
 */
export const inboxSeenSignal = $state({ count: 0 });

function bumpInboxSeenSignal() {
	inboxSeenSignal.count++;
}

/** @returns {SvelteSet<string>} */
export function readInboxSeenIds(pubkey) {
	if (!browser || !pubkey) return new SvelteSet();
	try {
		const raw = localStorage.getItem(STORAGE_PREFIX + pubkey);
		if (!raw) return new SvelteSet();
		const arr = JSON.parse(raw);
		return new SvelteSet(Array.isArray(arr) ? arr : []);
	} catch {
		return new SvelteSet();
	}
}

function writeInboxSeenIds(pubkey, set) {
	if (!browser || !pubkey) return;
	try {
		let arr = [...set];
		if (arr.length > MAX_IDS) arr = arr.slice(-MAX_IDS);
		localStorage.setItem(STORAGE_PREFIX + pubkey, JSON.stringify(arr));
	} catch {
		/* ignore */
	}
}

/**
 * @param {string} pubkey
 * @param {string[]} ids
 */
export function markInboxEventsSeen(pubkey, ids) {
	if (!browser || !pubkey || !ids?.length) return;
	const s = readInboxSeenIds(pubkey);
	let added = false;
	for (const id of ids) {
		if (id && !s.has(id)) {
			s.add(id);
			added = true;
		}
	}
	if (!added) return;
	writeInboxSeenIds(pubkey, s);
	bumpInboxSeenSignal();
}

/**
 * @param {string} pubkey
 * @param {string} eventId
 */
export function isInboxEventUnread(pubkey, eventId) {
	if (!pubkey || !eventId) return false;
	void inboxSeenSignal.count;
	return !readInboxSeenIds(pubkey).has(eventId);
}

/**
 * Unix seconds when the user last opened the inbox panel. When set, the header badge counts only
 * inbox events with `created_at` strictly greater than this. When null, the header uses unseen ids
 * (see `readInboxSeenIds`) so first-time users still get a badge.
 * @param {string} pubkey
 * @returns {number | null}
 */
export function getInboxHeaderOpenedAtSec(pubkey) {
	if (!browser || !pubkey) return null;
	try {
		const raw = localStorage.getItem(HEADER_OPENED_PREFIX + pubkey);
		if (raw == null || raw === '') return null;
		const n = Number(raw);
		return Number.isFinite(n) ? n : null;
	} catch {
		return null;
	}
}

/**
 * Call when the user opens the inbox feed — header dot clears immediately; new items after this
 * time bump the badge again.
 * @param {string} pubkey
 */
export function markInboxHeaderOpenedNow(pubkey) {
	if (!browser || !pubkey) return;
	const sec = Math.floor(Date.now() / 1000);
	try {
		localStorage.setItem(HEADER_OPENED_PREFIX + pubkey, String(sec));
	} catch {
		/* ignore */
	}
	bumpInboxSeenSignal();
}
