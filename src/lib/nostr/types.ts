/**
 * Nostr event types and interfaces
 */

import type { NostrEvent } from 'applesauce-core/helpers/event';
import type { Filter } from 'applesauce-core/helpers/filter';

// Re-export core types
export type { NostrEvent, Filter };

// Parsed app metadata (kind 32267)
export interface App {
	id: string;
	pubkey: string;
	npub?: string;
	dTag: string;
	name: string;
	description: string;
	descriptionHtml?: string;
	icon?: string;
	images: string[];
	platform?: string;
	repository?: string;
	license?: string;
	url?: string;
	createdAt: number;
	seenOn: string[];
	rawEvent?: unknown;
}

// Parsed release (kind 30063)
export interface Release {
	id: string;
	pubkey: string;
	dTag: string;
	appId: string; // Reference to app d-tag
	version: string;
	releaseNotes?: string;
	notes?: string; // Alias for releaseNotes
	notesHtml?: string;
	artifacts: string[]; // Event IDs of file metadata
	createdAt: number;
	seenOn: string[];
	url?: string;
}

// Parsed file metadata (kind 1063)
export interface FileMetadata {
	id: string;
	pubkey: string;
	url: string;
	mimeType: string;
	hash: string;
	size: number;
	createdAt: number;
	seenOn: string[];
}

// Parsed profile (kind 0) - Phase 2
export interface Profile {
	pubkey: string;
	name?: string;
	displayName?: string;
	picture?: string;
	about?: string;
	nip05?: string;
	lud16?: string;
	lud06?: string;
	createdAt: number;
	seenOn: string[];
}

// Subscription options for relay queries
export interface SubscriptionOptions {
	eoseTimeout?: number;
	onReady?: () => void;
	onEvent?: (event: NostrEvent, relay: string) => void;
	onEose?: () => void;
}

// Filter for app queries
export interface AppFilter {
	authors?: string[];
	dTags?: string[];
	search?: string;
	limit?: number;
	since?: number;
	until?: number;
}
