<script lang="js">
/**
 * CommentActionsModal — Bottom sheet for a comment or zap in a thread: Comment, Zap, Details, Report.
 * Stacks above the thread modal (noBackdrop on the main sheet). Details opens a nested modal with DetailsTab-style content.
 */
import { browser } from "$app/environment";
import { nip19 } from "nostr-tools";
import Modal from "$lib/components/common/Modal.svelte";
import DetailsTab from "./DetailsTab.svelte";
import QuotedMessage from "./QuotedMessage.svelte";
import QuotedZapMessage from "./QuotedZapMessage.svelte";
import ReportModal from "$lib/components/modals/ReportModal.svelte";
import { Reply, Zap, Details } from "$lib/components/icons";
import { queryEvent } from "$lib/nostr";
import { EVENT_KINDS } from "$lib/config.js";

let {
	open = $bindable(false),
	/** True while Details or Report sheet is open — parent thread can dim / scale */
	nestedChildOpen = $bindable(false),
	authorName = "Anonymous",
	authorPubkey = null,
	contentPreview = "",
	isZapPreview = false,
	zapAmountSats = 0,
	zapContent = "",
	zapEmojiTags = [],
	/** Event id to load for Details / Report (the selected comment or zap receipt) */
	targetEventId = "",
	/** Kind of the reported / detailed event — 1111 comment or 9735 zap */
	targetEventKind = EVENT_KINDS.COMMENT,
	onComment,
	onZap,
	searchProfiles = async () => [],
	searchEmojis = async () => [],
} = $props();

let detailsOpen = $state(false);
let reportOpen = $state(false);
let detailsEvent = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
let detailsLoading = $state(false);

const reportContentType = $derived(targetEventKind === EVENT_KINDS.ZAP_RECEIPT ? "zap" : "comment");

const detailsPublicationLabel = $derived(
	targetEventKind === EVENT_KINDS.ZAP_RECEIPT ? "Zap receipt" : "Comment"
);

const detailsShareableId = $derived.by(() => {
	if (!detailsEvent?.id) return "";
	try {
		return nip19.neventEncode({ id: detailsEvent.id });
	} catch {
		return detailsEvent.id.slice(0, 16) + "…";
	}
});

const detailsNpub = $derived.by(() => {
	const pk = detailsEvent?.pubkey;
	if (!pk || typeof pk !== "string") return "";
	try {
		return nip19.npubEncode(pk);
	} catch {
		return "";
	}
});

function chooseComment() {
	open = false;
	onComment?.();
}

function chooseZap() {
	open = false;
	onZap?.();
}

function openDetails() {
	detailsOpen = true;
}

function openReport() {
	open = false;
	reportOpen = true;
}

$effect(() => {
	if (!browser || !detailsOpen || !targetEventId?.trim()) {
		if (!detailsOpen) detailsEvent = null;
		return;
	}
	detailsLoading = true;
	detailsEvent = null;
	let cancelled = false;
	queryEvent({ ids: [targetEventId.trim()] })
		.then((ev) => {
			if (!cancelled) detailsEvent = ev ?? null;
		})
		.catch(() => {
			if (!cancelled) detailsEvent = null;
		})
		.finally(() => {
			if (!cancelled) detailsLoading = false;
		});
	return () => {
		cancelled = true;
	};
});

$effect(() => {
	if (!open) {
		detailsOpen = false;
	}
});

$effect(() => {
	nestedChildOpen = detailsOpen || reportOpen;
});
</script>

<Modal
	bind:open
	ariaLabel="Comment actions"
	align="bottom"
	wide={true}
	noBackdrop={true}
	zIndex={55}
	class="comment-actions-modal"
