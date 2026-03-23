/**
 * Community root — redirect to default section (forum or support) on server.
 */
import { redirect } from '@sveltejs/kit';
import { COMMUNITY_FORUM_AND_ACTIVITY_ENABLED } from '$lib/constants.js';

export function load() {
	throw redirect(
		302,
		COMMUNITY_FORUM_AND_ACTIVITY_ENABLED ? '/community/forum' : '/community/support'
	);
}
