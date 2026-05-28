<script lang="js">
/**
 * CommentModal - Bottom sheet for writing a comment (WYSIWYG with block-level media, emoji, insert app).
 * Camera: pick file → placeholder in editor (spinner + 33% opacity) → upload → becomes image/video.
 * Emoji and Insert (app ref) same as ForumPostModal.
 */
import { fly } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import { browser } from '$app/environment';
import { onDestroy } from 'svelte';
import ShortTextInput from '$lib/components/common/ShortTextInput.svelte';
import CommentModalRootRow from '$lib/components/social/CommentModalRootRow.svelte';
import EmojiPickerModal from '$lib/components/modals/EmojiPickerModal.svelte';
import AddModal from '$lib/components/modals/AddModal.svelte';
import TipAmountModal from '$lib/components/modals/TipAmountModal.svelte';
import TipAmountRow from '$lib/components/social/TipAmountRow.svelte';
import ZapSliderModal from '$lib/components/modals/ZapSliderModal.svelte';
import { createSearchEmojisFunction } from '$lib/services/emoji-search';
import { createSearchProfilesFunction } from '$lib/services/profile-search';
import { uploadFileToNostrBuild, ACCEPTED_MEDIA_TYPES } from '$lib/services/upload-nostr-build';
import {
	getCommentDraft,
	saveCommentDraft,
	clearCommentDraft,
	catalogCommentDraftKey
} from '$lib/stores/comment-drafts.js';
import '$lib/styles/comment-modal-inset.css';
import * as nip19 from 'nostr-tools/nip19';

/** Label for zap/comment target when building “Write to …” placeholder. */
function recipientLabel(/** @type {{ name?: string | null, pubkey?: string | null } | null} */ tgt) {
	if (!tgt) return 'Creator';
	const n = tgt.name != null && String(tgt.name).trim() !== '' ? String(tgt.name).trim() : '';
	if (n) return n;
	const pk = tgt.pubkey;
	if (pk && String(pk).trim().length === 64) {
		try {
			const enc = nip19.npubEncode(pk);
			return `npub1${enc.slice(5, 8)}…${enc.slice(-6)}`;
		} catch {
			return pk.slice(0, 8);
		}
	}
	return 'Creator';
}

let {
	isOpen = $bindable(false),
	target = null,
	placeholder = undefined,
	recipientName = '',
	contentType = 'app',
	otherZaps = [],
	getCurrentPubkey = () => null,
	searchProfiles: searchProfilesProp = null,
	searchEmojis: searchEmojisProp = null,
	signEvent = null,
	/** Root app/stack/forum row above editor (catalog comments). */
	rootContext = null,
	version = '',
	/** Override draft key; defaults to catalog key from target + contentType. */
	draftKey: draftKeyProp = null,
	/**
	 * Hex pubkeys of participants in the comment thread this modal is for.
	 * When provided, these profiles are suggested first in @mention results.
	 * @type {string[]}
	 */
	threadPubkeys = [],
	onsubmit,
	onzapReceived,
	onZapPending,
	onZapPendingClear,
	onclose,
	/** Skip sheet enter animation when replacing ActionsModal. */
	instantOpen = false
} = $props();

const searchProfiles = $derived(
	searchProfilesProp ?? createSearchProfilesFunction(getCurrentPubkey, () => threadPubkeys)
);
const searchEmojis = $derived(searchEmojisProp ?? createSearchEmojisFunction(getCurrentPubkey));
const effectivePlaceholder = $derived(
	placeholder ?? `Write to ${recipientName?.trim() || recipientLabel(target)}`
);
const showRootRow = $derived(
	Boolean(rootContext) && ['app', 'stack', 'forum'].includes(contentType)
);
const draftKey = $derived(
	draftKeyProp ?? catalogCommentDraftKey(contentType, target)
);

let textInput = $state(null);
let submitting = $state(false);
let emojiPickerOpen = $state(false);
let insertModalOpen = $state(false);
let tipAmountModalOpen = $state(false);
let zapModalOpen = $state(false);
/** @type {number | null} */
let pendingTipSats = $state(null);
/** @type {{ amount: number, message?: string, emojiTags?: { shortcode: string, url: string }[], mentions?: string[] } | null} */
let immediateZap = $state(null);
/** @type {HTMLInputElement | null} */
let fileInputEl = $state(null);
let _mediaUploading = $state(false);
/** @type {ReturnType<typeof setTimeout> | null} */
let draftSaveTimer = null;
let draftLoadedForKey = $state(null);

function close() {
	isOpen = false;
	onclose?.();
}

function persistDraftSoon() {
	if (!draftKey || !textInput) return;
	if (draftSaveTimer) clearTimeout(draftSaveTimer);
	draftSaveTimer = setTimeout(() => {
		draftSaveTimer = null;
		if (!textInput) return;
		if (textInput.isEmpty?.()) {
			clearCommentDraft(draftKey);
			return;
		}
		const json = textInput.getEditorJson?.();
		if (json) saveCommentDraft(draftKey, json);
	}, 350);
}

