<script>
	import { getCurrentPubkey } from '$lib/stores/auth.svelte.js';
	import UserInboxFeed from '$lib/components/layout/UserInboxFeed.svelte';

	const pubkey = $derived(getCurrentPubkey());
</script>

{#if pubkey}
	<section class="studio-inbox-page">
		<UserInboxFeed {pubkey} inboxActive={true} />
	</section>
{/if}

<style>
	.studio-inbox-page {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
</style>
