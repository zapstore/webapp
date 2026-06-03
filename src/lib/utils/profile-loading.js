/**
 * When to show ProfilePic's metadata-loading shimmer.
 */
import { isRealProfileName } from '$lib/utils/npub-display.js';

/** Placeholder in `profiles` after Dexie + relay found no usable kind:0. */
export const PROFILE_NOT_FOUND = Object.freeze({});

/**
 * Record pubkeys we looked up but have no metadata — keeps `missingProfilePubkeys` accurate
 * and triggers reactive updates when assigned into `$state` `profiles`.
 *
 * @param {Record<string, { displayName?: string, name?: string, picture?: string }>} profiles
 * @param {Iterable<string>} pubkeys
 */
export function markProfilesResolved(profiles, pubkeys) {
	let next = profiles;
	let changed = false;
	for (const raw of pubkeys) {
		const pk = String(raw).toLowerCase();
		if (!pk || next[pk]) continue;
		if (!changed) {
			next = { ...profiles };
			changed = true;
		}
		next[pk] = PROFILE_NOT_FOUND;
	}
	return changed ? next : profiles;
}

/**
 * Re-apply not-found stubs after a liveQuery overwrites `profiles` from Dexie.
 *
 * @param {Record<string, { displayName?: string, name?: string, picture?: string }>} profiles
 * @param {Record<string, true>} hydratedPubkeys
 */
export function mergeResolvedProfileStubs(profiles, hydratedPubkeys) {
	let next = profiles;
	let changed = false;
	for (const pk of Object.keys(hydratedPubkeys)) {
		if (!hydratedPubkeys[pk] || next[pk]) continue;
		if (!changed) {
			next = { ...profiles };
			changed = true;
		}
		next[pk] = PROFILE_NOT_FOUND;
	}
	return changed ? next : profiles;
}

/**
 * @param {{ displayName?: string, name?: string, picture?: string } | null | undefined} profile
 */
export function hasProfileMetadata(profile) {
	if (profile === PROFILE_NOT_FOUND) return false;
	if (profile?.picture?.trim()) return true;
	if (isRealProfileName(profile?.displayName)) return true;
	if (isRealProfileName(profile?.name)) return true;
	return false;
}

/**
 * True while we are still waiting on Dexie and/or a one-shot relay hydration for this pubkey.
 *
 * @param {{
 *   profile?: { displayName?: string, name?: string, picture?: string } | null,
 *   pubkey?: string | null,
 *   profilesLoading?: boolean,
 *   missingProfilePubkeys?: string[],
 *   profileHydrationAttempted?: Set<string> | { has: (v: string) => boolean }
 * }} params
 */
export function isProfilePicLoading({
	profile,
	pubkey,
	profilesLoading = false,
	missingProfilePubkeys = [],
	profileHydrationAttempted
}) {
	const pk = String(pubkey ?? '')
		.trim()
		.toLowerCase();
	if (!pk) return false;
	if (hasProfileMetadata(profile)) return false;

	const missing = (missingProfilePubkeys ?? []).map((p) => String(p).toLowerCase());
	if (!missing.includes(pk)) return false;

	const attempted =
		typeof profileHydrationAttempted?.has === 'function'
			? profileHydrationAttempted.has(pk)
			: false;

	if (profilesLoading) return true;
	if (!attempted) return true;
	return false;
}
