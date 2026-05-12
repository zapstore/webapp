<script lang="js">
/**
 * Community route error boundary.
 */
import { page } from '$app/stores';
import { COMMUNITY_FORUM_AND_ACTIVITY_ENABLED } from '$lib/constants.js';
import SeoHead from '$lib/components/layout/SeoHead.svelte';
import ZappyError from '$lib/components/common/ZappyError.svelte';

const communityFallbackHref = COMMUNITY_FORUM_AND_ACTIVITY_ENABLED
	? '/community/forum'
	: '/community/support';
const communityFallbackLabel = COMMUNITY_FORUM_AND_ACTIVITY_ENABLED ? 'Try Forum' : 'Try Support';

const errorMessage = $derived($page.error?.message ?? 'Unknown error');
const message = $derived(`something went wrong in the community section. ${errorMessage}`);
</script>

<SeoHead title="Community error — Zapstore" />

<ZappyError
	{message}
	primaryAction={{ label: communityFallbackLabel, href: communityFallbackHref }}
	secondaryAction={{ label: 'Home', href: '/' }}
/>
