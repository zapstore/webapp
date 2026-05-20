<script lang="js">
/**
 * Studio New Stack — /studio/stacks/new
 *
 * Create and publish a new public stack, then open the public stack page.
 */
import { goto } from '$app/navigation';
import StudioStackEdit from '$lib/components/studio/StudioStackEdit.svelte';
import { encodeStackNaddr, parseAppStack } from '$lib/nostr/models.js';

function handleBack() {
	goto('/studio/insights');
}

/** @param {import('nostr-tools').Event} signed */
function handlePublished(signed) {
	const parsed = parseAppStack(signed);
	const naddr = encodeStackNaddr(parsed.pubkey, parsed.dTag);
	goto(`/stacks/${naddr}`);
}
</script>

<div class="detail-scroll" data-main-scroll>
	<StudioStackEdit mode="create" onBack={handleBack} onPublished={handlePublished} />
</div>

<style>
	.detail-scroll {
		flex: 1;
		min-width: 0;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		display: flex;
		flex-direction: column;
	}

	.detail-scroll :global(> *) {
		flex: 1;
		min-height: 100%;
	}
</style>
