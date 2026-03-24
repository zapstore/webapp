<script lang="js">
/**
 * ForumPostModal - Bottom sheet for creating a new forum post.
 * Title input + rich content editor (WYSIWYG) with block-level media like custom emoji.
 * Camera: pick file → placeholder appears in editor (spinner + 33% opacity) → upload → placeholder becomes image/video.
 */
import { fly, fade } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import ShortTextInput from '$lib/components/common/ShortTextInput.svelte';
import EmojiPickerModal from '$lib/components/modals/EmojiPickerModal.svelte';
import ForumPostLabelsModal from '$lib/components/modals/ForumPostLabelsModal.svelte';
import InsertModal from '$lib/components/modals/InsertModal.svelte';
import { Camera, EmojiFill, Plus } from '$lib/components/icons';
import { createSearchEmojisFunction } from '$lib/services/emoji-search';
import { createSearchProfilesFunction } from '$lib/services/profile-search';
import { uploadFileToNostrBuild, ACCEPTED_MEDIA_TYPES } from '$lib/services/upload-nostr-build';
import { FORUM_CATEGORIES } from '$lib/config.js';

let {
	isOpen = $bindable(false),
	communityName = '',
	getCurrentPubkey = () => null,
	searchProfiles: searchProfilesProp = null,
	searchEmojis: searchEmojisProp = null,
	/** NIP-07 signEvent — required for media upload */
	signEvent = null,
	onsubmit,
	onclose
} = $props();

const searchProfiles = $derived(searchProfilesProp ?? createSearchProfilesFunction(/** @type {any} */ (getCurrentPubkey)));
const searchEmojis = $derived(searchEmojisProp ?? createSearchEmojisFunction(/** @type {any} */ (getCurrentPubkey)));

let titleValue = $state('');
/** @type {import('$lib/components/common/ShortTextInput.svelte').default | null} */
let contentInput = $state(null);
/** @type {HTMLInputElement | null} */
let titleInput = $state(null);
let submitting = $state(false);
let error = $state('');
let emojiPickerOpen = $state(false);
let labelsModalOpen = $state(false);
let insertModalOpen = $state(false);
/** @type {string[]} */
let selectedLabels = $state([]);
/** @type {HTMLInputElement | null} */
let fileInputEl = $state(null);
let mediaUploading = $state(false);

function handleEmojiTap() {
	emojiPickerOpen = true;
}

function handleEmojiSelect(/** @type {{ shortcode: string; url: string; source: string }} */ emoji) {
	contentInput?.insertEmoji?.(emoji.shortcode, emoji.url, emoji.source);
	contentInput?.focus?.();
}

function close() {
	isOpen = false;
	onclose?.();
}

function handleKeydown(/** @type {KeyboardEvent} */ e) {
	if (e.key === 'Escape') close();
}

function handleLabelsTap() {
	labelsModalOpen = true;
}

function handleInsertTap() {
	insertModalOpen = true;
}

function handleInsertNostrRef(/** @type {{ naddr: string; name?: string | null; iconUrl?: string | null }} */ payload) {
	contentInput?.insertNostrRef?.(payload);
	contentInput?.focus?.();
}

function handleCameraTap() {
	fileInputEl?.click();
}

async function handleFileChange(e) {
	const files = /** @type {HTMLInputElement} */ (e.target).files;
	if (!files?.length || !signEvent || !contentInput) return;
	mediaUploading = true;
	error = '';
	const inputEl = /** @type {HTMLInputElement} */ (e.target);
	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		const type = file.type.startsWith('video') ? 'video' : 'image';
		const placeholderUrl = URL.createObjectURL(file);
		const id = contentInput.insertMediaBlock?.({ placeholderUrl, type });
		if (!id) {
			URL.revokeObjectURL(placeholderUrl);
			continue;
		}
		try {
			const url = await uploadFileToNostrBuild(file, signEvent);
			contentInput.setMediaBlockUrl?.(id, url);
		} catch (err) {
			console.error('Media upload failed:', err);
			contentInput.deleteMediaBlock?.(id);
			error = /** @type {Error} */ (err)?.message ?? 'Upload failed';
		}
		URL.revokeObjectURL(placeholderUrl);
	}
	mediaUploading = false;
	inputEl.value = '';
}

