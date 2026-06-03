import testimonials from '$lib/data/testimonials.json';
import { ZAPSTORE_RELAY, VERTEXLAB_RELAY } from '$lib/config.js';
import { parseProfile } from '$lib/nostr/models.js';
import { fetchProfilesServer } from '$lib/purpleweb/server.js';
import { nip19 } from 'nostr-tools';

export const prerender = false;

const TESTIMONIAL_PROFILE_RELAYS = [VERTEXLAB_RELAY, ZAPSTORE_RELAY];

export async function load() {
	try {
		const pubkeys = [
			...new Set(
				testimonials.map((t) => t.pubkey).filter((pk) => typeof pk === 'string' && pk.length === 64)
			)
		];

		const profileEvents = await fetchProfilesServer(pubkeys, { relays: TESTIMONIAL_PROFILE_RELAYS });

		const enrichedTestimonials = testimonials.map((t) => {
			let npub;
			let nevent;
			try {
				npub = nip19.npubEncode(t.pubkey);
				nevent = nip19.neventEncode({ id: t.id, author: t.pubkey });
			} catch {
				npub = t.pubkey.slice(0, 12) + '...';
				nevent = t.id;
			}

			const pk = t.pubkey.toLowerCase();
			const event = profileEvents.get(pk);
			const parsed = event ? parseProfile(event) : null;

			return {
				...t,
				npub,
				nevent,
				profile: parsed
					? {
							displayName: parsed.displayName ?? null,
							name: parsed.name ?? null,
							picture: parsed.picture ?? null,
							nip05: parsed.nip05 ?? null
						}
					: {
							name: null,
							picture: null,
							nip05: null
						}
			};
		});

		return {
			testimonials: enrichedTestimonials
		};
	} catch (e) {
		console.error('[Server] Failed to load homepage data:', e);
		return {
			testimonials: []
		};
	}
}
