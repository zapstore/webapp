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
import {
	decodeNaddr,
	parseAppStack,
	parseApp,
	queryEvent,
	queryEvents,
	putEvents
} from '$lib/nostr';
import { fetchFromRelays } from '$lib/nostr/service.js';
import { EVENT_KINDS, PLATFORM_FILTER, DEFAULT_CATALOG_RELAYS, ZAPSTORE_RELAY } from '$lib/config.js';
import { getCurrentPubkey, getIsSignedIn } from '$lib/stores/auth.svelte.js';
import { isOnline } from '$lib/stores/online.svelte.js';

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
		const pointer = decodeNaddr(naddr);
		if (!pointer) {
			const seg = naddr ?? '';
			if (seg && !seg.startsWith('naddr1')) {
				goto(`/apps/${seg}`, { replaceState: true });
				return;
			}
			loadError = 'Invalid stack URL';
			return;
		}

		if (pointer.kind === EVENT_KINDS.APP) {
			goto(`/studio/apps/${encodeURIComponent(pointer.identifier)}`, { replaceState: true });
			return;
		}

		let event = await queryEvent({
			kinds: [EVENT_KINDS.APP_STACK],
			authors: [pointer.pubkey],
			'#d': [pointer.identifier]
		});

		if (!event && isOnline()) {
			const fetched = await fetchFromRelays(
				DEFAULT_CATALOG_RELAYS,
				{ kinds: [EVENT_KINDS.APP_STACK], authors: [pointer.pubkey], '#d': [pointer.identifier], limit: 1 },
				{ feature: 'studio-stack-edit' }
			);
			if (fetched.length > 0) {
				event = fetched[0];
				await putEvents([event]).catch(() => {});
			}
		}

		if (!event) { loadError = 'Stack not found'; return; }

		const parsedStack = parseAppStack(event);

		// Ownership check
		const currentPubkey = getCurrentPubkey();
		if (!getIsSignedIn() || !currentPubkey || currentPubkey !== parsedStack.pubkey) {
			goto('/stacks/' + naddr, { replaceState: true });
			return;
		}

		// Show the form immediately — no waiting for apps
		stack = parsedStack;

		// Load apps in the background
		void loadApps(parsedStack);
	} catch (err) {
		console.error('[StudioStackEdit] load failed:', err);
		loadError = err?.message ?? 'Failed to load stack';
	}
}

async function loadApps(parsedStack) {
	if (!parsedStack.appRefs?.length) return;
	appsLoading = true;
	try {
		const appRefs = parsedStack.appRefs.filter((r) => r.kind === EVENT_KINDS.APP);
		const ids = appRefs.map((r) => r.identifier);
		if (!ids.length) return;
		let appEvents = await queryEvents({ kinds: [EVENT_KINDS.APP], '#d': ids });
		if (isOnline() && appEvents.length < appRefs.length) {
			const foundDTags = new Set(appEvents.map((e) => e.tags.find((t) => t[0] === 'd')?.[1]));
			const missing = appRefs.filter((r) => !foundDTags.has(r.identifier));
			if (missing.length > 0) {
				const fetched = await fetchFromRelays(
					[ZAPSTORE_RELAY],
					{ kinds: [EVENT_KINDS.APP], '#d': missing.map((r) => r.identifier), ...PLATFORM_FILTER, limit: missing.length + 5 },
					{ feature: 'studio-stack-apps' }
				).catch(() => []);
				if (fetched.length > 0) {
					await putEvents(fetched).catch(() => {});
					appEvents = await queryEvents({ kinds: [EVENT_KINDS.APP], '#d': ids });
				}
			}
		}
		apps = appEvents.map(parseApp);
	} catch (err) {
		console.error('[StudioStackEdit] apps load failed:', err);
	} finally {
		appsLoading = false;
	}
}

function handleSaved(_result) {
	void loadStack();
}

function handleDeleted() {
	goto('/studio/stacks', { replaceState: true });
}

function handleBack() {
	goto('/stacks/' + naddr);
}
</script>

<div class="detail-scroll">
	{#if loadError}
		<div class="state-center">
			<p class="eyebrow-label">{loadError}</p>
			<a href="/stacks" class="btn-secondary-small" style="margin-top: 16px;">Back to Stacks</a>
		</div>
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

	.state-center {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px;
		color: var(--white33);
		text-align: center;
	}
</style>
