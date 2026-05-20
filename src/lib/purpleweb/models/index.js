/**
 * Registered Nostr event models.
 *
 * Each spec is `{ kind, parse }` — kind + a deterministic parser that takes a
 * raw Nostr event and returns a plain object. Specs are intentionally tiny:
 * relay/limit choices, hydration cadence, and any chaining (releases ->
 * assets, etc.) live in the per-page Svelte query wrappers, not here.
 *
 * The catalog/social filter helpers exported below are used by
 * `storage/social.js` and by future per-kind query wrappers.
 */
import { nip19 } from 'nostr-tools';
import { EVENT_KINDS } from '$lib/config.js';
import {
	parseApp,
	parseAppStack,
	parseFileMetadata,
	parseProfile,
	parseRelease
} from '$lib/nostr/models.js';
import {
	parseComment,
	parseZapReceipt,
	parseZapFromCommentWrapper
} from '../sync/service.js';
import { defineModel, registerModels } from '../core/registry.js';
import { tagValues, uniqueStrings } from '../core/refs.js';

export const Profile = defineModel({
	name: 'Profile',
	kind: EVENT_KINDS.PROFILE,
	parse: parseProfile
});

export const App = defineModel({
	name: 'App',
	kind: EVENT_KINDS.APP,
	parse: parseApp
});

export const Release = defineModel({
	name: 'Release',
	kind: EVENT_KINDS.RELEASE,
	parse: parseRelease
});

export const FileMetadata = defineModel({
	name: 'FileMetadata',
	kind: EVENT_KINDS.FILE_METADATA,
	parse: parseFileMetadata
});

export const Stack = defineModel({
	name: 'Stack',
	kind: EVENT_KINDS.APP_STACK,
	parse: parseAppStack
});

export const Comment = defineModel({
	name: 'Comment',
	kind: EVENT_KINDS.COMMENT,
	parse(event) {
		const parsed = parseComment(event);
		try {
			parsed.npub = nip19.npubEncode(event.pubkey);
		} catch {
			parsed.npub = '';
		}
		return {
			...parsed,
			wrapperZap: parseZapFromCommentWrapper(event),
			event
		};
	}
});

export const Zap = defineModel({
	name: 'Zap',
	kind: EVENT_KINDS.ZAP_RECEIPT,
	parse(event) {
		return { ...parseZapReceipt(event), id: event.id, event };
	}
});

export const Label = defineModel({
	name: 'Label',
	kind: EVENT_KINDS.LABEL,
	parse(event) {
		return {
			id: event.id,
			pubkey: event.pubkey,
			labels: tagValues(event, 'l'),
			targetIds: [...tagValues(event, 'e'), ...tagValues(event, 'E')],
			targetAddresses: [...tagValues(event, 'a'), ...tagValues(event, 'A')],
			createdAt: event.created_at,
			event
		};
	}
});

// ---------------------------------------------------------------------------
// NIP-01 filter helpers for social reads. Used by `storage/social.js` and
// any future per-page query wrapper that loads comments/zaps/labels.
// ---------------------------------------------------------------------------

/**
 * @param {number} rootKind
 * @param {string[]} addresses
 */
export function commentFiltersForAddressables(rootKind, addresses) {
	const refs = uniqueStrings(addresses);
	return refs.length
		? [
				{ kinds: [EVENT_KINDS.COMMENT], '#K': [String(rootKind)], '#a': refs, limit: 500 },
				{ kinds: [EVENT_KINDS.COMMENT], '#K': [String(rootKind)], '#A': refs, limit: 500 }
			]
		: [];
}

/**
 * @param {string[]} addresses
 */
export function zapFiltersForAddressables(addresses) {
	const refs = uniqueStrings(addresses);
	return refs.length
		? [
				{ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#a': refs, limit: 400 },
				{ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#A': refs, limit: 400 }
			]
		: [];
}

/**
 * @param {string[]} ids
 */
export function zapFiltersForEventIds(ids) {
	const targets = uniqueStrings(ids)
		.map((id) => id.toLowerCase())
		.filter((id) => /^[a-f0-9]{64}$/.test(id));
	return targets.length
		? [
				{ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#e': targets, limit: 400 },
				{ kinds: [EVENT_KINDS.ZAP_RECEIPT], '#E': targets, limit: 400 }
			]
		: [];
}

/**
 * @param {string[]} addresses
 */
export function labelFiltersForAddressables(addresses) {
	const refs = uniqueStrings(addresses);
	return refs.length
		? [
				{ kinds: [EVENT_KINDS.LABEL], '#a': refs, limit: 300 },
				{ kinds: [EVENT_KINDS.LABEL], '#A': refs, limit: 300 }
			]
		: [];
}

export const MODEL_SPECS = [Profile, App, Release, FileMetadata, Stack, Comment, Zap, Label];

registerModels(MODEL_SPECS);