function handleContentChange() {
	persistDraftSoon();
}

function handleEmojiTap() {
	emojiPickerOpen = true;
}

function handleEmojiSelect(/** @type {{ shortcode: string; url: string; source: string }} */ emoji) {
	textInput?.insertEmoji?.(emoji.shortcode, emoji.url, emoji.source);
	textInput?.focus?.();
}

function handleInsertTap() {
	insertModalOpen = true;
}

function handleInsertNostrRef(
	/** @type {{ naddr: string; name?: string | null; iconUrl?: string | null }} */ payload
) {
	textInput?.insertNostrRef?.(payload);
	textInput?.focus?.();
}

function handleCameraTap() {
	fileInputEl?.click();
}

function handleTipTap() {
	tipAmountModalOpen = true;
}

function handleTipAmountConfirm(/** @type {{ amount: number }} */ event) {
	pendingTipSats = event.amount;
}

function openTipAmountModal() {
	tipAmountModalOpen = true;
}

function handleZapClose(event) {
	zapModalOpen = false;
	immediateZap = null;
	if (event?.success) {
		onzapReceived?.({ zapReceipt: {} });
		close();
	}
}

function handleZapReceived(event) {
	onzapReceived?.(event);
}

async function handleFileChange(e) {
	const files = /** @type {HTMLInputElement} */ (e.target).files;
	if (!files?.length || !signEvent || !textInput) return;
	_mediaUploading = true;
	const inputEl = /** @type {HTMLInputElement} */ (e.target);
	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		const type = file.type.startsWith('video') ? 'video' : 'image';
		const placeholderUrl = URL.createObjectURL(file);
		const id = textInput.insertMediaBlock?.({ placeholderUrl, type });
		if (!id) {
			URL.revokeObjectURL(placeholderUrl);
			continue;
		}
		try {
			const url = await uploadFileToNostrBuild(file, signEvent);
			textInput.setMediaBlockUrl?.(id, url);
		} catch (err) {
			console.error('Comment media upload failed:', err);
			textInput.deleteMediaBlock?.(id);
		}
		URL.revokeObjectURL(placeholderUrl);
	}
	_mediaUploading = false;
	inputEl.value = '';
	persistDraftSoon();
}

async function handleSubmit(event) {
	if (submitting) return;
	const hasText = Boolean(event.text?.trim());
	const hasTip = pendingTipSats != null && pendingTipSats >= 1;
	if (!hasText && !hasTip) return;
	submitting = true;
	try {
		if (hasTip) {
			immediateZap = {
				amount: pendingTipSats,
				message: event.text ?? '',
				emojiTags: event.emojiTags ?? [],
				mentions: event.mentions ?? []
			};
			pendingTipSats = null;
			if (draftKey) clearCommentDraft(draftKey);
			textInput?.clear?.();
			zapModalOpen = true;
			return;
		}
		onsubmit?.({
			text: event.text ?? '',
			emojiTags: event.emojiTags ?? [],
			mentions: event.mentions ?? [],
			mediaUrls: event.mediaUrls ?? [],
			target
		});
		if (draftKey) clearCommentDraft(draftKey);
		textInput?.clear?.();
		close();
	} catch (err) {
		console.error('Failed to submit comment:', err);
	} finally {
		submitting = false;
	}
}

function handleKeydown(e) {
	if (e.key === 'Escape') close();
}

function applyBodyScrollLock() {
	if (!browser) return;
	const scrollY = window.scrollY;
	document.body.style.position = 'fixed';
	document.body.style.top = `-${scrollY}px`;
	document.body.style.left = '0';
	document.body.style.right = '0';
	document.body.style.overflow = 'hidden';
	document.body.dataset.commentModalScrollY = String(scrollY);
}

function releaseBodyScrollLock() {
	if (!browser) return;
	const scrollY = document.body.dataset.commentModalScrollY || '0';
	document.body.style.position = '';
	document.body.style.top = '';
	document.body.style.left = '';
	document.body.style.right = '';
	document.body.style.overflow = '';
	delete document.body.dataset.commentModalScrollY;
	window.scrollTo(0, parseInt(scrollY, 10));
}

$effect(() => {
	if (browser) {
		if (isOpen) applyBodyScrollLock();
		else releaseBodyScrollLock();
	}
});

onDestroy(() => {
	if (browser && document.body.dataset.commentModalScrollY !== undefined) {
		releaseBodyScrollLock();
	}
});

$effect(() => {
	if (isOpen && textInput) {
		const t = setTimeout(() => textInput?.focus(), 100);
		return () => clearTimeout(t);
	}
	if (!isOpen) {
		emojiPickerOpen = false;
		insertModalOpen = false;
		tipAmountModalOpen = false;
		zapModalOpen = false;
		pendingTipSats = null;
		immediateZap = null;
		draftLoadedForKey = null;
	}
});

