<script lang="js">
/**
 * DetailContentActions - Round options button for app/stack/forum detail author rows.
 * Opens ActionsModal (labels, stacks, report, delete own content).
 */
import { Options } from '$lib/components/icons';
import ActionsModal from '$lib/components/modals/ActionsModal.svelte';
import ReportModal from '$lib/components/modals/ReportModal.svelte';

let {
	contentType = 'app',
	target = null,
	appName = '',
	publisherName = '',
	searchProfiles = async () => [],
	searchEmojis = async () => [],
	onLabelPublished = () => {},
	onOwnContentDeleted = () => {},
	className = '',
} = $props();

let actionsModalOpen = $state(false);
let reportModalOpen = $state(false);
</script>

<button
	type="button"
	class="detail-content-actions-btn {className}"
	onclick={() => { actionsModalOpen = true; }}
	aria-label="Actions"
>
	<Options variant="fill" size={16} color="var(--white33)" />
</button>

<ActionsModal
	bind:isOpen={actionsModalOpen}
	{contentType}
	targetApp={target}
	onReport={() => { reportModalOpen = true; }}
	{onLabelPublished}
	{onOwnContentDeleted}
/>

<ReportModal
	bind:isOpen={reportModalOpen}
	{appName}
	authorName={publisherName}
	{contentType}
	eventId={target?.id ?? ''}
	authorPubkey={target?.pubkey ?? ''}
	{searchProfiles}
	{searchEmojis}
/>

<style>
	.detail-content-actions-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		margin-left: auto;
		flex-shrink: 0;
		background: var(--gray33);
		border: none;
		border-radius: 50%;
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	.detail-content-actions-btn:hover {
		transform: scale(1.02);
	}

	.detail-content-actions-btn:active {
		transform: scale(0.98);
	}

	:global(.detail-header-trailing) .detail-content-actions-btn,
	:global(.detail-publisher-trailing) .detail-content-actions-btn {
		margin-left: 0;
	}

	.detail-content-actions-btn :global(svg) {
		display: block;
		width: 4px;
		height: 16px;
		flex-shrink: 0;
	}
</style>
