import { queryEvents } from './dexie.js';
import { groupLabelEventsToEntries } from '../sync/service.js';
import { EVENT_KINDS } from '$lib/config.js';
import {
	addressableId,
	uniqueStrings
} from '../core/refs.js';
import {
	Comment,
	Label,
	Profile,
	Zap,
	commentFiltersForAddressables,
	labelFiltersForAddressables,
	zapFiltersForAddressables,
	zapFiltersForEventIds
} from '../models/index.js';
import { dedupeEvents } from './query.js';
import { parseModels } from '../core/registry.js';

/**
 * @param {object[]} filters
 */
async function queryMany(filters) {
	const batches = await Promise.all((filters ?? []).map((filter) => queryEvents(filter)));
	return dedupeEvents(batches.flat());
}

/**
 * @param {number} kind
 * @param {string} pubkey
 * @param {string} identifier
 */
async function queryCommentsForAddressable(kind, pubkey, identifier) {
	const rootRef = addressableId(kind, pubkey, identifier);
	return queryMany(commentFiltersForAddressables(kind, [rootRef]));
}

/**
 * @param {import('nostr-tools').Event[]} commentEvents
 * @param {import('nostr-tools').Event[]} zapEvents
 * @param {import('nostr-tools').Event[]} labelEvents
 */
/**
 * Read latest kind-0 profiles for pubkeys from Dexie only (liveQuery-friendly).
 *
 * @param {unknown[]} pubkeys
 */
export async function queryProfilesForPubkeys(pubkeys) {
	const normalized = uniqueStrings(pubkeys)
		.map((pk) => pk.toLowerCase())
		.filter((pk) => /^[a-f0-9]{64}$/.test(pk));

	if (normalized.length === 0) {
		return { profiles: {}, missingProfilePubkeys: [] };
	}

	const profileEvents = await queryEvents({
		kinds: [EVENT_KINDS.PROFILE],
		authors: normalized,
		limit: normalized.length
	});

	/** @type {Map<string, import('nostr-tools').Event>} */
	const latestByPubkey = new Map();
	for (const event of profileEvents) {
		const pk = event.pubkey?.toLowerCase();
		if (!pk) continue;
		const existing = latestByPubkey.get(pk);
		if (!existing || event.created_at > existing.created_at) {
			latestByPubkey.set(pk, event);
		}
	}

	const profiles = {};
	for (const event of latestByPubkey.values()) {
		const [profile] = parseModels([event], Profile);
		if (profile?.pubkey) profiles[profile.pubkey.toLowerCase()] = profile;
	}

	const missingProfilePubkeys = normalized.filter((pk) => !profiles[pk]);
	return { profiles, missingProfilePubkeys };
}

async function queryProfilesForSocial(commentEvents, zapEvents, labelEvents) {
	const commentModels = parseModels(commentEvents, Comment);
	const zapModels = parseModels(zapEvents, Zap);
	const pubkeys = uniqueStrings([
		...commentModels.map((comment) => comment.pubkey),
		...commentEvents.flatMap((event) => event.tags?.filter((t) => t[0] === 'p' && t[1]).map((t) => t[1]) ?? []),
		...zapModels.flatMap((zap) => [zap.senderPubkey, zap.recipientPubkey]).filter(Boolean),
		...labelEvents.map((event) => event.pubkey)
	]).map((pk) => pk.toLowerCase());

	if (pubkeys.length === 0) {
		return { profiles: {}, zapperProfiles: new Map(), profilePubkeys: [], missingProfilePubkeys: [] };
	}

	const { profiles, missingProfilePubkeys } = await queryProfilesForPubkeys(pubkeys);

	const zapperProfiles = new Map();
	for (const zap of zapModels) {
		const sender = zap.senderPubkey?.toLowerCase();
		if (sender && profiles[sender]) {
			zapperProfiles.set(sender, profiles[sender]);
		}
	}

	return { profiles, zapperProfiles, profilePubkeys: pubkeys, missingProfilePubkeys };
}

/**
 * Query all social data for an app/stack root from Dexie only.
 *
 * @param {{ kind: number, pubkey: string, identifier: string, mainEventIds?: string[] }} root
 */
export async function queryAddressableSocial(root) {
	if (!root?.kind || !root?.pubkey || !root?.identifier) {
		return {
			commentEvents: [],
			comments: [],
			zapEvents: [],
			zaps: [],
			labelEvents: [],
			labelEntries: [],
			profiles: {},
			zapperProfiles: new Map()
		};
	}

	const rootRef = addressableId(root.kind, root.pubkey, root.identifier);
	const commentEvents = await queryCommentsForAddressable(root.kind, root.pubkey, root.identifier);
	const eventIds = uniqueStrings([
		...(root.mainEventIds ?? []),
		...commentEvents.map((event) => event.id).filter(Boolean)
	]);
	const [rootZapEvents, eventZapEvents] = await Promise.all([
		queryMany(zapFiltersForAddressables([rootRef])),
		queryMany(zapFiltersForEventIds(eventIds))
	]);
	const zapEvents = dedupeEvents([...rootZapEvents, ...eventZapEvents]);
	const labelEvents = await queryMany(labelFiltersForAddressables([rootRef]));
	const { profiles, zapperProfiles, profilePubkeys, missingProfilePubkeys } =
		await queryProfilesForSocial(commentEvents, zapEvents, labelEvents);

	return {
		commentEvents,
		comments: parseModels(commentEvents, Comment),
		zapEvents,
		zaps: parseModels(zapEvents, Zap),
		labelEvents,
		labels: parseModels(labelEvents, Label),
		labelEntries: groupLabelEventsToEntries(labelEvents),
		profiles,
		zapperProfiles,
		profilePubkeys,
		missingProfilePubkeys,
		eventZapTargetIds: eventIds
	};
}
