<script lang="js">
/**
 * Studio Stack Edit Page — /studio/stacks/[naddr]/edit
 *
 * Shows the edit form immediately once the stack is found in Dexie.
 * App resolution runs in the background — only the Apps section shows a skeleton.
 */
import { page } from '$app/stores';
import { onMount } from 'svelte';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import StudioStackEdit from '$lib/components/studio/StudioStackEdit.svelte';
import ZappyError from '$lib/components/common/ZappyError.svelte';
import { loadStudioStackForEdit } from '$lib/purpleweb';
import { getCurrentPubkey, getIsSignedIn } from '$lib/stores/auth.svelte.js';

const naddr = $derived($page.params.naddr);

let stack = $state(null);
let apps = $state([]);
let appsLoading = $state(false);
let loadError = $state('');

onMount(() => {
	void loadStack();
});

async function loadStack() {
	if (!browser) return;
	loadError = '';
	try {
		const result = await loadStudioStackForEdit(naddr);
		if (result.redirectTo) {
			goto(result.redirectTo, { replaceState: true });
			return;
		}
		if (!result.stack) { loadError = result.error || 'Stack not found'; return; }

		// Ownership check
		const currentPubkey = getCurrentPubkey();
		if (!getIsSignedIn() || !currentPubkey || currentPubkey !== result.stack.pubkey) {
			goto('/stacks/' + naddr, { replaceState: true });
			return;
		}

		// Show the form immediately — no waiting for apps
		stack = result.stack;
		apps = result.apps;
	} catch (err) {
		console.error('[StudioStackEdit] load failed:', err);
		loadError = err?.message ?? 'Failed to load stack';
	}
}

function handleSaved(_result) {
	void loadStack();
}

function handleDeleted() {
	goto('/studio/insights', { replaceState: true });
}

function handleBack() {
	goto('/studio/insights');
}
</script>

<div class="detail-scroll" data-main-scroll>
	{#if loadError}
		<ZappyError message="this stack wasn't found." />
	{:else if stack}
		<StudioStackEdit
			{stack}
			{apps}
			{appsLoading}
			onBack={handleBack}
			onSaved={handleSaved}
			onDeleted={handleDeleted}
		/>
	{/if}
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
