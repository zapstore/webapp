<script lang="js">
/**
 * Shared root app/stack/forum label row for CommentModal and ActionsModal.
 */
import ThreadRootBadge from './ThreadRootBadge.svelte';
import ThreadRootEvent from './ThreadRootEvent.svelte';

let {
	rootContext = null,
	version = '',
	showConnector = false
} = $props();
</script>

{#if rootContext}
	<div class="cm-root-block">
		<div class="cm-root-event-row">
			<ThreadRootBadge context={rootContext} />
			<div class="cm-root-event-main">
				<ThreadRootEvent context={rootContext} {version} />
			</div>
		</div>
		{#if showConnector}
			<div class="cm-root-connector" aria-hidden="true"></div>
		{/if}
	</div>
{/if}

<style>
	.cm-root-block {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		min-width: 0;
		width: 100%;
		padding-top: 4px;
	}

	.cm-root-event-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 8px;
		min-width: 0;
		width: 100%;
		padding-left: 8px;
		box-sizing: border-box;
	}

	.cm-root-event-row :global(.thread-root-badge:not(.thread-root-badge--app):not(.thread-root-badge--stack)) {
		background: var(--black33);
	}

	.cm-root-event-main {
		flex: 1;
		min-width: 0;
	}

	.cm-root-connector {
		width: 2px;
		height: 10px;
		margin-left: 21px;
		flex-shrink: 0;
		background: var(--white16);
	}
</style>
