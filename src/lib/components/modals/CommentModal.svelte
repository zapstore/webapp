<script lang="js">
/**
 * CommentModal - Bottom sheet for writing a comment (WYSIWYG with block-level media, emoji, insert app).
 * Camera: pick file → placeholder in editor (spinner + 33% opacity) → upload → becomes image/video.
 * Emoji and Insert (app ref) same as ForumPostModal.
 */
import { fly } from "svelte/transition";
import { cubicOut } from "svelte/easing";
import ShortTextInput from "$lib/components/common/ShortTextInput.svelte";
import EmojiPickerModal from "$lib/components/modals/EmojiPickerModal.svelte";
import InsertModal from "$lib/components/modals/InsertModal.svelte";
import { createSearchEmojisFunction } from "$lib/services/emoji-search";
import { createSearchProfilesFunction } from "$lib/services/profile-search";
import { uploadFileToNostrBuild, ACCEPTED_MEDIA_TYPES } from "$lib/services/upload-nostr-build";
let { isOpen = $bindable(false), target = null, placeholder = "Write a comment...", getCurrentPubkey = () => null, searchProfiles: searchProfilesProp = null, searchEmojis: searchEmojisProp = null, signEvent = null, onsubmit, onclose, } = $props();
const searchProfiles = $derived(searchProfilesProp ?? createSearchProfilesFunction(getCurrentPubkey));
const searchEmojis = $derived(searchEmojisProp ?? createSearchEmojisFunction(getCurrentPubkey));
let textInput = $state(null);
let submitting = $state(false);
let emojiPickerOpen = $state(false);
let insertModalOpen = $state(false);
/** @type {HTMLInputElement | null} */
let fileInputEl = $state(null);
let mediaUploading = $state(false);
function close() {
    isOpen = false;
    onclose?.();
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
function handleInsertNostrRef(/** @type {{ naddr: string; name?: string | null; iconUrl?: string | null }} */ payload) {
    textInput?.insertNostrRef?.(payload);
    textInput?.focus?.();
}
function handleCameraTap() {
    fileInputEl?.click();
}
async function handleFileChange(e) {
    const files = /** @type {HTMLInputElement} */ (e.target).files;
    if (!files?.length || !signEvent || !textInput) return;
    mediaUploading = true;
    const inputEl = /** @type {HTMLInputElement} */ (e.target);
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const type = file.type.startsWith("video") ? "video" : "image";
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
            console.error("Comment media upload failed:", err);
            textInput.deleteMediaBlock?.(id);
        }
        URL.revokeObjectURL(placeholderUrl);
    }
    mediaUploading = false;
    inputEl.value = "";
}
async function handleSubmit(event) {
    if (submitting || !event.text?.trim())
        return;
    submitting = true;
    try {
        onsubmit?.({
            text: event.text ?? "",
            emojiTags: event.emojiTags ?? [],
            mentions: event.mentions ?? [],
            mediaUrls: event.mediaUrls ?? [],
            target
        });
        textInput?.clear?.();
        close();
    }
    catch (err) {
        console.error("Failed to submit comment:", err);
    }
    finally {
        submitting = false;
    }
}
function handleKeydown(e) {
    if (e.key === "Escape")
        close();
}
$effect(() => {
    if (isOpen && textInput) {
        const t = setTimeout(() => textInput?.focus(), 100);
        return () => clearTimeout(t);
    }
    if (!isOpen) {
        emojiPickerOpen = false;
        insertModalOpen = false;
    }
});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div class="overlay" onclick={close} role="presentation"></div>

  <div
    class="comment-sheet-wrapper"
    role="dialog"
    aria-modal="true"
    aria-label="Write a comment"
  >
    <div class="comment-sheet" class:child-modal-open={emojiPickerOpen || insertModalOpen} transition:fly={{ y: 100, duration: 200, easing: cubicOut }}>
      <div class="child-overlay" aria-hidden="true"></div>
      <div class="input-container">
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
          {placeholder}
          size="medium"
          {getCurrentPubkey}
          {searchProfiles}
          {searchEmojis}
          autoFocus={true}
          showActionRow={true}
          onCameraTap={handleCameraTap}
          onEmojiTap={handleEmojiTap}
          onGifTap={() => {}}
          onAddTap={handleInsertTap}
          onChevronTap={() => {}}
          onsubmit={handleSubmit}
        />
      </div>
    </div>
  </div>
{/if}

<EmojiPickerModal
  bind:isOpen={emojiPickerOpen}
  {getCurrentPubkey}
  onSelectEmoji={handleEmojiSelect}
  onclose={() => { emojiPickerOpen = false; }}
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
    background: transparent;
  }

  .comment-sheet-wrapper {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 50;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .comment-sheet {
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

  .comment-sheet.child-modal-open {
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

  .comment-sheet.child-modal-open .child-overlay {
    opacity: 1;
  }

  @media (min-width: 768px) {
    .comment-sheet {
      max-width: 560px;
      margin-bottom: 16px;
      border-radius: 24px;
      border-bottom: 0.33px solid hsl(var(--white8));
      padding: 12px;
    }
  }

  .input-container {
    background: hsl(var(--black33));
    border-radius: var(--radius-16);
    border: 0.33px solid hsl(var(--white33));
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
