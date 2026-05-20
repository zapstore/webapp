/**
 * Nostr protocol helpers — pure, no I/O.
 *
 * Event parsing, NIP-19 encoding, and other protocol-level utilities live here.
 * Everything that touches IndexedDB or a relay belongs in `$lib/purpleweb` —
 * `import { queryEvents, fetchFromRelays, ... } from '$lib/purpleweb'`.
 */

// Models (event parsing — pure transforms, no I/O)
export {
	parseApp,
	parseRelease,
	parseFileMetadata,
	parseProfile,
	parseForumPost,
	parseAppStack,
	getEventOneliner,
	encodeAppNaddr,
	encodeStackNaddr,
	decodeNaddr
} from './models.js';
