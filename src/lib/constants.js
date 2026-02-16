/**
 * Listing constants — shared between client and server.
 *
 * APPS_PAGE_SIZE / STACKS_PAGE_SIZE:
 *   - SSR seed size (first batch embedded in HTML)
 *   - Infinite-scroll request size (each subsequent batch)
 *   - Periodic refresh size (page 0 re-fetch)
 *
 * APPS_POLL_LIMIT / STACKS_POLL_LIMIT (= page × 3):
 *   - Server relay-cache warmup & polling window
 *   - Client persistent relay subscription limits
 */
export const APPS_PAGE_SIZE = 48;
export const STACKS_PAGE_SIZE = 24;

export const APPS_POLL_LIMIT = APPS_PAGE_SIZE * 3; // 60
export const STACKS_POLL_LIMIT = STACKS_PAGE_SIZE * 3; // 36
