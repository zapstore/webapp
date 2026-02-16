import { decodeNaddr } from '$lib/nostr';
import { fetchApp, fetchLatestReleaseForApp, fetchReleasesForApp } from '$lib/nostr/server';

export const prerender = false;

export const load = async ({ params }) => {
    const pointer = decodeNaddr(params.naddr);
    if (!pointer) {
        return {
            app: null,
            latestRelease: null,
            releases: [],
            error: 'Invalid app URL'
        };
    }
    const { pubkey, identifier } = pointer;
    const result = fetchApp(pubkey, identifier);
    if (!result) {
        return {
            app: null,
            latestRelease: null,
            releases: [],
            error: 'App not found'
        };
    }
    const { app, seedEvents } = result;
    const latestRelease = fetchLatestReleaseForApp(pubkey, identifier);
    const releases = fetchReleasesForApp(pubkey, identifier, 50);
    return {
        app,
        latestRelease,
        releases,
        seedEvents: seedEvents ?? [],
        error: null
    };
};
