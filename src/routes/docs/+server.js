import { redirect } from '@sveltejs/kit';

export const prerender = true;

/** @type {import('./$types').RequestHandler} */
export function GET() {
	throw redirect(308, '/docs/quickstart');
}

