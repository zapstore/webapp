import testimonials from '$lib/data/testimonials.json';
import { nip19 } from 'nostr-tools';

export const prerender = false;

export async function load() {
    try {
        // Enrich testimonials with npub/nevent
        const enrichedTestimonials = testimonials.map((t) => {
            let npub, nevent;
            try {
                npub = nip19.npubEncode(t.pubkey);
                nevent = nip19.neventEncode({ id: t.id, author: t.pubkey });
            }
            catch (e) {
                npub = t.pubkey.slice(0, 12) + '...';
                nevent = t.id;
            }
            return {
                ...t,
                npub,
                nevent,
                profile: {
                    name: npub.slice(0, 12) + '...',
                    picture: null,
                    nip05: null
                }
            };
        });
        return {
            testimonials: enrichedTestimonials
        };
    }
    catch (e) {
        console.error('[Server] Failed to load homepage data:', e);
        return {
            testimonials: []
        };
    }
}
