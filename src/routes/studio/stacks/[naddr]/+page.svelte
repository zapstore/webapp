<script lang="js">
/**
 * /studio/stacks/[naddr] — redirects to the canonical edit route.
 */
import { page } from '$app/stores';
import { onMount } from 'svelte';
import { goto } from '$app/navigation';

onMount(() => {
	goto('/studio/stacks/' + $page.params.naddr + '/edit', { replaceState: true });
});
</script>
