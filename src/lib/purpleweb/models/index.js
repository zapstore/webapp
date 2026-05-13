import { nip19 } from 'nostr-tools';
import {
	EVENT_KINDS,
	PLATFORM_FILTER,
	ZAPSTORE_COMMUNITY_PUBKEY
} from '$lib/config.js';
import {
	parseApp,
	parseAppStack,
	parseFileMetadata,
	parseForumPost,
	parseProfile,
	parseRelease
} from '$lib/nostr/models.js';
import {
	parseComment,
	parseZapReceipt,
	parseZapFromCommentWrapper
} from '$lib/nostr/service.js';
import { defineModel, registerModels } from '../core/registry.js';
import {
	addressableId,
	firstTagValue,
	parseAddressableId,
	tagValues,
	uniqueHexIds,
	uniqueStrings
} from '../core/refs.js';

/**
 * @param {any[]} models
 * @param {number} kind
 */
function addressableRefs(models, kind) {
	return uniqueStrings(
		models
			.filter((model) => model?.pubkey && model?.dTag)
			.map((model) => addressableId(kind, model.pubkey, model.dTag))
	);
}

/**
 * @param {any[]} models
 */
function eventIds(models) {
	return uniqueHexIds(models.map((model) => model?.id).filter(Boolean));
}

/**
 * @param {string[]} pubkeys
 */
function profileFilters(pubkeys) {
	const authors = uniqueStrings(pubkeys).map((pk) => pk.toLowerCase());
	return authors.length ? [{ kinds: [EVENT_KINDS.PROFILE], authors, limit: authors.length }] : [];
}

export const Profile = defineModel({
	name: 'Profile',
	kind: EVENT_KINDS.PROFILE,
	parse: parseProfile
});

export const RelayList = defineModel({
	name: 'RelayList',
	kind: EVENT_KINDS.RELAY_LIST,
	parse(event) {
		return {
			id: event.id,
			pubkey: event.pubkey,
			relays: (event.tags ?? [])
				.filter((t) => t[0] === 'r' && /^wss?:\/\//i.test(t[1] ?? ''))
				.map((t) => ({ url: t[1], marker: t[2] ?? '' })),
			createdAt: event.created_at,
			event
		};
	}
});

export const Deletion = defineModel({
	name: 'Deletion',
	kind: EVENT_KINDS.DELETION,
	parse(event) {
		return {
			id: event.id,
			pubkey: event.pubkey,
			targetIds: tagValues(event, 'e'),
			targetAddresses: tagValues(event, 'a'),
			reason: event.content ?? '',
			createdAt: event.created_at,
			event
		};
	}
});

export const App = defineModel({
	name: 'App',
	kind: EVENT_KINDS.APP,
	parse: parseApp,
	relationships: {
		author: {
			model: Profile,
			filters: (apps) => profileFilters(apps.map((app) => app.pubkey))
		},
		releases: {
			model: null,
			filters(apps) {
				const refs = addressableRefs(apps, EVENT_KINDS.APP);
				const ids = uniqueStrings(apps.map((app) => app.dTag).filter(Boolean));
				return [
					refs.length ? { kinds: [EVENT_KINDS.RELEASE], '#a': refs, limit: 200 } : null,
					ids.length ? { kinds: [EVENT_KINDS.RELEASE], '#i': ids, limit: 200 } : null
				].filter(Boolean);
			}
		},
		comments: {
			model: null,
			filters(apps) {
				return commentFiltersForAddressables(EVENT_KINDS.APP, addressableRefs(apps, EVENT_KINDS.APP));
			}
		},
		zaps: {
			model: null,
			filters(apps) {
				return zapFiltersForAddressables(addressableRefs(apps, EVENT_KINDS.APP));
			}
		},
		labels: {
			model: null,
			filters(apps) {
				return labelFiltersForAddressables(addressableRefs(apps, EVENT_KINDS.APP));
			}
		}
	}
});

export const Release = defineModel({
	name: 'Release',
	kind: EVENT_KINDS.RELEASE,
	parse: parseRelease,
	relationships: {
		author: {
			model: Profile,
			filters: (releases) => profileFilters(releases.map((release) => release.pubkey))
		},
		artifacts: {
			model: null,
			filters(releases) {
				const ids = uniqueHexIds(releases.flatMap((release) => release.artifacts ?? []));
				return ids.length ? [{ ids, limit: ids.length }] : [];
			}
		}
	}
});

export const FileMetadata = defineModel({
	name: 'FileMetadata',
	kind: EVENT_KINDS.FILE_METADATA,
	parse: parseFileMetadata
});

export const Stack = defineModel({
	name: 'Stack',
	kind: EVENT_KINDS.APP_STACK,
	parse: parseAppStack,
	relationships: {
		author: {
			model: Profile,
			filters: (stacks) => profileFilters(stacks.map((stack) => stack.pubkey))
		},
		apps: {
			model: App,
			filters(stacks) {
				const ids = uniqueStrings(
					stacks.flatMap((stack) =>
						(stack.appRefs ?? [])
							.filter((ref) => ref.kind === EVENT_KINDS.APP)
							.map((ref) => ref.identifier)
					)
				);
				return ids.length
					? [{ kinds: [EVENT_KINDS.APP], '#d': ids, ...PLATFORM_FILTER, limit: ids.length + 20 }]
					: [];
			}
		},
		comments: {
			model: null,
			filters(stacks) {
				return commentFiltersForAddressables(EVENT_KINDS.APP_STACK, addressableRefs(stacks, EVENT_KINDS.APP_STACK));
			}
		},
		zaps: {
			model: null,
			filters(stacks) {
				return zapFiltersForAddressables(addressableRefs(stacks, EVENT_KINDS.APP_STACK));
			}
		},
		labels: {
			model: null,
			filters(stacks) {
				return labelFiltersForAddressables(addressableRefs(stacks, EVENT_KINDS.APP_STACK));
			}
		}
	}
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
	},
	relationships: {
		author: {
			model: Profile,
			filters: (comments) => profileFilters(comments.map((comment) => comment.pubkey))
		},
		mentionedProfiles: {
			model: Profile,
			filters(_comments, _options, events = []) {
				return profileFilters(events.flatMap((event) => tagValues(event, 'p')));
			}
		}
	}
});

