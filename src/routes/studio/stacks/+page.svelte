<script lang="js">
/**
 * Studio Stacks Page — /studio/stacks
 *
 * Lists the current user's stacks. Clicking one navigates to its edit page.
 */
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { queryEvents, parseAppStack, liveQuery } from '$lib/nostr';
import { getCurrentPubkey, getIsSignedIn } from '$lib/stores/auth.svelte.js';
import { EVENT_KINDS } from '$lib/config.js';
import { encodeStackNaddr, stackDisplayTitle } from '$lib/nostr/models.js';
import { Layers } from 'lucide-svelte';

let stacks = $state([]);
let loading = $state(true);

$effect(() => {
	if (!browser) return;
	const pubkey = getCurrentPubkey();
	if (!pubkey || !getIsSignedIn()) {
		stacks = [];
		loading = false;
		return;
	}
	const sub = liveQuery(() =>
		queryEvents({ kinds: [EVENT_KINDS.APP_STACK], authors: [pubkey] })
	).subscribe({
		next: (events) => {
			stacks = (events ?? []).map(parseAppStack).sort((a, b) => b.createdAt - a.createdAt);
			loading = false;
		},
		error: (err) => {
			console.error('[StudioStacks] query failed:', err);
			loading = false;
		}
	});
	return () => sub.unsubscribe();
});

function getStackEditUrl(stack) {
	return '/studio/stacks/' + encodeStackNaddr(stack.pubkey, stack.dTag);
}
</script>

<div class="stacks-scroll" data-main-scroll>
	<div class="stacks-content">
		<div class="stacks-header">
			<span class="eyebrow-label header-eyebrow">Your Stacks</span>
		</div>

		{#if loading}
			<div class="state-center">
				<p class="regular14" style="color: var(--white33)">Loading…</p>
			</div>
		{:else if stacks.length === 0}
			<div class="empty-state">
				<Layers size={32} strokeWidth={1.2} color="var(--white16)" />
				<p class="regular14 empty-text">No stacks yet. Create one from any app page.</p>
			</div>
		{:else}
			<div class="stacks-list">
				{#each stacks as stack (stack.id)}
					{@const displayName = stackDisplayTitle({ title: stack.title, description: stack.description })}
					<button
						type="button"
						class="stack-row"
						onclick={() => goto(getStackEditUrl(stack))}
					>
						<div class="stack-icon" aria-hidden="true">
							<Layers size={18} strokeWidth={1.4} color="var(--white33)" />
						</div>
						<div class="stack-info">
							<span class="stack-name">{displayName}</span>
							{#if stack.description && stack.description !== stack.title}
								<span class="stack-desc">{stack.description}</span>
							{/if}
						</div>
						<span class="stack-app-count">
							{stack.appRefs?.length ?? 0} app{(stack.appRefs?.length ?? 0) !== 1 ? 's' : ''}
						</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.stacks-scroll {
		flex: 1;
		min-width: 0;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}

	.stacks-content {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	@media (min-width: 768px) {
		.stacks-content {
			padding: 16px;
		}
	}

	.stacks-header {
		padding: 0 4px;
		margin-bottom: 12px;
	}

	.header-eyebrow {
		color: var(--white33);
	}

	.state-center {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 40px;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 48px 24px;
		text-align: center;
	}

	.empty-text {
		color: var(--white33);
	}

	.stacks-list {
		display: flex;
		flex-direction: column;
		background: var(--gray33);
		border: 0.33px solid var(--white16);
		border-radius: 16px;
		overflow: hidden;
	}

	.stack-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--white8);
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: background 0.12s ease;
	}

	.stack-row:last-child {
		border-bottom: none;
	}

	.stack-row:hover {
		background: var(--white4);
	}

	.stack-icon {
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		background: var(--white8);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.stack-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.stack-name {
		font-size: 14px;
		font-weight: 500;
		color: var(--white);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.stack-desc {
		font-size: 12px;
		color: var(--white33);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.stack-app-count {
		flex-shrink: 0;
		font-size: 12px;
		color: var(--white33);
	}
</style>
