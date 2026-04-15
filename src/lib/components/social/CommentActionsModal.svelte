<script lang="js">
/**
 * CommentActionsModal — Bottom sheet: quoted + Comment / Zaps (optional), Actions, Report.
 * Sub-views (Details / Label / Share / Report) replace content in the same sheet — no extra backdrop.
 */
import { browser } from "$app/environment";
import { nip19 } from "nostr-tools";
import Modal from "$lib/components/common/Modal.svelte";
import DetailsTab from "./DetailsTab.svelte";
import QuotedMessage from "./QuotedMessage.svelte";
import QuotedZapMessage from "./QuotedZapMessage.svelte";
import ReportModal from "$lib/components/modals/ReportModal.svelte";
import InputLabel from "$lib/components/common/InputLabel.svelte";
import LabelChip from "$lib/components/common/Label.svelte";
import { Reply, Zap, Details, Label, Share, ChevronDown, Id, Copy, Check } from "$lib/components/icons";
import { wheelScroll } from "$lib/actions/wheelScroll.js";
import { queryEvent, publishTopicLabelOnEvent } from "$lib/nostr";
import { EVENT_KINDS, FORUM_CATEGORIES, SITE_URL } from "$lib/config.js";
import { getIsSignedIn } from "$lib/stores/auth.svelte.js";

/** Preset sats chips (horizontal row); chevron opens full slider. */
const ZAP_PRESET_AMOUNTS = [21, 69, 100, 420, 500, 1000, 2500, 5000, 10000];

const DEFAULT_COMMENT_LABELS = ["Security", "Privacy", "Open Source", "Helpful", "Question", "Feedback"];

let {
	open = $bindable(false),
	nestedChildOpen = $bindable(false),
	/** When true, dimmed backdrop behind the sheet (e.g. feed). When false, parent already dims (thread modal). */
	sheetBackdrop = false,
	/** Thread modal + root ⋯: hide Comment + Zaps, keep Actions + Report only. */
	compactMode = false,
	authorName = "",
	authorPubkey = null,
	contentPreview = "",
	isZapPreview = false,
	zapAmountSats = 0,
	zapContent = "",
	zapEmojiTags = [],
	targetEventId = "",
	targetEventKind = EVENT_KINDS.COMMENT,
	/** Optional `#h` for forum-scoped labels (Zapstore community pubkey). */
	labelCommunityPubkey = null,
	onComment,
	onZap,
	onZapPreset,
	searchProfiles = async () => [],
	searchEmojis = async () => [],
	signEvent = null,
	lockBodyScroll = true,
	zIndex = 55,
	scopedInPanel = false,
} = $props();

const displayAuthorLabel = $derived.by(() => {
	const n = String(authorName ?? "").trim();
	if (n && n.toLowerCase() !== "anonymous") return n;
	const pk = authorPubkey?.trim();
	if (!pk) return "";
	try {
		const enc = nip19.npubEncode(pk);
		return `npub1${enc.slice(5, 8)}…${enc.slice(-6)}`;
	} catch {
		return pk.slice(0, 8);
	}
});

/** @type {'main' | 'details' | 'label' | 'share' | 'report'} */
let subPanel = $state("main");
let reportEmbedOpen = $state(false);
let shareFeedback = $state("");
let shareLinkCopied = $state(false);
let shareUrlCopied = $state(false);
let labelInputValue = $state("");
let labelError = $state("");
let labelPublishing = $state(false);
let detailsEvent = $state(/** @type {import('nostr-tools').NostrEvent | null} */ (null));
let detailsLoading = $state(false);

const reportContentType = $derived(targetEventKind === EVENT_KINDS.ZAP_RECEIPT ? "zap" : "comment");

const modalTitle = $derived.by(() => {
	switch (subPanel) {
		case "details":
			return "Details";
		case "label":
			return "Label";
		case "share":
			return "Share";
		case "report":
			return "Report";
		default:
			return "";
	}
});

const modalDescription = $derived.by(() => {
	if (subPanel !== "report") return "";
	const kind = reportContentType === "zap" ? "Zap" : "Comment";
	const name = String(displayAuthorLabel ?? "").trim();
	return name ? `${name}'s ${kind}` : kind;
});

const detailsPublicationLabel = $derived(
	targetEventKind === EVENT_KINDS.ZAP_RECEIPT ? "Zap receipt" : "Comment"
);

