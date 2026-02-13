import { nip19 } from 'nostr-tools';
import { fetchAppsByAuthor, fetchStacksByAuthor, fetchProfilesServer } from '$lib/nostr/server';
import { parseProfile } from '$lib/nostr/models';

export const prerender = false;

export const load = async ({ params }) => {
    const npub = params.npub ?? '';
    let pubkey = null;
    try {
        const decoded = nip19.decode(npub);
        if (decoded.type === 'npub') {
            pubkey = decoded.data;
        }
    }
    catch {
        pubkey = null;
    }
    if (!pubkey) {
        return { npub, pubkey: null, profile: null, apps: [], stacks: [], resolvedStacks: [] };
    }

    const [profileMap, apps, stacksResult] = await Promise.all([
        fetchProfilesServer([pubkey], { timeout: 5000 }),
        fetchAppsByAuthor(pubkey, 50),
        fetchStacksByAuthor(pubkey, 50)
    ]);

    const profileEvent = profileMap.get(pubkey) ?? null;
    const profile = profileEvent ? parseProfile(profileEvent) : null;

    return {
        npub,
        pubkey,
        profile,
        apps,
        stacks: stacksResult.stacks,
        resolvedStacks: stacksResult.resolvedStacks
    };
};
