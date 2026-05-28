import {
	DEFAULT_CATALOG_RELAYS,
	EVENT_KINDS,
	PLATFORM_FILTER,
	ZAPSTORE_RELAY
} from '$lib/config.js';
import { browser } from '$app/environment';
import { SvelteSet } from 'svelte/reactivity';
import { decodeNaddr, parseApp, parseAppStack } from '$lib/nostr/models.js';
import { liveQuery, queryEvent, queryEvents } from '../storage/dexie.js';
import { fetchFromRelays } from '../sync/service.js';

/**
 * @param {import('nostr-tools').Event} event
 */
function parseExternalStudioApp(event) {
	return { ...parseStudioApp(event), external: true };
}

/**
 * @param {import('nostr-tools').Event} event
 */
function parseStudioApp(event) {
	const parsed = parseApp(event);
	return {
		id: parsed.dTag,
		name: parsed.name,
		icon: parsed.icon ?? '',
		description: parsed.description ?? '',
		url: parsed.url ?? '',
		images: parsed.images ?? [],
		eventId: parsed.id,
		event: parsed.event,
		pubkey: parsed.pubkey
	};
}

/**
 * Resolve an app by d-tag for studio indexer access.
 *
 * Relay hydration writes to Dexie; the returned value is parsed from the local
 * re-read so page code never renders relay results directly.
 *
 * @param {string} id
 */
export async function loadStudioIndexerApp(id) {
	const dTag = String(id ?? '').trim();
	if (!dTag) return null;

	let events = await queryEvents({ kinds: [EVENT_KINDS.APP], '#d': [dTag] });
	if (events.length === 0) {
		await fetchFromRelays(
			DEFAULT_CATALOG_RELAYS,
			{ kinds: [EVENT_KINDS.APP], '#d': [dTag], ...PLATFORM_FILTER, limit: 1 },
			{ timeout: 5000, feature: 'studio-app' }
		);
		events = await queryEvents({ kinds: [EVENT_KINDS.APP], '#d': [dTag] });
	}

	const match = events.find(
		(event) => (event.tags?.find((tag) => tag[0] === 'd')?.[1] ?? '').toLowerCase() === dTag.toLowerCase()
	);
	return match ? parseExternalStudioApp(match) : null;
}

/**
 * @param {string} naddr
 */
export async function loadStudioStackForEdit(naddr) {
	const pointer = decodeNaddr(naddr);
	if (!pointer) {
		return {
			stack: null,
			apps: [],
			error: naddr && !String(naddr).startsWith('naddr1') ? '' : 'Invalid stack URL',
			redirectTo: naddr && !String(naddr).startsWith('naddr1') ? `/apps/${naddr}` : ''
		};
	}

	if (pointer.kind === EVENT_KINDS.APP) {
		return {
			stack: null,
			apps: [],
			error: '',
			redirectTo: `/studio/apps/${encodeURIComponent(pointer.identifier)}`
		};
	}

	if (pointer.kind !== EVENT_KINDS.APP_STACK) {
		return { stack: null, apps: [], error: 'Invalid stack URL', redirectTo: '' };
	}

	let event = await queryEvent({
		kinds: [EVENT_KINDS.APP_STACK],
		authors: [pointer.pubkey],
		'#d': [pointer.identifier]
	});

	if (!event) {
		await fetchFromRelays(
			DEFAULT_CATALOG_RELAYS,
			{ kinds: [EVENT_KINDS.APP_STACK], authors: [pointer.pubkey], '#d': [pointer.identifier], limit: 1 },
			{ feature: 'studio-stack-edit' }
		);
		event = await queryEvent({
			kinds: [EVENT_KINDS.APP_STACK],
			authors: [pointer.pubkey],
			'#d': [pointer.identifier]
		});
	}

	if (!event) return { stack: null, apps: [], error: 'Stack not found', redirectTo: '' };

	const stack = parseAppStack(event);
	const apps = await loadStudioStackApps(stack);
	return { stack, apps, error: '', redirectTo: '' };
}

