import { nip19 } from 'nostr-tools';
import { EVENT_KINDS, PLATFORM_FILTER } from '$lib/config';
import { parseRelease } from '$lib/nostr';
import { parseProfile } from '$lib/nostr/models.js';
import { queryEvent, queryEvents } from '../storage/dexie.js';

/**
 * Load the raw details event and release rows for DetailsTab consumers.
 *
 * @param {{ app?: any, stack?: any, includeReleases?: boolean }} input
 */
export async function loadSocialDetailsData(input) {
	const target = input?.stack ?? input?.app;
	if (!target?.pubkey || !target?.dTag) {
		return { rawEvent: null, releases: [] };
	}

	const kind = input?.stack ? EVENT_KINDS.APP_STACK : EVENT_KINDS.APP;
	const rawEvent = await queryEvent({
		kinds: [kind],
		authors: [target.pubkey],
		'#d': [target.dTag],
		...(kind === EVENT_KINDS.APP ? PLATFORM_FILTER : {})
	});

	if (input?.stack || input?.includeReleases === false) {
		return { rawEvent, releases: [] };
	}

	const aTagValue = `${EVENT_KINDS.APP}:${target.pubkey}:${target.dTag}`;
	const [byA, byI] = await Promise.all([
		queryEvents({ kinds: [EVENT_KINDS.RELEASE], '#a': [aTagValue], limit: 50 }),
		queryEvents({ kinds: [EVENT_KINDS.RELEASE], '#i': [target.dTag], limit: 50 })
	]);
	const seen = new Set();
	const merged = [];
	for (const event of [...byA, ...byI]) {
		if (seen.has(event.id)) continue;
		seen.add(event.id);
		merged.push(event);
	}
	merged.sort((a, b) => b.created_at - a.created_at);
	const releases = merged.slice(0, 50).map((event) => {
		const parsed = parseRelease(event);
		let naddr = '';
		try {
			naddr = nip19.naddrEncode({
				kind: EVENT_KINDS.RELEASE,
				pubkey: event.pubkey,
				identifier: parsed.dTag
			});
		} catch {
			// ignore encoding errors
		}
		return { ...parsed, naddr, rawEvent: event };
	});

	return { rawEvent, releases };
}

/**
 * @param {string} id
 */
export async function loadEventWithAuthorProfile(id) {
	if (!id) return { event: null, profile: null };
	const event = await queryEvent({ ids: [id], limit: 1 });
	if (!event) return { event: null, profile: null };
	const profileEvent = await queryEvent({ kinds: [EVENT_KINDS.PROFILE], authors: [event.pubkey], limit: 1 });
	return { event, profile: profileEvent ? parseProfile(profileEvent) : null };
}