>
	<div class="comment-actions-modal-content">
		<div class="actions-section title-section">
			<h2 class="modal-title-text">Actions</h2>
		</div>

		<div class="section-divider"></div>

		<div class="actions-section preview-section">
			{#if isZapPreview}
				<QuotedZapMessage
					{authorName}
					{authorPubkey}
					amountSats={zapAmountSats}
					content={zapContent}
					emojiTags={zapEmojiTags}
				/>
			{:else}
				<QuotedMessage {authorName} authorPubkey={authorPubkey} content={contentPreview} />
			{/if}
		</div>

		<div class="section-divider"></div>

		<div class="actions-section flush-rows">
			<button type="button" class="action-row-btn" onclick={chooseComment}>
				<Reply variant="outline" size={20} strokeWidth={1.4} color="hsl(var(--white66))" />
				<span>Comment</span>
			</button>
		</div>

		<div class="section-divider"></div>

		<div class="actions-section flush-rows">
			<button type="button" class="action-row-btn" onclick={chooseZap}>
				<Zap variant="outline" size={20} strokeWidth={1.4} color="hsl(var(--white66))" />
				<span>Zap</span>
			</button>
		</div>

		<div class="section-divider"></div>

		<div class="actions-section flush-rows">
			<button
				type="button"
				class="action-row-btn"
				onclick={openDetails}
				disabled={!targetEventId?.trim()}
			>
				<Details variant="outline" size={20} strokeWidth={1.4} color="hsl(var(--white66))" />
				<span>Details</span>
			</button>
		</div>

		<div class="section-divider"></div>

		<div class="actions-section report-section">
			<div class="section-content">
				<button type="button" class="report-button" onclick={openReport}>
					Report this {reportContentType === "zap" ? "zap" : "comment"}
				</button>
			</div>
		</div>
	</div>
</Modal>

<Modal
	bind:open={detailsOpen}
	ariaLabel="Event details"
	align="bottom"
	wide={true}
	zIndex={58}
	maxHeight={85}
	class="comment-details-nested-modal"
>
	<div class="details-modal-inner">
		<h2 class="details-modal-title">Details</h2>
		{#if detailsLoading}
			<p class="details-loading">Loading…</p>
		{:else if detailsEvent}
			<DetailsTab
				shareableId={detailsShareableId}
				publicationLabel={detailsPublicationLabel}
				npub={detailsNpub}
				pubkey={detailsEvent.pubkey ?? ""}
				rawData={detailsEvent}
				shareLink=""
				repository=""
			/>
		{:else}
			<p class="details-empty">Could not load this event from your device.</p>
		{/if}
	</div>
</Modal>

<ReportModal
	bind:isOpen={reportOpen}
	appName=""
	authorName={authorName}
	contentType={reportContentType}
	eventId={targetEventId?.trim() ?? ""}
	authorPubkey={authorPubkey?.trim() ?? ""}
	{searchProfiles}
	{searchEmojis}
/>

<style>
	.comment-actions-modal-content {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		min-width: 0;
	}

	.actions-section {
		padding: 12px 0;
	}

	.title-section {
		padding-top: 20px;
		padding-bottom: 8px;
	}

	.modal-title-text {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		text-align: center;
	}

	.preview-section {
		padding: 12px 20px;
	}

	.flush-rows {
		padding: 0;
	}

	.section-divider {
		width: 100%;
		height: 1px;
		background-color: hsl(var(--white8));
		flex-shrink: 0;
	}

	.action-row-btn {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: flex-start;
		gap: 14px;
		width: 100%;
		padding: 16px 24px;
		margin: 0;
		border: none;
		background: transparent;
		color: hsl(var(--foreground));
		font-size: 17px;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		box-sizing: border-box;
	}

	.action-row-btn:hover:not(:disabled) {
		background: hsl(var(--white8));
	}

	.action-row-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.report-section {
		padding-bottom: 16px;
	}

	.section-content {
		padding: 0 12px;
	}

	.report-button {
		width: 100%;
		height: 42px;
		padding: 0 20px;
		font-size: 16px;
		font-weight: 500;
		color: hsl(var(--destructive));
		background-color: hsl(var(--black33));
		border: none;
		border-radius: var(--radius-16);
		cursor: pointer;
	}

	@media (max-width: 767px) {
		.report-button {
			height: 38px;
		}
	}

	.details-modal-inner {
		padding: 16px 12px 24px;
		max-height: min(80vh, 640px);
		overflow-y: auto;
		box-sizing: border-box;
	}

	.details-modal-title {
		margin: 0 0 12px 0;
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		text-align: center;
	}

	.details-loading,
	.details-empty {
		margin: 16px 12px;
		font-size: 14px;
		color: hsl(var(--white33));
		text-align: center;
	}
</style>
