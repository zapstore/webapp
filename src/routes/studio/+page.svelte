<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getIsSignedIn } from '$lib/stores/auth.svelte.js';
	import { SHOW_STUDIO_SIGNED_IN_DASHBOARD } from '$lib/constants.js';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';
	import { SITE_URL } from '$lib/config';

	const signedIn = $derived(getIsSignedIn());

	onMount(() => {
		if (signedIn && SHOW_STUDIO_SIGNED_IN_DASHBOARD) {
			goto('/studio/insights', { replaceState: true });
		} else {
			goto('/developers', { replaceState: true });
		}
	});
</script>

<SeoHead
	title="Zapstore Studio"
	description="A purpose-built developer suite."
	url="{SITE_URL}/studio"
/>
