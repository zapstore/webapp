<script lang="js">
/**
 * DetailContentActions - Round options button for app/stack/forum detail author rows.
 * Opens ActionsModal (comment, stacks, labels, report, delete own content).
 */
import { Options } from '$lib/components/icons';
import ActionsModal from '$lib/components/modals/ActionsModal.svelte';

let {
	contentType = 'app',
	target = null,
	appName = '',
	publisherName = '',
	iconUrl = null,
	contentSummary = '',
	version = '',
	searchProfiles = async () => [],
	searchEmojis = async () => [],
	getCurrentPubkey = () => null,
	signEvent = null,
	onCommentSubmit = null,
	otherZaps = [],
	onZapReceived = null,
	onZapPending = null,
	onZapPendingClear = null,
	onLabelPublished = () => {},
	onOwnContentDeleted = () => {},
	className = ''
} = $props();

let actionsModalOpen = $state(false);

const rootContext = $derived.by(() => {
	if (contentType === 'app') {
		return {
			label: appName || target?.name || '',
			iconUrl: iconUrl ?? target?.icon ?? null,
			identifier: target?.dTag ?? null,
			isApp: true
		};
	}
	if (contentType === 'stack') {
		return {
			label: appName || target?.name || '',
			isStack: true
		};
	}
	if (contentType === 'forum') {
		return {
			label: appName || 'Forum Post',
			isForum: true,
			iconUrl: '/images/emoji/forum.png'
		};
	}
	return null;
});

const contentPreview = $derived(
	contentSummary?.trim() || appName?.trim() || target?.name?.trim() || ''
);
</script>

<button
	type="button"
	class="detail-content-actions-btn {className}"
	onclick={() => {
		actionsModalOpen = true;
	}}
	aria-label="Actions"
>
	<Options variant="fill" size={16} color="var(--white33)" />
</button>

<ActionsModal
	bind:open={actionsModalOpen}
	{contentType}
	targetApp={target}
	{rootContext}
	{version}
	authorName={publisherName}
	authorPubkey={target?.pubkey ?? null}
	{contentPreview}
	recipientName={publisherName}
	{otherZaps}
	{getCurrentPubkey}
	{signEvent}
	{onCommentSubmit}
	{onZapReceived}
	{onZapPending}
	{onZapPendingClear}
	{onLabelPublished}
	{onOwnContentDeleted}
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
