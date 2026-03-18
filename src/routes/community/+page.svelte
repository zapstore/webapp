<script lang="js">
	/**
	 * Community root — redirect to forum.
	 */
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		goto('/community/forum', { replaceState: true });
	});
</script>

<svelte:head>
	<title>Community — Zapstore</title>
</svelte:head>

<div class="community-redirect">
	<p>Redirecting to forum…</p>
</div>

<style>
	.community-redirect {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		color: hsl(var(--white33));
		font-size: 0.9375rem;
	}
</style>
