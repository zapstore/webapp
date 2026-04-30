<script>
	import { getContext } from 'svelte';
	import StudioAppActivity from '$lib/components/studio/StudioAppActivity.svelte';
	import StudioEmptyState from '$lib/components/studio/StudioEmptyState.svelte';

	const studio = getContext('studio');
	let inboxThreadOpen = $state(false);

	const showEmpty = $derived(!studio.appsLoading && studio.userApps.length === 0);
</script>

{#if showEmpty}
	<StudioEmptyState context="inbox" />
{:else}
	<section
		class="activity-section inbox-section inbox-scroll"
		class:scroll-locked={inboxThreadOpen}
	>
		<StudioAppActivity
			devPubkey={studio.studioPubkey}
			apps={studio.userApps}
			bind:threadModalOpen={inboxThreadOpen}
		/>
	</section>
{/if}

<style>
	.activity-section {
		padding: 20px 26px 40px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.inbox-section {
		padding: 0 20px 16px;
	}

	.inbox-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.inbox-scroll.scroll-locked {
		overflow-y: hidden;
	}
</style>
