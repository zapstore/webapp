<script lang="js">
	import AddModal from '$lib/components/modals/AddModal.svelte';

	let {
		isOpen = $bindable(false),
		getCurrentPubkey = () => null,
		onAdd = () => {},
		onclose = () => {},
		dimOverlay = true,
		scopedInPanel = true
	} = $props();
</script>

<AddModal
	title="Add App"
	actionLabel="Add"
	bind:isOpen
	{getCurrentPubkey}
	{onAdd}
	{onclose}
	{dimOverlay}
	{scopedInPanel}
/>