const labelSuggestions = $derived(labelCommunityPubkey ? [...FORUM_CATEGORIES] : DEFAULT_COMMENT_LABELS);

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

const canShare = $derived(Boolean(targetEventId?.trim()));
const shareNevent = $derived.by(() => {
	if (!canShare) return "";
	try {
		return nip19.neventEncode({ id: targetEventId.trim() });
	} catch {
		return "";
	}
});
const shareEmbedLink = $derived(shareNevent ? `nostr:${shareNevent}` : "");
const shareZapstoreUrl = $derived(shareNevent ? `${SITE_URL}/community/forum/${shareNevent}` : "");
const shareZapstoreDisplay = $derived(shareZapstoreUrl ? shareZapstoreUrl.replace(/^https?:\/\//, "") : "");

const canLabel = $derived(Boolean(targetEventId?.trim() && signEvent));

function chooseComment() {
	open = false;
	onComment?.();
}

function openFullZap() {
	open = false;
	onZap?.();
}

function pickPresetZap(amount) {
	open = false;
	onZapPreset?.(amount);
}

function goMain() {
	subPanel = "main";
	reportEmbedOpen = false;
}

function openDetailsPanel() {
	subPanel = "details";
}

function openLabelPanel() {
	if (!canLabel) return;
	subPanel = "label";
	labelError = "";
}

function openSharePanel() {
	if (!canShare) return;
	subPanel = "share";
	shareFeedback = "";
}

function openReportPanel() {
	subPanel = "report";
	reportEmbedOpen = true;
}

async function copyNeventToClipboard() {
	shareFeedback = "";
	if (!browser || !shareEmbedLink) return;
	try {
		await navigator.clipboard.writeText(shareEmbedLink);
		shareLinkCopied = true;
		shareFeedback = "Copied embed link";
	} catch {
		shareFeedback = "Could not copy";
		return;
	}
	setTimeout(() => {
		shareLinkCopied = false;
		shareFeedback = "";
	}, 2000);
}

async function copyZapstoreUrlToClipboard() {
	shareFeedback = "";
	if (!browser || !shareZapstoreUrl) return;
	try {
		await navigator.clipboard.writeText(shareZapstoreUrl);
		shareUrlCopied = true;
		shareFeedback = "Copied zapstore.dev URL";
	} catch {
		shareFeedback = "Could not copy";
		return;
	}
	setTimeout(() => {
		shareUrlCopied = false;
		shareFeedback = "";
	}, 2000);
}

async function publishLabelText(raw) {
	const body = String(raw ?? "").trim();
	if (!body || !signEvent || !targetEventId?.trim()) return;
	if (!getIsSignedIn()) {
		labelError = "Please sign in to add a label";
		return;
	}
	labelError = "";
	labelPublishing = true;
	try {
		await publishTopicLabelOnEvent(signEvent, {
			eventId: targetEventId.trim(),
			labelValue: body,
			communityPubkey: labelCommunityPubkey ?? undefined,
		});
		labelInputValue = "";
	} catch (err) {
		labelError = err instanceof Error ? err.message : "Failed to publish label";
	} finally {
		labelPublishing = false;
	}
}

function formatChipAmount(n) {
	if (n >= 1000000) return `${n / 1000000}M`;
	if (n >= 1000) return `${n / 1000}K`;
	return String(n);
}

$effect(() => {
	nestedChildOpen = subPanel !== "main";
});

$effect(() => {
	if (!browser || subPanel !== "details" || !targetEventId?.trim()) {
		if (subPanel !== "details") detailsEvent = null;
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
		subPanel = "main";
		reportEmbedOpen = false;
		shareFeedback = "";
		shareLinkCopied = false;
		shareUrlCopied = false;
		labelError = "";
		labelInputValue = "";
	}
});
</script>

<Modal
	bind:open
	ariaLabel="Comment actions"
	title={modalTitle}
	description={modalDescription}
	align="bottom"
	wide={true}
	noBackdrop={!sheetBackdrop}
	{zIndex}
	lockBodyScroll={lockBodyScroll}
	scopedInPanel={scopedInPanel}
	class="comment-actions-modal"
>
	<div class="cam-inner">
		{#if subPanel === "main"}
			{#if !compactMode}
				<button type="button" class="cam-comment-card" onclick={chooseComment}>
					<div class="cam-comment-card-quote">
						{#if isZapPreview}
							<QuotedZapMessage
								authorName={displayAuthorLabel}
								{authorPubkey}
								amountSats={zapAmountSats}
								content={zapContent}
								emojiTags={zapEmojiTags}
							/>
						{:else}
							<QuotedMessage
								authorName={displayAuthorLabel}
								authorPubkey={authorPubkey}
								content={contentPreview}
							/>
						{/if}
					</div>
					<div class="cam-comment-card-footer">
						<Reply
							variant="outline"
							size={18}
							strokeWidth={1.4}
							color="var(--white33)"
							className="cam-comment-card-icon"
						/>
						<span class="cam-comment-card-label">Comment</span>
					</div>
				</button>

				<div class="cam-section">
					<h3 class="eyebrow-label cam-eyebrow">Zap</h3>
					<div class="cam-zap-strip-wrap">
						<div class="cam-zap-scroll-mask" use:wheelScroll>
							<div class="cam-zap-chips">
								{#each ZAP_PRESET_AMOUNTS as amt (amt)}
									<button type="button" class="cam-zap-chip" onclick={() => pickPresetZap(amt)}>
										<Zap variant="fill" size={12} color="var(--goldColor)" />
										<span class="cam-zap-chip-num">{formatChipAmount(amt)}</span>
									</button>
								{/each}
							</div>
						</div>
						<button type="button" class="cam-zap-chevron" aria-label="Open zap" onclick={openFullZap}>
							<ChevronDown variant="outline" size={14} strokeWidth={2} color="var(--white66)" />
						</button>
					</div>
				</div>
			{/if}

			<div class="cam-section">
				<h3 class="eyebrow-label cam-eyebrow">Actions</h3>
				<div class="cam-actions-row">
					<button
						type="button"
						class="cam-panel-btn"
						onclick={openDetailsPanel}
						disabled={!targetEventId?.trim()}
					>
						<span class="cam-panel-icon-wrap" aria-hidden="true">
							<Details variant="outline" size={24} strokeWidth={1.4} color="var(--white66)" />
						</span>
						<span class="cam-panel-label">Details</span>
					</button>
					<button type="button" class="cam-panel-btn" onclick={openLabelPanel} disabled={!canLabel}>
						<span class="cam-panel-icon-wrap" aria-hidden="true">
							<Label variant="outline" size={24} strokeWidth={1.4} color="var(--white66)" />
						</span>
						<span class="cam-panel-label">Label</span>
					</button>
					<button type="button" class="cam-panel-btn" onclick={openSharePanel} disabled={!canShare}>
						<span class="cam-panel-icon-wrap" aria-hidden="true">
							<Share variant="outline" size={24} strokeWidth={1.4} color="var(--white66)" />
						</span>
						<span class="cam-panel-label">Share</span>
					</button>
				</div>
			</div>

			<button type="button" class="cam-report-btn" onclick={openReportPanel}>
				Report this {reportContentType === "zap" ? "zap" : "comment"}
			</button>
		{:else if subPanel === "details"}
			<div class="cam-subpanel">
				<div class="details-modal-inner cam-subpanel-body">
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
							panelBackground="black33"
						/>
					{:else}
						<p class="details-empty">Could not load this event from your device.</p>
					{/if}
				</div>
			</div>
		{:else if subPanel === "label"}
			<div class="cam-subpanel">
				<div class="cam-label-panel cam-subpanel-body">
					<InputLabel
						bind:value={labelInputValue}
						placeholder="Your label"
						onAdd={() => publishLabelText(labelInputValue)}
						addDisabled={labelPublishing || !getIsSignedIn()}
					/>
					{#if labelError}
						<p class="cam-label-error" role="alert">{labelError}</p>
					{/if}
					<div class="labels-scroll-row" use:wheelScroll>
						<div class="labels-row-inner">
							{#each labelSuggestions as label (label)}
								<button
									type="button"
									class="label-tap"
									onclick={() => publishLabelText(label)}
									disabled={labelPublishing || !getIsSignedIn()}
									aria-label={`Add label ${label}`}
								>
									<LabelChip text={label} isSelected={false} isEmphasized={false} />
								</button>
							{/each}
						</div>
					</div>
				</div>
			</div>
		{:else if subPanel === "share"}
			<div class="cam-subpanel">
				<div class="cam-share-panel cam-subpanel-body">
					<div class="cam-share-row">
						<div class="cam-share-left">
							<Id variant="outline" size={18} strokeWidth={1.4} color="var(--white66)" />
							<span class="cam-share-label">Embed link</span>
						</div>
						<span class="cam-share-value" title={shareEmbedLink}>{shareEmbedLink}</span>
						<button type="button" class="cam-share-copy-btn" onclick={copyNeventToClipboard} disabled={!canShare} aria-label="Copy embed link">
							{#if shareLinkCopied}
								<span class="check-icon">
									<Check variant="outline" size={14} strokeWidth={2.8} color="var(--blurpleLightColor)" />
								</span>
							{:else}
								<Copy variant="outline" size={16} color="var(--white66)" />
							{/if}
						</button>
					</div>
					<div class="cam-share-divider"></div>
					<div class="cam-share-row">
						<div class="cam-share-left">
							<Share variant="outline" size={18} strokeWidth={1.4} color="var(--white66)" />
							<span class="cam-share-label">Zapstore URL</span>
						</div>
						<span class="cam-share-value" title={shareZapstoreUrl}>{shareZapstoreDisplay}</span>
						<button type="button" class="cam-share-copy-btn" onclick={copyZapstoreUrlToClipboard} disabled={!canShare} aria-label="Copy zapstore URL">
							{#if shareUrlCopied}
								<span class="check-icon">
									<Check variant="outline" size={14} strokeWidth={2.8} color="var(--blurpleLightColor)" />
								</span>
							{:else}
								<Copy variant="outline" size={16} color="var(--white66)" />
							{/if}
						</button>
					</div>
				</div>
				{#if !canShare}
					<p class="cam-share-hint" role="status">No event id available</p>
				{:else if shareFeedback}
					<p class="cam-share-hint" role="status">{shareFeedback}</p>
				{/if}
			</div>
		{:else if subPanel === "report"}
			<ReportModal
				bind:isOpen={reportEmbedOpen}
				embedWithoutModal={true}
				onEmbedDismiss={goMain}
				appName=""
				authorName={displayAuthorLabel}
				contentType={reportContentType}
				eventId={targetEventId?.trim() ?? ""}
				authorPubkey={authorPubkey?.trim() ?? ""}
				{searchProfiles}
				{searchEmojis}
			/>
		{/if}
	</div>
</Modal>

<style>
	:global(.comment-actions-modal.modal-bottom .modal-content) {
		padding: 0;
	}

	.cam-inner {
		box-sizing: border-box;
		min-width: 0;
		padding: 12px;
		padding-bottom: 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	@media (max-width: 767px) {
		.cam-inner {
			padding: 16px;
			padding-bottom: max(16px, env(safe-area-inset-bottom, 0px));
		}
	}

	.cam-subpanel {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
		min-height: 120px;
	}

	.cam-subpanel-body {
		min-width: 0;
	}

	.cam-comment-card {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		width: 100%;
		margin: 0;
		padding: 8px;
		text-align: left;
		cursor: pointer;
		border: 0.33px solid var(--white33);
		border-radius: var(--radius-16);
		background: var(--black33);
		box-sizing: border-box;
	}

	.cam-comment-card:active {
		transform: scale(0.99);
	}

	.cam-comment-card-quote {
		min-width: 0;
		padding-left: 4px;
		box-sizing: border-box;
	}

	.cam-comment-card-footer {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: flex-start;
		gap: 10px;
		padding: 2px 4px 0 4px;
		margin-top: 0;
	}

	:global(.cam-comment-card-icon) {
		flex-shrink: 0;
		padding-left: 4px;
		box-sizing: content-box;
	}

	.cam-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}

	.cam-comment-card-label {
		font-size: 14px;
		font-weight: 500;
		color: var(--white33);
	}

	@media (min-width: 768px) {
		.cam-comment-card-label {
			font-size: 16px;
		}
	}

	.cam-eyebrow {
		margin: 0;
		padding-left: 12px;
		align-self: stretch;
	}

	.cam-zap-strip-wrap {
		position: relative;
		min-height: 52px;
		border-radius: var(--radius-16);
		background: var(--black33);
		padding: 8px 40px 8px 0;
		box-sizing: border-box;
	}

	.cam-zap-scroll-mask {
		overflow-x: auto;
		overflow-y: hidden;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
		-ms-overflow-style: none;
		mask-image: linear-gradient(to right, black calc(100% - 48px), transparent 100%);
		-webkit-mask-image: linear-gradient(to right, black calc(100% - 48px), transparent 100%);
	}

	.cam-zap-scroll-mask::-webkit-scrollbar {
		display: none;
	}

	.cam-zap-chips {
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		gap: 8px;
		padding-left: 12px;
		padding-right: 8px;
		width: max-content;
		min-height: 36px;
	}

	.cam-zap-chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		flex-shrink: 0;
		padding: 0 12px;
		height: 32px;
		margin: 0;
		border: none;
		border-radius: var(--radius-8);
		background: var(--white8);
		cursor: pointer;
		color: var(--white);
		font-size: 16px;
		font-weight: 650;
	}

	.cam-zap-chip:active {
		transform: scale(0.98);
	}

	.cam-zap-chip-num {
		line-height: 1;
	}

	.cam-zap-chevron {
		position: absolute;
		right: 6px;
		top: 8px;
		bottom: 8px;
		width: 32px;
		margin: 0;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: var(--radius-8);
		cursor: pointer;
		background: var(--white8);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		z-index: 2;
	}

	.cam-zap-chevron:active {
		transform: scale(0.98);
	}

	.cam-actions-row {
		display: flex;
		flex-direction: row;
		gap: 12px;
		width: 100%;
	}

	.cam-panel-icon-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		flex-shrink: 0;
	}

	.cam-panel-btn {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		gap: 10px;
		padding: 20px 8px 16px;
		margin: 0;
		border: none;
		border-radius: var(--radius-16);
		background: var(--black33);
		cursor: pointer;
		box-sizing: border-box;
	}

	.cam-panel-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.cam-panel-btn:not(:disabled):active {
		transform: scale(0.99);
	}

	.cam-panel-label {
		font-size: 14px;
		font-weight: 500;
		color: var(--white);
		text-align: center;
	}

	@media (min-width: 768px) {
		.cam-panel-label {
			font-size: 16px;
		}
	}

	.cam-share-panel {
		background: var(--black33);
		border-radius: var(--radius-16);
		overflow: hidden;
	}

	.cam-share-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 8px 8px 14px;
	}

	.cam-share-left {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 120px;
	}

	.cam-share-label {
		font-size: 0.875rem;
		color: var(--white);
		white-space: nowrap;
	}

	.cam-share-value {
		flex: 1;
		min-width: 0;
		font-size: 0.875rem;
		color: var(--white66);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-align: right;
	}

	.cam-share-copy-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 8px;
		background: var(--white8);
		cursor: pointer;
		flex-shrink: 0;
		transition: transform 0.15s ease;
	}

	.cam-share-copy-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.cam-share-copy-btn:not(:disabled):hover {
		transform: scale(1.01);
	}

	.cam-share-copy-btn:not(:disabled):active {
		transform: scale(0.97);
	}

	.cam-share-divider {
		width: 100%;
		height: 1.4px;
		background-color: var(--white11);
	}

	.cam-share-hint {
		margin: 8px 0 0 0;
		padding: 0 4px;
		font-size: 13px;
		color: var(--white33);
		text-align: center;
	}

	.cam-report-btn {
		width: 100%;
		height: 42px;
		margin: 0;
		padding: 0 20px;
		font-size: 16px;
		font-weight: 500;
		color: var(--rougeColor);
		background: var(--black33);
		border: none;
		border-radius: var(--radius-16);
		cursor: pointer;
	}

	.cam-report-btn:active {
		transform: scale(0.99);
	}

	@media (max-width: 767px) {
		.cam-report-btn {
			height: 38px;
		}
	}

	.details-modal-inner {
		padding: 8px 0 16px;
		max-height: min(70vh, 560px);
		overflow-y: auto;
		box-sizing: border-box;
	}

	.details-loading,
	.details-empty {
		margin: 16px 12px;
		font-size: 14px;
		color: var(--white33);
		text-align: center;
	}

	.cam-label-panel {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.cam-label-error {
		margin: 0;
		font-size: 13px;
		color: var(--rougeColor);
	}

	.labels-scroll-row {
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
		padding: 4px 0;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.labels-scroll-row::-webkit-scrollbar {
		display: none;
	}

	.labels-row-inner {
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		gap: 10px;
		width: max-content;
		padding: 0 4px;
	}

	.label-tap {
		margin: 0;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		flex-shrink: 0;
	}

	.label-tap:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.check-icon {
		display: flex;
		animation: popIn 0.3s ease-out;
	}

	@keyframes popIn {
		0% { transform: scale(0); }
		50% { transform: scale(1.2); }
		100% { transform: scale(1); }
	}

</style>
