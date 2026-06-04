<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getIsSignedIn } from '$lib/stores/auth.svelte.js';
	import { SHOW_STUDIO_SIGNED_IN_DASHBOARD } from '$lib/constants.js';

	/** Client fallback when auth is not initialized yet (+page.js load skips redirect). */
	onMount(() => {
		if (getIsSignedIn() && SHOW_STUDIO_SIGNED_IN_DASHBOARD) {
			goto('/studio/insights', { replaceState: true });
		} else {
			goto('/developers', { replaceState: true });
		}
	});
</script>

<p class="studio-redirect-message regular14 text-white/66">Redirecting…</p>

<style>
	.studio-redirect-message {
		padding: 24px 20px;
		margin: 0;
	}
</style>
