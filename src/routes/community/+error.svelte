<script lang="js">
/**
 * Community route error boundary.
 */
import { page } from '$app/stores';
import SeoHead from '$lib/components/layout/SeoHead.svelte';
import ZappyError from '$lib/components/common/ZappyError.svelte';

const errorMessage = $derived($page.error?.message ?? 'Unknown error');
const message = $derived(`something went wrong in the community section. ${errorMessage}`);
</script>

<SeoHead title="Community error — Zapstore" />

<ZappyError {message} />
