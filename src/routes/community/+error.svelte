<script lang="js">
	/**
	 * Community route error boundary — surfaces errors so we can debug.
	 */
	import { page } from '$app/stores';
	import { COMMUNITY_FORUM_AND_ACTIVITY_ENABLED } from '$lib/constants.js';
	import SeoHead from '$lib/components/layout/SeoHead.svelte';

	const communityFallbackHref = COMMUNITY_FORUM_AND_ACTIVITY_ENABLED
		? '/community/forum'
		: '/community/support';
	const communityFallbackLabel = COMMUNITY_FORUM_AND_ACTIVITY_ENABLED ? 'Try Forum' : 'Try Support';

	const error = $derived($page.error);
	const message = $derived(error?.message ?? 'Unknown error');
	const stack = $derived(error?.stack ?? '');
</script>

<SeoHead title="Community error — Zapstore" />

<div class="community-error" style="background: hsl(var(--black)); color: hsl(var(--white)); padding: 2rem; max-width: 640px; margin: 0 auto;">
	<h1 style="font-size: 1.25rem; margin-bottom: 0.5rem;">Community route error</h1>
	<p style="font-family: monospace; font-size: 0.875rem; color: hsl(var(--white66)); margin-bottom: 1rem;">{message}</p>
	{#if stack}
		<pre style="font-size: 0.75rem; overflow: auto; background: hsl(var(--white8)); padding: 1rem; border-radius: 8px; white-space: pre-wrap; word-break: break-all;">{stack}</pre>
	{/if}
	<div style="margin-top: 1.5rem; display: flex; gap: 0.75rem;">
		<a href={communityFallbackHref} style="color: hsl(var(--blurpleLightColor));">{communityFallbackLabel}</a>
		<a href="/" style="color: hsl(var(--white66));">Home</a>
	</div>
</div>
