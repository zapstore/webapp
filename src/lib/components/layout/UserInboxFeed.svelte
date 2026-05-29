<!--
  Inbox feed body — identical in header popover and /studio/inbox.
  Only difference at call sites: popover adds the top bar chrome around this.
-->
<script lang="js">
	import CommunityActivityShell from '$lib/components/community/CommunityActivityShell.svelte';
	import RelayLoadingBar from '$lib/components/common/RelayLoadingBar.svelte';

	let {
		pubkey = null,
		inboxActive = false,
		/** Header popover only: thread sheets flush to panel bottom on desktop. Studio /studio/inbox keeps floating sheets. */
		inboxPopover = false,
		shellRef = $bindable(/** @type {CommunityActivityShell | null} */ (null))
	} = $props();

	let inboxRelayLoading = $state(false);

	function handleRelayLoadingChange(loading) {
		inboxRelayLoading = loading;
	}

	$effect(() => {
		if (!inboxActive) inboxRelayLoading = false;
	});
</script>

{#if pubkey && inboxActive}
	<RelayLoadingBar loading={inboxRelayLoading} />
	<div class="user-inbox-body flex-1 min-h-0 flex flex-col min-w-0">
		<CommunityActivityShell
			bind:this={shellRef}
			inboxUserPubkey={pubkey}
			inboxEmbed
			{inboxPopover}
			{inboxActive}
			onRelayLoadingChange={handleRelayLoadingChange}
		/>
	</div>
{/if}

