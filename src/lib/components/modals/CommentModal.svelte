<script lang="js">
/**
 * CommentModal - Bottom sheet for writing a comment with TipTap (mentions + emojis).
 * Pass getCurrentPubkey so custom emoji packs (kind 10030, 30030) and profile lists (kind 3, 30000) load from Dexie.
 */
import { fly } from "svelte/transition";
import { cubicOut } from "svelte/easing";
import ShortTextInput from "$lib/components/common/ShortTextInput.svelte";
import { createSearchEmojisFunction } from "$lib/services/emoji-search";
import { createSearchProfilesFunction } from "$lib/services/profile-search";
let { isOpen = $bindable(false), target = null, placeholder = "Write a comment...", getCurrentPubkey = () => null, searchProfiles: searchProfilesProp = null, searchEmojis: searchEmojisProp = null, onsubmit, onclose, } = $props();
const searchProfiles = $derived(searchProfilesProp ?? createSearchProfilesFunction(getCurrentPubkey));
const searchEmojis = $derived(searchEmojisProp ?? createSearchEmojisFunction(getCurrentPubkey));
let textInput = $state(null);
let submitting = $state(false);
function close() {
    isOpen = false;
    onclose?.();
}
async function handleSubmit(event) {
    if (submitting || !event.text.trim())
        return;
    submitting = true;
    try {
        onsubmit?.({ text: event.text, emojiTags: event.emojiTags ?? [], mentions: event.mentions, target });
        textInput?.clear();
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
});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" onclick={close} role="presentation"></div>

  <div
    class="comment-sheet-wrapper"
    role="dialog"
    aria-modal="true"
    aria-label="Write a comment"
  >
    <div class="comment-sheet" transition:fly={{ y: 100, duration: 200, easing: cubicOut }}>
      <div class="input-container">
        <ShortTextInput
          bind:this={textInput}
          {placeholder}
          size="medium"
          {searchProfiles}
          {searchEmojis}
          autoFocus={true}
          showActionRow={true}
          onCameraTap={() => {}}
          onEmojiTap={() => {}}
          onGifTap={() => {}}
          onAddTap={() => {}}
          onChevronTap={() => {}}
          onsubmit={handleSubmit}
        />
      </div>
    </div>
  </div>
{/if}

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
</style>
