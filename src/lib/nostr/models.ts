/**
 * Event Models
 *
 * Single source of truth for parsing Nostr events into typed objects.
 * Used by both client and SSR/prerendering.
 */

import type { NostrEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { EVENT_KINDS } from '$lib/config';

// =============================================================================
// Types
// =============================================================================

export interface App {
	id: string;
	pubkey: string;
	dTag: string;
	name: string;
	description: string;
	icon?: string;
	images: string[];
	repository?: string;
	license?: string;
	createdAt: number;
	naddr: string;
}

export interface Release {
	id: string;
	pubkey: string;
	dTag: string;
	appDTag: string;
	version: string;
	releaseNotes?: string;
	artifacts: string[];
	createdAt: number;
}

export interface FileMetadata {
	id: string;
	pubkey: string;
	url: string;
	mimeType: string;
	hash: string;
	size: number;
	createdAt: number;
}

export interface Profile {
	pubkey: string;
	name?: string;
	displayName?: string;
	picture?: string;
	about?: string;
	nip05?: string;
	lud16?: string;
	createdAt: number;
}

// =============================================================================
// Parsers
// =============================================================================

/**
 * Parse a kind 32267 App event
 */
export function parseApp(event: NostrEvent): App {
	const dTag = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';

	let content: Record<string, unknown> = {};
	try {
		content = JSON.parse(event.content);
	} catch {
		content = { description: event.content };
	}

	const naddr = nip19.naddrEncode({
		kind: EVENT_KINDS.APP,
		pubkey: event.pubkey,
		identifier: dTag
	});

	return {
		id: event.id,
		pubkey: event.pubkey,
		dTag,
		name: event.tags.find((t) => t[0] === 'name')?.[1] ?? (content.name as string) ?? dTag,
		description: (content.description as string) ?? '',
		icon: event.tags.find((t) => t[0] === 'icon')?.[1] ?? (content.icon as string),
		images: event.tags.filter((t) => t[0] === 'image').map((t) => t[1]!),
		repository: content.repository as string | undefined,
		license: content.license as string | undefined,
		createdAt: event.created_at,
		naddr
	};
}

/**
 * Parse a kind 30063 Release event
 */
export function parseRelease(event: NostrEvent): Release {
	const dTag = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
	const aTag = event.tags.find((t) => t[0] === 'a')?.[1] ?? '';
	const version = event.tags.find((t) => t[0] === 'version')?.[1] ?? dTag;

	// Extract app d-tag from a-tag (format: "kind:pubkey:identifier")
	const appDTag = aTag.split(':')[2] ?? '';

	return {
		id: event.id,
		pubkey: event.pubkey,
		dTag,
		appDTag,
		version,
		releaseNotes: event.content || undefined,
		artifacts: event.tags.filter((t) => t[0] === 'e').map((t) => t[1]!),
		createdAt: event.created_at
	};
}

/**
 * Parse a kind 1063 File Metadata event
 */
export function parseFileMetadata(event: NostrEvent): FileMetadata {
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
export function parseProfile(event: NostrEvent): Profile {
	let content: Record<string, unknown> = {};
	try {
		content = JSON.parse(event.content);
	} catch {
		content = {};
	}

	return {
		pubkey: event.pubkey,
		name: content.name as string | undefined,
		displayName: content.display_name as string | undefined,
		picture: content.picture as string | undefined,
		about: content.about as string | undefined,
		nip05: content.nip05 as string | undefined,
		lud16: content.lud16 as string | undefined,
		createdAt: event.created_at
	};
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Encode an app to its naddr
 */
export function encodeAppNaddr(pubkey: string, identifier: string): string {
	return nip19.naddrEncode({
		kind: EVENT_KINDS.APP,
		pubkey,
		identifier
	});
}

/**
 * Decode an naddr to its components
 */
export function decodeNaddr(
	naddr: string
): { kind: number; pubkey: string; identifier: string } | null {
	try {
		const decoded = nip19.decode(naddr);
		if (decoded.type === 'naddr') {
			return {
				kind: decoded.data.kind,
				pubkey: decoded.data.pubkey,
				identifier: decoded.data.identifier
			};
		}
	} catch {
		// Invalid naddr
	}
	return null;
}
