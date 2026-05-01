<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getIsSignedIn } from '$lib/stores/auth.svelte.js';
	import { SHOW_STUDIO_SIGNED_IN_DASHBOARD } from '$lib/constants.js';

	onMount(() => {
		if (getIsSignedIn() && SHOW_STUDIO_SIGNED_IN_DASHBOARD) {
			goto('/studio/insights', { replaceState: true });
		} else {
			goto('/developers', { replaceState: true });
		}
	});
</script>
