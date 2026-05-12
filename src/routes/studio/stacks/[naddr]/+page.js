/**
 * Universal load for the studio stack edit page.
 * Always returns empty — the component loads from Dexie on the client.
 */
export const prerender = false;

export function load() {
	return {};
}
