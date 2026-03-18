/**
 * Community root — redirect to forum on server so we never render this page.
 */
import { redirect } from '@sveltejs/kit';

export function load() {
	throw redirect(302, '/community/forum');
}
