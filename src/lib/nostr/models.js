/**
 * Event Models
 *
 * Single source of truth for parsing Nostr events into typed objects.
 * Used by both client and SSR/prerendering.
 */
import { nip19 } from 'nostr-tools';
import { EVENT_KINDS } from '$lib/config';
// =============================================================================
// Parsers
// =============================================================================
/**
 * Parse a kind 32267 App event
 */
export function parseApp(event) {
    const dTag = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
    let content = {};
    try {
        content = JSON.parse(event.content);
    }
    catch {
        content = { description: event.content };
    }
    const naddr = nip19.naddrEncode({
        kind: EVENT_KINDS.APP,
        pubkey: event.pubkey,
        identifier: dTag
    });
    const npub = nip19.npubEncode(event.pubkey);
    const description = content.description ?? '';
    return {
        id: event.id,
        pubkey: event.pubkey,
        npub,
        dTag,
        name: event.tags.find((t) => t[0] === 'name')?.[1] ?? content.name ?? dTag,
        description,
        descriptionHtml: description ? `<p>${description.replace(/\n/g, '</p><p>')}</p>` : undefined,
        icon: event.tags.find((t) => t[0] === 'icon')?.[1] ?? content.icon,
        images: event.tags.filter((t) => t[0] === 'image').map((t) => t[1]),
        platform: event.tags.find((t) => t[0] === 'platform')?.[1] ?? content.platform ?? 'Android',
        repository: event.tags.find((t) => t[0] === 'repository')?.[1] ?? content.repository,
        license: event.tags.find((t) => t[0] === 'license')?.[1] ?? content.license,
        url: event.tags.find((t) => t[0] === 'url')?.[1] ?? content.url,
        createdAt: event.created_at,
        naddr
    };
}
/**
 * Parse a kind 30063 Release event
 */
/**
 * Derive display version from release: prefer 'version' tag, else extract from dTag (package@version).
 * Matches website behavior so we show e.g. "v1.5.1-release" not "com.oxchat.nostr@v1.5.1-release".
 */
function releaseDisplayVersion(versionTag, dTag) {
    if (versionTag)
        return versionTag;
    const atIndex = dTag.lastIndexOf('@');
    if (atIndex !== -1 && atIndex < dTag.length - 1)
        return dTag.slice(atIndex + 1);
    return dTag;
}
export function parseRelease(event) {
    const dTag = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
    const aTag = event.tags.find((t) => t[0] === 'a')?.[1] ?? '';
    const versionTag = event.tags.find((t) => t[0] === 'version')?.[1];
    const version = releaseDisplayVersion(versionTag, dTag);
    const url = event.tags.find((t) => t[0] === 'url')?.[1];
    // Extract app d-tag from a-tag (format: "kind:pubkey:identifier")
    const appDTag = aTag.split(':')[2] ?? '';
    const notes = event.content || undefined;
    return {
        id: event.id,
        pubkey: event.pubkey,
        dTag,
        appDTag,
        version,
        releaseNotes: notes,
        notes,
        notesHtml: notes ? `<p>${notes.replace(/\n/g, '</p><p>')}</p>` : undefined,
        artifacts: event.tags.filter((t) => t[0] === 'e').map((t) => t[1]),
        createdAt: event.created_at,
        url
    };
}
/**
 * Parse a kind 1063 File Metadata event
 */
export function parseFileMetadata(event) {
    const url = event.tags.find((t) => t[0] === 'url')?.[1] ?? '';
    const mimeType = event.tags.find((t) => t[0] === 'm')?.[1] ?? '';
    const hash = event.tags.find((t) => t[0] === 'x')?.[1] ?? '';
    const size = parseInt(event.tags.find((t) => t[0] === 'size')?.[1] ?? '0', 10);
    return {
        id: event.id,
        pubkey: event.pubkey,
        url,
        mimeType,
        hash,
        size,
        createdAt: event.created_at
    };
}
/**
 * Parse a kind 0 Profile event
 */
export function parseProfile(event) {
    let content = {};
    try {
        content = JSON.parse(event.content);
    }
    catch {
        content = {};
    }
    return {
        pubkey: event.pubkey,
        name: content.name,
        displayName: content.display_name,
        picture: content.picture,
        about: content.about,
        nip05: content.nip05,
        lud16: content.lud16,
        createdAt: event.created_at
    };
}
/**
 * Parse a kind 30267 App Stack event
 */
export function parseAppStack(event) {
    const dTag = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
    const title = event.tags.find((t) => t[0] === 'title')?.[1] ??
        event.tags.find((t) => t[0] === 'name')?.[1] ?? dTag;
    const description = event.content || '';
    const image = event.tags.find((t) => t[0] === 'image')?.[1];
    // Parse 'a' tags to get app references (format: "kind:pubkey:identifier")
    const appRefs = event.tags
        .filter((t) => t[0] === 'a')
        .map((t) => {
        const parts = t[1]?.split(':') ?? [];
        return {
            kind: parseInt(parts[0] ?? '0', 10),
            pubkey: parts[1] ?? '',
            identifier: parts[2] ?? ''
        };
    })
        .filter((ref) => ref.pubkey && ref.identifier);
    const naddr = nip19.naddrEncode({
        kind: EVENT_KINDS.APP_STACK,
        pubkey: event.pubkey,
        identifier: dTag
    });
    return {
        id: event.id,
        pubkey: event.pubkey,
        dTag,
        title,
        description,
        image,
        appRefs,
        createdAt: event.created_at,
        naddr
    };
}
// =============================================================================
// Utilities
// =============================================================================
/**
 * Encode an app to its naddr
 */
export function encodeAppNaddr(pubkey, identifier) {
    return nip19.naddrEncode({
        kind: EVENT_KINDS.APP,
        pubkey,
        identifier
    });
}
/**
 * Encode an app stack to its naddr
 */
export function encodeStackNaddr(pubkey, identifier) {
    return nip19.naddrEncode({
        kind: EVENT_KINDS.APP_STACK,
        pubkey,
        identifier
    });
}
/**
 * Decode an naddr to its components
 */
export function decodeNaddr(naddr) {
    try {
        const decoded = nip19.decode(naddr);
        if (decoded.type === 'naddr') {
            return {
                kind: decoded.data.kind,
                pubkey: decoded.data.pubkey,
                identifier: decoded.data.identifier
            };
        }
    }
    catch {
        // Invalid naddr
    }
    return null;
}