async function handlePublish() {
	if (!titleValue.trim() || submitting) return;
	submitting = true;
	error = '';
	try {
		const serialized = contentInput?.getSerializedContent?.() ?? { text: '', emojiTags: [], mentions: [], mediaUrls: [] };
		await onsubmit?.({
			title: titleValue.trim(),
			text: serialized.text ?? '',
			emojiTags: serialized.emojiTags ?? [],
			mentions: serialized.mentions ?? [],
			labels: selectedLabels,
			mediaUrls: serialized.mediaUrls ?? []
		});
		titleValue = '';
		contentInput?.clear?.();
		selectedLabels = [];
		close();
	} catch (err) {
		console.error('Failed to submit forum post:', err);
		error = /** @type {any} */ (err)?.message || 'Failed to publish';
	} finally {
		submitting = false;
	}
}

$effect(() => {
	if (isOpen) {
		const t = setTimeout(() => titleInput?.focus(), 80);
		return () => clearTimeout(t);
	} else {
		titleValue = '';
		error = '';
		submitting = false;
		emojiPickerOpen = false;
		labelsModalOpen = false;
		insertModalOpen = false;
		selectedLabels = [];
	}
});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay bg-overlay" onclick={close} role="presentation" transition:fade={{ duration: 180 }}></div>

	<div class="post-sheet-wrapper" role="dialog" aria-modal="true" aria-label="New post">
		<div class="post-sheet" class:child-modal-open={emojiPickerOpen || labelsModalOpen || insertModalOpen} transition:fly={{ y: 100, duration: 200, easing: cubicOut }}>
			<div class="child-overlay" aria-hidden="true"></div>
			<div class="post-form-box">
				<input
					type="text"
					class="post-title-input"
					placeholder="Title of Forum Post"
					bind:value={titleValue}
					bind:this={titleInput}
					disabled={submitting}
					aria-label="Post title"
					onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); contentInput?.focus?.(); } }}
				/>
				<div class="post-form-divider"></div>
				<div class="post-content-area">
					<ShortTextInput
						bind:this={contentInput}
						placeholder="Write something{communityName ? ` in ${communityName}` : ''}"
						size="large"
						{getCurrentPubkey}
						{searchProfiles}
						{searchEmojis}
						showActionRow={false}
						onchange={undefined}
						onsubmit={undefined}
						onClose={undefined}
						aboveEditor={undefined}
					/>
				</div>
				<input
					type="file"
					accept={ACCEPTED_MEDIA_TYPES}
					multiple
					class="post-file-input"
					bind:this={fileInputEl}
					onchange={handleFileChange}
					aria-hidden="true"
					tabindex="-1"
				/>
				<div class="post-action-row">
				<div class="action-buttons-left">
					<button
						type="button"
						class="action-btn"
						aria-label="Add photo or video"
						onclick={handleCameraTap}
						disabled={!signEvent || mediaUploading}
					>
						<Camera variant="fill" color="hsl(var(--white33))" size={20} />
					</button>
				<button type="button" class="action-btn" aria-label="Add emoji" onclick={handleEmojiTap}>
					<EmojiFill variant="fill" color="hsl(var(--white33))" size={18} />
				</button>
				<button type="button" class="action-btn" aria-label="Insert app or link" onclick={handleInsertTap}>
						<Plus variant="outline" color="hsl(var(--white33))" size={16} strokeWidth={2.8} />
					</button>
					<button
						type="button"
						class="labels-trigger"
						class:has-labels={selectedLabels.length > 0}
						onclick={handleLabelsTap}
						aria-label="Add labels"
					>
						<span class="labels-trigger-body">
							<span class="trigger-count">{selectedLabels.length}</span>
							<span class="trigger-text">Label{selectedLabels.length === 1 ? '' : 's'}</span>
						</span>
						<!-- Triangle tip matching the label shape, same intrinsic size (no horizontal squish) -->
						<svg class="labels-trigger-tip" width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
							<path d="M0 0 L4 0 Q9 2 14 6 Q19 10 23 14 Q23.5 16 23 18 Q19 22 14 26 Q9 30 4 32 L0 32 Z" fill="var(--trigger-bg)" />
						</svg>
					</button>
				</div>
				<button
					type="button"
					class="next-btn"
					onclick={handlePublish}
					disabled={!titleValue.trim() || submitting}
				>
					{submitting ? 'Publishing…' : 'Publish'}
				</button>
				</div>
			</div>
			{#if error}
				<p class="error-text">{error}</p>
			{/if}
		</div>
	</div>
{/if}

<EmojiPickerModal
	bind:isOpen={emojiPickerOpen}
	{getCurrentPubkey}
	onSelectEmoji={handleEmojiSelect}
	onclose={() => { emojiPickerOpen = false; }}
/>

<ForumPostLabelsModal
	bind:isOpen={labelsModalOpen}
	bind:selectedLabels
	suggestions={FORUM_CATEGORIES}
	onclose={() => { labelsModalOpen = false; }}
/>

<InsertModal
	title="Insert"
	bind:isOpen={insertModalOpen}
	{getCurrentPubkey}
	onInsert={handleInsertNostrRef}
	onclose={() => { insertModalOpen = false; }}
/>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 49;
	}

	.bg-overlay {
		background: hsl(var(--black) / 0.65);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
	}

	.post-sheet-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 50;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.post-sheet {
		width: 100%;
		max-width: 100%;
		margin: 0;
		background: hsl(var(--gray66));
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid hsl(var(--white8));
		border-bottom: none;
		padding: 16px;
		pointer-events: auto;
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		position: relative;
		transition: transform 0.25s cubic-bezier(0.33, 1, 0.68, 1);
		transform-origin: top center;
	}

	.post-sheet.child-modal-open {
		transform: scale(0.96) translateY(8px);
	}

	.child-overlay {
		position: absolute;
		inset: 0;
		background: hsl(var(--black33));
		z-index: 10;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.2s ease-out;
		border-radius: inherit;
	}

	.post-sheet.child-modal-open .child-overlay {
		opacity: 1;
	}

	@media (min-width: 768px) {
		.post-sheet {
			max-width: 560px;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid hsl(var(--white8));
			padding: 12px;
		}
	}

	.post-form-box {
		display: flex;
		flex-direction: column;
		background-color: hsl(var(--black33));
		border: 0.33px solid hsl(var(--white33));
		border-radius: var(--radius-16);
		overflow: hidden;
	}

	.post-title-input {
		width: 100%;
		padding: 10px 12px;
		background: transparent;
		border: none;
		outline: none;
		color: hsl(var(--white));
		font-family: 'Inter', sans-serif;
		font-size: 18px;
		font-weight: 600;
		box-sizing: border-box;
	}

	.post-title-input::placeholder {
		color: hsl(var(--white33));
		font-weight: 500;
	}

	.post-title-input:disabled {
		opacity: 0.6;
	}

	.post-form-divider {
		width: 100%;
		height: 1.4px;
		background-color: hsl(var(--white8));
		flex-shrink: 0;
	}

	.post-content-area {
		min-height: 200px;
	}

	.post-file-input {
		position: absolute;
		width: 0;
		height: 0;
		opacity: 0;
		pointer-events: none;
	}

	.post-action-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 12px 12px 12px;
		gap: 8px;
	}

	.action-buttons-left {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.action-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--white8));
		border: none;
		border-radius: 8px;
		cursor: pointer;
	}

	.action-btn:active {
		transform: scale(0.97);
	}

	.next-btn {
		height: 32px;
		padding: 0 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--gradient-blurple);
		border: none;
		border-radius: 8px;
		color: white;
		font-size: 15px;
		font-weight: 500;
		cursor: pointer;
		flex-shrink: 0;
		transition: opacity 0.15s ease, transform 0.15s ease;
	}

	.next-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.next-btn:active:not(:disabled) {
		transform: scale(0.97);
	}

	.error-text {
		margin: 8px 0 0;
		font-size: 13px;
		color: hsl(var(--destructive));
		padding: 0 4px;
	}

	/* Labels trigger — label-shaped button in the action row */
	.labels-trigger {
		display: inline-flex;
		align-items: center;
		height: 32px;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		flex-shrink: 0;
		--trigger-bg: hsl(var(--white8));
		transition: opacity 0.15s ease;
	}

	.labels-trigger.has-labels {
		--trigger-bg: hsl(var(--white16));
	}

	.labels-trigger:active {
		opacity: 0.75;
	}

	.labels-trigger-body {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 32px;
		padding: 0 4px 0 10px;
		background: var(--trigger-bg);
		border-radius: 8px 0 0 8px;
		white-space: nowrap;
		transition: background 0.15s ease;
	}

	.trigger-count {
		font-size: 15px;
		font-weight: 600;
		color: hsl(var(--white16));
		transition: color 0.15s ease;
	}

	.labels-trigger.has-labels .trigger-count {
		color: hsl(var(--white66));
	}

	.trigger-text {
		font-size: 15px;
		font-weight: 500;
		color: hsl(var(--white33));
		transition: color 0.15s ease;
	}

	.labels-trigger.has-labels .trigger-text {
		color: hsl(var(--white));
	}

	.labels-trigger-tip {
		flex-shrink: 0;
		display: block; /* remove inline baseline gap so tip connects flush to body */
	}
</style>