export const Zap = defineModel({
	name: 'Zap',
	kind: EVENT_KINDS.ZAP_RECEIPT,
	parse(event) {
		return { ...parseZapReceipt(event), id: event.id, event };
	},
	relationships: {
		sender: {
			model: Profile,
			filters(zaps) {
				return profileFilters(zaps.map((zap) => zap.senderPubkey).filter(Boolean));
			}
		},
		recipient: {
			model: Profile,
			filters(zaps) {
				return profileFilters(zaps.map((zap) => zap.recipientPubkey).filter(Boolean));
			}
		}
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
	},
	relationships: {
		author: {
			model: Profile,
			filters: (labels) => profileFilters(labels.map((label) => label.pubkey))
		}
	}
});

export const ForumPost = defineModel({
	name: 'ForumPost',
	kind: EVENT_KINDS.FORUM_POST,
	parse(event) {
		const parsed = parseForumPost(event);
		return parsed ? { ...parsed, event } : null;
	},
	relationships: {
		author: {
			model: Profile,
			filters: (posts) => profileFilters(posts.map((post) => post.pubkey))
		},
		comments: {
			model: Comment,
			filters(posts) {
				const ids = eventIds(posts);
				return ids.length
					? [
							{ kinds: [EVENT_KINDS.COMMENT], '#K': [String(EVENT_KINDS.FORUM_POST)], '#e': ids, limit: 500 },
							{ kinds: [EVENT_KINDS.COMMENT], '#K': [String(EVENT_KINDS.FORUM_POST)], '#E': ids, limit: 500 }
						]
					: [];
			}
		},
		zaps: {
			model: Zap,
			filters(posts) {
				return zapFiltersForEventIds(eventIds(posts));
			}
		},
		labels: {
			model: Label,
			filters(posts) {
				const ids = eventIds(posts);
				return ids.length
					? [{ kinds: [EVENT_KINDS.LABEL], '#e': ids, '#h': [ZAPSTORE_COMMUNITY_PUBKEY], limit: 300 }]
					: [];
			}
		}
	}
});

export const Community = defineModel({
	name: 'Community',
	kind: EVENT_KINDS.COMMUNITY,
	parse(event) {
		return {
			id: event.id,
			pubkey: event.pubkey,
			name: firstTagValue(event, 'name') ?? '',
			description: firstTagValue(event, 'description') ?? event.content ?? '',
			image: firstTagValue(event, 'image'),
			createdAt: event.created_at,
			event
		};
	}
});

export const Asset = defineModel({
	name: 'Asset',
	kind: EVENT_KINDS.ASSET,
	parse(event) {
		const appRef = firstTagValue(event, 'i') ?? firstTagValue(event, 'a');
		return {
			id: event.id,
			pubkey: event.pubkey,
			appRef,
			url: firstTagValue(event, 'url'),
			hash: firstTagValue(event, 'x'),
			createdAt: event.created_at,
			event
		};
	}
});

export const ZapRequest = defineModel({
	name: 'ZapRequest',
	kind: EVENT_KINDS.ZAP_REQUEST,
	parse(event) {
		return {
			id: event.id,
			pubkey: event.pubkey,
			recipientPubkey: firstTagValue(event, 'p'),
			amountMillisats: Number.parseInt(firstTagValue(event, 'amount') ?? '0', 10) || 0,
			content: event.content ?? '',
			createdAt: event.created_at,
			event
		};
	}
});

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
	const targets = uniqueHexIds(ids);
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

/**
 * @param {number} kind
 * @param {string} pubkey
 * @param {string} identifier
 */
export function filtersForAddressableSocial(kind, pubkey, identifier) {
	const ref = addressableId(kind, pubkey, identifier);
	return {
		comments: commentFiltersForAddressables(kind, [ref]),
		zaps: zapFiltersForAddressables([ref]),
		labels: labelFiltersForAddressables([ref])
	};
}

/**
 * @param {string} value
 */
export function kindFromAddressable(value) {
	return parseAddressableId(value)?.kind ?? null;
}

export const MODEL_SPECS = [
	Profile,
	RelayList,
	Deletion,
	ForumPost,
	Community,
	FileMetadata,
	Asset,
	Comment,
	Label,
	ZapRequest,
	Zap,
	Release,
	Stack,
	App
];

registerModels(MODEL_SPECS);
