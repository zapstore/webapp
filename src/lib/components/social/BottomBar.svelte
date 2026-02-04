<script lang="ts">
  /**
   * BottomBar - Fixed bottom action bar for detail pages.
   * Owns CommentModal and ZapSliderModal so the bar can slide out when either is open (website-identical).
   */
  import { Zap, Reply, Options } from "$lib/components/icons";
  import InputButton from "$lib/components/common/InputButton.svelte";
  import ZapSliderModal from "$lib/components/modals/ZapSliderModal.svelte";
  import CommentModal from "$lib/components/modals/CommentModal.svelte";

  type ProfileHit = { pubkey: string; name?: string; displayName?: string; picture?: string };
  type EmojiHit = { shortcode: string; url: string; source: string };

  interface ZapTarget {
    name?: string;
    pubkey?: string;
    dTag?: string;
    id?: string;
    pictureUrl?: string;
  }

  interface OtherZap {
    amount: number;
    profile?: { pictureUrl?: string; name?: string; pubkey?: string };
  }

  interface Props {
    appName?: string;
    publisherName?: string;
    contentType?: "app" | "stack";
    className?: string;
    zapTarget?: ZapTarget | null;
    otherZaps?: OtherZap[];
    searchProfiles?: (query: string) => Promise<ProfileHit[]>;
    searchEmojis?: (query: string) => Promise<EmojiHit[]>;
    oncommentSubmit?: (event: {
      text: string;
      emojiTags: { shortcode: string; url: string }[];
      mentions: string[];
      target: ZapTarget | null;
    }) => void;
    onzapReceived?: (event: { zapReceipt: unknown }) => void;
    onoptions?: () => void;
  }

  let {
    appName = "",
    publisherName = "",
    contentType = "app",
    className = "",
    zapTarget = null,
    otherZaps = [],
    searchProfiles = async () => [],
    searchEmojis = async () => [],
    oncommentSubmit,
    onzapReceived,
    onoptions,
  }: Props = $props();

  let zapModalOpen = $state(false);
  let commentModalOpen = $state(false);

  const modalOpen = $derived(zapModalOpen || commentModalOpen);

  function handleZap() {
    zapModalOpen = true;
  }

  function handleZapClose(event: { success: boolean }) {
    zapModalOpen = false;
    if (event.success) {
      onzapReceived?.({ zapReceipt: {} });
    }
  }

  function handleZapReceived(event: { zapReceipt: unknown }) {
    onzapReceived?.(event);
  }

  function handleComment() {
    commentModalOpen = true;
  }

  function handleCommentClose() {
    commentModalOpen = false;
  }

  function handleCommentSubmit(event: {
    text: string;
    emojiTags: { shortcode: string; url: string }[];
    mentions: string[];
    target: ZapTarget | null;
  }) {
    oncommentSubmit?.(event);
  }

  function handleOptions() {
    onoptions?.();
  }
</script>

<div class="bottom-bar-wrapper {className}" class:modal-open={modalOpen}>
  <div class="bottom-bar">
    <div class="bottom-bar-content">
      <button type="button" class="btn-primary-large zap-button" onclick={handleZap}>
        <Zap variant="fill" size={18} color="hsl(var(--whiteEnforced))" />
        <span>Zap</span>
      </button>

      <InputButton placeholder="Comment" onclick={handleComment}>
        {#snippet icon()}
          <Reply variant="outline" size={18} strokeWidth={1.4} color="hsl(var(--white33))" />
        {/snippet}
      </InputButton>

      <button
        type="button"
        class="btn-secondary-large btn-secondary-dark options-button"
        onclick={handleOptions}
      >
        <Options variant="fill" size={20} color="hsl(var(--white33))" />
      </button>
    </div>
  </div>
</div>

<ZapSliderModal
  bind:isOpen={zapModalOpen}
  target={zapTarget}
  publisherName={publisherName}
  {otherZaps}
  {searchProfiles}
  {searchEmojis}
  onclose={handleZapClose}
  onzapReceived={handleZapReceived}
/>

<CommentModal
  bind:isOpen={commentModalOpen}
  target={zapTarget}
  placeholder="Comment on {zapTarget?.name ?? 'this'}"
  {searchProfiles}
  {searchEmojis}
  onclose={handleCommentClose}
  onsubmit={handleCommentSubmit}
/>

<style>
  .bottom-bar-wrapper {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 40;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .bottom-bar {
    width: 100%;
    max-width: 100%;
    margin: 0;
    background: hsl(var(--gray66));
    border-radius: var(--radius-32) var(--radius-32) 0 0;
    border: 0.33px solid hsl(var(--white8));
    border-bottom: none;
    padding: 16px 6px 16px 16px;
    pointer-events: auto;
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    transition: transform 0.2s cubic-bezier(0.33, 1, 0.68, 1), opacity 0.2s ease;
  }

  /* Slide out when either modal is open (website-identical) */
  .modal-open .bottom-bar {
    transform: translateY(100%);
    opacity: 0;
    pointer-events: none;
  }

  .bottom-bar-content {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .zap-button {
    gap: 8px;
    padding: 0 20px 0 14px;
    flex-shrink: 0;
  }

  .options-button {
    width: 42px;
    padding: 0;
    flex-shrink: 0;
    background: transparent !important;
    border: none !important;
    margin-left: -12px;
  }

  .options-button :global(svg) {
    width: 24px;
    height: 24px;
  }

  @media (max-width: 767px) {
    .options-button {
      width: 38px;
    }

    .zap-button span {
      font-size: 14px;
    }
  }

  @media (min-width: 768px) {
    .bottom-bar {
      max-width: 560px;
      margin-bottom: 16px;
      border-radius: 24px;
      border-bottom: 0.33px solid hsl(var(--white8));
      padding: 12px 2px 12px 12px;
      box-shadow: 0 16px 120px 40px hsl(var(--black));
    }
  }
</style>
