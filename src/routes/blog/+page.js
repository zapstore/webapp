import { redirect } from '@sveltejs/kit';

export const prerender = true;

/** @param {import('./$types').PageLoadEvent} event */
export function load({ parent }) {
	return parent().then(({ navigation }) => {
		const first = navigation?.[0]?.href;
		if (first) throw redirect(302, first);
		return {};
	});
}
