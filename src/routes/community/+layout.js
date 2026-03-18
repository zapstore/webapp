/**
 * Community layout — client-only render (components use Dexie/liveQuery).
 * Load functions still run on server and return seed data (forum feed + post detail),
 * so first paint is fast: client gets seedEvents in payload, seeds Dexie, liveQuery fills UI.
 * Sidebar is always visible on desktop.
 */
export const ssr = false;