/**
 * @param {ReturnType<typeof parseAppStack>} stack
 */
export async function loadStudioStackApps(stack) {
	const appRefs = (stack?.appRefs ?? []).filter((ref) => ref.kind === EVENT_KINDS.APP);
	const ids = appRefs.map((ref) => ref.identifier).filter(Boolean);
	if (ids.length === 0) return [];

	let appEvents = await queryEvents({ kinds: [EVENT_KINDS.APP], '#d': ids });
	if (appEvents.length < appRefs.length) {
		const foundDTags = new SvelteSet(appEvents.map((event) => event.tags?.find((tag) => tag[0] === 'd')?.[1]));
		const missing = appRefs.filter((ref) => !foundDTags.has(ref.identifier));
		if (missing.length > 0) {
			await fetchFromRelays(
				[ZAPSTORE_RELAY],
				{
					kinds: [EVENT_KINDS.APP],
					'#d': missing.map((ref) => ref.identifier),
					...PLATFORM_FILTER,
					limit: missing.length + 5
				},
				{ feature: 'studio-stack-apps' }
			).catch(() => []);
			appEvents = await queryEvents({ kinds: [EVENT_KINDS.APP], '#d': ids });
		}
	}

	return appEvents.map(parseApp);
}

/**
 * @param {() => string | null | undefined} getPubkey
 * @param {{ limit?: number, timeout?: number, enabled?: () => boolean }} [options]
 */
export function createStudioAppsQuery(getPubkey, options = {}) {
	const state = $state({ items: [], loading: true, error: '' });

	$effect(() => {
		const pubkey = getPubkey?.();
		if (!browser || !pubkey || options.enabled?.() === false) {
			state.items = [];
			state.loading = false;
			return;
		}

		state.loading = true;
		void fetchFromRelays(
			[ZAPSTORE_RELAY],
			{ kinds: [EVENT_KINDS.APP], authors: [pubkey], ...PLATFORM_FILTER, limit: options.limit ?? 50 },
			{ timeout: options.timeout ?? 5000, feature: 'studio-apps' }
		).catch(() => {});

		const sub = liveQuery(() => queryEvents({ kinds: [EVENT_KINDS.APP], authors: [pubkey] })).subscribe({
			next(events) {
				state.items = (events ?? [])
					.map(parseStudioApp)
					.sort((a, b) => (b.event?.created_at ?? 0) - (a.event?.created_at ?? 0));
				state.loading = false;
				state.error = '';
			},
			error(err) {
				state.error = err instanceof Error ? err.message : 'Failed to load studio apps';
				state.loading = false;
			}
		});

		return () => sub.unsubscribe();
	});

	return state;
}

/**
 * @param {() => string | null | undefined} getPubkey
 * @param {{ limit?: number, timeout?: number, enabled?: () => boolean }} [options]
 */
export function createStudioStacksQuery(getPubkey, options = {}) {
	const state = $state({ items: [], loading: true, error: '' });

	$effect(() => {
		const pubkey = getPubkey?.();
		if (!browser || !pubkey || options.enabled?.() === false) {
			state.items = [];
			state.loading = false;
			return;
		}

		state.loading = true;
		void fetchFromRelays(
			[ZAPSTORE_RELAY],
			{ kinds: [EVENT_KINDS.APP_STACK], authors: [pubkey], limit: options.limit ?? 50 },
			{ timeout: options.timeout ?? 5000, feature: 'studio-stacks' }
		).catch(() => {});

		const sub = liveQuery(() => queryEvents({ kinds: [EVENT_KINDS.APP_STACK], authors: [pubkey] })).subscribe({
			next(events) {
				state.items = (events ?? []).map(parseAppStack).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
				state.loading = false;
				state.error = '';
			},
			error(err) {
				state.error = err instanceof Error ? err.message : 'Failed to load studio stacks';
				state.loading = false;
			}
		});

		return () => sub.unsubscribe();
	});

	return state;
}
