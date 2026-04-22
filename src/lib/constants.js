/**
 * Listing constants — shared between client and server.
 *
 * APPS_PAGE_SIZE / STACKS_PAGE_SIZE:
 *   - SSR seed size (first batch embedded in HTML)
 *   - Infinite-scroll request size (each subsequent batch)
 *
 * APPS_POLL_LIMIT / STACKS_POLL_LIMIT:
 *   - Client persistent relay subscription limits
 */
export const APPS_PAGE_SIZE = 48;
export const STACKS_PAGE_SIZE = 24;

export const APPS_POLL_LIMIT = APPS_PAGE_SIZE * 3; // 144
// Client persistent relay subscription cap for stacks (load-more paginates separately).
export const STACKS_POLL_LIMIT = 100;

// Initial display counts for the /apps page (stacks + apps discover view)
export const DISCOVER_APPS_INITIAL = 16;
export const DISCOVER_STACKS_INITIAL = 8;

/** `/studio`: when true, signed-in users see the StudioApp dashboard; when false, same marketing page as logged-out. */
export const SHOW_STUDIO_SIGNED_IN_DASHBOARD = false;

/**
 * Community sidebar/tabs: when true, Forum + Activity (default landing `/community/forum`).
 * When false, Support only; Activity hidden; landing `/community/support`. Forum URLs still work if bookmarked.
 */
export const COMMUNITY_FORUM_AND_ACTIVITY_ENABLED = true;

export const SIGNAL_USER_SUPPORT_GROUP_URL =
	'https://signal.group/#CjQKIK20nMOglqNT8KYw4ZeyChsvA14TTcjtjuC2VF6j6nB5EhDLZ7pQHvOeopr36jq431ow';
export const SIGNAL_DEV_SUPPORT_GROUP_URL =
	'https://signal.group/#CjQKIC0VCHf6gGeeHKcIrKcaI-B5Kjvge2NKw2i4P55tMkCwEhBaOk9B80F3_MhMYVbgj7lL';