$effect(() => {
	if (!isOpen || !textInput || !draftKey) return;
	if (draftLoadedForKey === draftKey) return;
	draftLoadedForKey = draftKey;
	const draft = getCommentDraft(draftKey);
	if (draft?.json) {
		textInput.setEditorJson?.(draft.json);
	}
});

const childModalOpen = $derived(
	emojiPickerOpen || insertModalOpen || tipAmountModalOpen || zapModalOpen
);
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<div class="overlay bg-overlay" onclick={close} role="presentation"></div>

	<div
		class="comment-sheet-wrapper"
		role="dialog"
		aria-modal="true"
		aria-label="Write a comment"
	>
		<div
			class="comment-sheet"
			class:child-modal-open={childModalOpen}
			transition:fly={{
				y: instantOpen ? 0 : 100,
				duration: instantOpen ? 0 : 200,
				easing: cubicOut
			}}
		>
			<div class="child-overlay" aria-hidden="true"></div>
			<div class="comment-compose-column">
				{#if showRootRow}
					<CommentModalRootRow {rootContext} {version} showConnector={true} />
				{/if}
				<div class="input-container">
				{#if pendingTipSats}
					<TipAmountRow amountSats={pendingTipSats} onedit={openTipAmountModal} />
				{/if}
				<input
					type="file"
					accept={ACCEPTED_MEDIA_TYPES}
					multiple
					class="comment-file-input"
					bind:this={fileInputEl}
					onchange={handleFileChange}
					aria-hidden="true"
					tabindex="-1"
				/>
				<ShortTextInput
					bind:this={textInput}
					placeholder={effectivePlaceholder}
					size="medium"
					{getCurrentPubkey}
					{searchProfiles}
					{searchEmojis}
					autoFocus={true}
					showActionRow={true}
					hideTipButton={false}
					allowEmptySubmit={pendingTipSats != null && pendingTipSats >= 1}
					onTipTap={handleTipTap}
					onCameraTap={handleCameraTap}
					onEmojiTap={handleEmojiTap}
					onGifTap={() => {}}
					onAddTap={handleInsertTap}
					onChevronTap={() => {}}
					onchange={handleContentChange}
					onsubmit={handleSubmit}
				/>
			</div>
			</div>
		</div>
	</div>
{/if}

<EmojiPickerModal
	bind:isOpen={emojiPickerOpen}
	{getCurrentPubkey}
	onSelectEmoji={handleEmojiSelect}
	onclose={() => {
		emojiPickerOpen = false;
	}}
/>

<AddModal
	title="Add App"
	bind:isOpen={insertModalOpen}
	{getCurrentPubkey}
	nestedModal={true}
	lockBodyScroll={false}
	zIndex={110}
	onAdd={handleInsertNostrRef}
	onclose={() => {
		insertModalOpen = false;
	}}
/>

<TipAmountModal
	bind:isOpen={tipAmountModalOpen}
	{target}
	publisherName={recipientName?.trim() || recipientLabel(target)}
	{contentType}
	{otherZaps}
	presetAmount={pendingTipSats}
	nestedModal={true}
	lockBodyScroll={false}
	zIndex={110}
	onconfirm={handleTipAmountConfirm}
/>

<ZapSliderModal
	bind:isOpen={zapModalOpen}
	{target}
	publisherName={recipientName?.trim() || recipientLabel(target)}
	{contentType}
	{otherZaps}
	{immediateZap}
	onImmediateZapClear={() => {
		immediateZap = null;
	}}
	nestedModal={true}
	lockBodyScroll={false}
	zIndex={110}
	{searchProfiles}
	{searchEmojis}
	onclose={handleZapClose}
	onzapReceived={handleZapReceived}
	{onZapPending}
	{onZapPendingClear}
/>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 99;
	}

	.comment-sheet-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 100;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.comment-sheet {
		width: 100%;
		max-width: 100%;
		margin: 0;
		background: var(--gray66);
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid var(--white8);
		border-bottom: none;
		padding: var(--comment-modal-inset) var(--comment-modal-inset) var(--comment-modal-bottom-inset);
		pointer-events: auto;
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		position: relative;
		transition: transform 0.25s cubic-bezier(0.33, 1, 0.68, 1);
		transform-origin: top center;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.comment-compose-column {
		display: flex;
		flex-direction: column;
		gap: 0;
		min-width: 0;
		width: 100%;
	}

	.comment-sheet.child-modal-open {
		transform: scale(0.96) translateY(8px);
	}

	.child-overlay {
		position: absolute;
		inset: 0;
		background: var(--black33);
		z-index: 10;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.2s ease-out;
		border-radius: inherit;
	}

	.comment-sheet.child-modal-open .child-overlay {
		opacity: 1;
	}

	@media (min-width: 768px) {
		.comment-sheet {
			max-width: 560px;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid var(--white8);
		}
	}

	.input-container {
		background: var(--black33);
		border-radius: var(--radius-16);
		border: 0.33px solid var(--white33);
		width: 100%;
	}

	.comment-file-input {
		position: absolute;
		width: 0;
		height: 0;
		opacity: 0;
		pointer-events: none;
	}
</style>
