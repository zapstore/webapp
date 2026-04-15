<script lang="js">
	/**
	 * Community root — client redirect when SSR is skipped (`+layout.js` ssr: false).
	 */
	import { goto } from '$app/navigation';
	import { COMMUNITY_FORUM_AND_ACTIVITY_ENABLED } from '$lib/constants.js';
	import { onMount } from 'svelte';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';

	const target = COMMUNITY_FORUM_AND_ACTIVITY_ENABLED ? '/community/forum' : '/community/support';

	onMount(() => {
		goto(target, { replaceState: true });
	});
</script>

<SeoHead title="Community — Zapstore" />

<div class="community-redirect">
	<p>Redirecting…</p>
</div>

<style>
	.community-redirect {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		color: var(--white33);
		font-size: 0.9375rem;
	}
</style>
