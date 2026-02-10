<script lang="ts">
  /**
   * RootComment - Wraps a MessageBubble with reply indicator.
   * Thread modal supports Zap (root comment author) and Comment (reply) when logged in.
   */
  import MessageBubble from "./MessageBubble.svelte";
  import ThreadComment from "./ThreadComment.svelte";
  import ZapBubble from "./ZapBubble.svelte";
  import ThreadZap from "./ThreadZap.svelte";
  import QuotedMessage from "./QuotedMessage.svelte";
  import CommentActionsModal from "./CommentActionsModal.svelte";
  import ShortTextRenderer from "$lib/components/common/ShortTextRenderer.svelte";
  import ProfilePicStack from "$lib/components/common/ProfilePicStack.svelte";
  import Modal from "$lib/components/common/Modal.svelte";
  import InputButton from "$lib/components/common/InputButton.svelte";
  import ShortTextInput from "$lib/components/common/ShortTextInput.svelte";
  import ZapSliderModal from "$lib/components/modals/ZapSliderModal.svelte";
  import { Zap, Reply, Options } from "$lib/components/icons";
  import { getIsSignedIn } from "$lib/stores/auth.svelte";

  interface ReplyComment {
    id: string;
    pubkey: string;
    parentId?: string | null;
    avatarUrl?: string | null;
    displayName?: string;
    createdAt?: number;
    profileUrl?: string;
    profileLoading?: boolean;
    content?: string;
    contentHtml?: string;
    emojiTags?: { shortcode: string; url: string }[];
  }

  interface Props {
    pictureUrl?: string | null;
    name?: string;
    pubkey?: string | null;
    timestamp?: number | string | Date | null;
    profileUrl?: string;
    loading?: boolean;
    /** Show publishing spinner next to bubble */
    pending?: boolean;
    replies?: ReplyComment[];
    /** Full thread (root + all descendants) chronological; when set, feed uses this and shows QuotedMessage for replies */
    threadComments?: ReplyComment[];
    authorPubkey?: string | null;
    className?: string;
    /** Plain text content (rendered via ShortTextRenderer) */
    content?: string;
    /** Custom emoji for ShortTextRenderer */
    emojiTags?: { shortcode: string; url: string }[];
    /** Resolve pubkey to display name for @mentions */
    resolveMentionLabel?: (pubkey: string) => string | undefined;
    appIconUrl?: string | null;
    appName?: string;
    appIdentifier?: string | null;
    version?: string;
    children?: import("svelte").Snippet;
    /** Root comment event id (for reply parent and zap e-tag) */
    id?: string | null;
    /** When true, root is a zap: show ZapBubble and pass rootPubkey on reply so zapper gets p-tagged */
    isZapRoot?: boolean;
    /** Zap amount (sats) when isZapRoot */
    zapAmount?: number;
    searchProfiles?: (query: string) => Promise<{ pubkey: string; name?: string; displayName?: string; picture?: string }[]>;
    searchEmojis?: (query: string) => Promise<{ shortcode: string; url: string; source: string }[]>;
    onReplySubmit?: (event: { text: string; emojiTags: { shortcode: string; url: string }[]; mentions: string[]; parentId: string; rootPubkey?: string; parentKind?: number }) => void;
    onZapReceived?: (event: { zapReceipt: unknown }) => void;
    /** When guest taps "Get started to comment" in thread bar (opens onboarding). */
    onGetStarted?: () => void;
  }

  let {
    pictureUrl = null,
    name = "",
    pubkey = null,
    timestamp = null,
    profileUrl = "",
    loading = false,
    pending = false,
    replies = [],
    threadComments = [],
    authorPubkey = null,
    className = "",
    content = "",
    emojiTags = [],
    resolveMentionLabel,
    appIconUrl = null,
    appName = "",
    appIdentifier = null,
    version = "",
    children,
    id = null,
    isZapRoot = false,
    zapAmount = 0,
    searchProfiles = async () => [],
    searchEmojis = async () => [],
    onReplySubmit,
    onZapReceived,
    onGetStarted,
  }: Props = $props();

  let modalOpen = $state(false);
  let zapModalOpen = $state(false);
  let commentExpanded = $state(false);
  /** When set, we're replying to this comment (show QuotedMessage above input) */
  let replyingToComment = $state<ReplyComment | null>(null);
  /** When set, Zap modal targets this comment instead of the root */
  let zapTargetOverride = $state<{ name?: string; pubkey: string; id?: string; pictureUrl?: string } | null>(null);
  let replyInput = $state<{ clear?: () => void; focus?: () => void } | null>(null);
  let submitting = $state(false);
  /** Which comment the actions modal is for: 'root' or a reply */
  let actionsModalTarget = $state<"root" | ReplyComment | null>(null);
  let actionsModalOpen = $state(false);

  /** True when any modal is open on top of the thread (Zap or Comment/Zap options) – drives overlay + scale animation */
  const childModalOpen = $derived(zapModalOpen || actionsModalOpen);

  // Get unique repliers (by pubkey), prioritizing the app author. For zap root use threadComments.
  const uniqueRepliers = $derived.by(() => {
    const source = isZapRoot ? threadComments : replies;
    const seen = new Set<string>();
    const repliers = source.filter((reply) => {
      if (seen.has(reply.pubkey)) return false;
      seen.add(reply.pubkey);
      return true;
    });

    if (authorPubkey) {
      repliers.sort((a, b) => {
        if (a.pubkey === authorPubkey) return -1;
        if (b.pubkey === authorPubkey) return 1;
        return 0;
      });
    }

    return repliers;
  });

  const hasReplies = $derived(uniqueRepliers.length > 0);
  const featuredReplier = $derived(uniqueRepliers[0]);
  const otherRepliersCount = $derived(uniqueRepliers.length - 1);
  const displayedRepliers = $derived(uniqueRepliers.slice(0, 3));

  const sortedReplies = $derived(
    [...replies].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeA - timeB;
    })
  );

  /** Chronological feed entries for the thread modal: when threadComments is set, use it (excluding root); else use sortedReplies */
  const feedReplies = $derived.by(() => {
    if (threadComments.length === 0) return sortedReplies;
    return threadComments
      .filter((c) => c.id !== id)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  });

  const threadById = $derived.by(() => {
    const map = new Map<string, ReplyComment>();
    for (const c of threadComments) {
      map.set(c.id, c);
    }
    return map;
  });

  function getContentPreview(comment: ReplyComment): string {
    if (comment.content && comment.content.trim()) return comment.content;
    if (comment.contentHtml) {
      return comment.contentHtml.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    }
    return "";
  }

  /** Zap target: root comment author; id ties zap to this comment event */
  const rootZapTarget = $derived(
    pubkey
      ? {
          name: name || undefined,
          pubkey,
          id: id ?? undefined,
          pictureUrl: pictureUrl ?? undefined,
        }
      : null
  );
  /** Active zap target (override when Zap chosen from a reply's menu) */
  const zapTarget = $derived(zapTargetOverride ?? rootZapTarget);

  /** Show Zap + Comment (or "Get started to comment" for guests) in thread modal when we have handlers and a root id. */
  const showThreadActions = $derived(
    (onReplySubmit != null || onZapReceived != null || onGetStarted != null) && (id != null || pubkey != null)
  );

  function openActionsModal(target: "root" | ReplyComment) {
    actionsModalTarget = target;
    actionsModalOpen = true;
  }

  function onBubbleClick(e: MouseEvent, target: "root" | ReplyComment) {
    if (!showThreadActions) return;
    const t = e.target as Node;
    if (t instanceof Element && t.closest("a, button, input, [contenteditable='true']")) return;
    e.preventDefault();
    e.stopPropagation();
    openActionsModal(target);
  }

  function actionsModalOnComment() {
    if (actionsModalTarget === "root") handleReply();
    else if (actionsModalTarget) openReplyToComment(actionsModalTarget);
  }

  function actionsModalOnZap() {
    if (actionsModalTarget === "root") handleZap();
    else if (actionsModalTarget) handleZapComment(actionsModalTarget);
  }

  function openThread() {
    modalOpen = true;
  }

  function handleZap() {
    zapModalOpen = true;
  }

  function handleReply() {
    replyingToComment = null;
    commentExpanded = true;
  }

  function openReplyToComment(comment: ReplyComment) {
    replyingToComment = comment;
    commentExpanded = true;
  }

  function closeReply() {
    commentExpanded = false;
    replyingToComment = null;
  }

  function handleZapComment(comment: ReplyComment) {
    zapTargetOverride = {
      name: comment.displayName || undefined,
      pubkey: comment.pubkey,
      id: comment.id,
      pictureUrl: comment.avatarUrl ?? undefined,
    };
    zapModalOpen = true;
  }

  function handleZapClose(event: { success: boolean }) {
    zapModalOpen = false;
    zapTargetOverride = null;
    if (event.success) onZapReceived?.({ zapReceipt: {} });
  }

  async function handleReplySubmit(event: {
    text: string;
    emojiTags: { shortcode: string; url: string }[];
    mentions: string[];
  }) {
    if (submitting || !id) return;
    const parentId = replyingToComment ? replyingToComment.id : id;
    submitting = true;
    try {
      onReplySubmit?.({
        ...event,
        parentId,
        ...(isZapRoot && pubkey ? { rootPubkey: pubkey, parentKind: 9735 } : {}),
      });
      replyInput?.clear?.();
      closeReply();
    } catch (err) {
      console.error("Failed to submit reply:", err);
    } finally {
      submitting = false;
    }
  }

  function handleReplyKeydown(e: KeyboardEvent) {
    if (!modalOpen || !commentExpanded) return;
    if (e.key === "Escape") {
      closeReply();
      e.preventDefault();
      e.stopPropagation();
    }
  }

  $effect(() => {
    if (commentExpanded && replyInput) {
      const t = setTimeout(() => replyInput?.focus?.(), 120);
      return () => clearTimeout(t);
    }
  });

  function handleZapReceived(event: { zapReceipt: unknown }) {
    onZapReceived?.(event);
  }

  function handleOptions() {
    // TODO: Show options menu
  }
</script>

<svelte:window onkeydown={handleReplyKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="root-comment {className}" onclick={openThread}>
  {#if isZapRoot}
    <ZapBubble
      {pictureUrl}
      {name}
      {pubkey}
      {timestamp}
      {profileUrl}
      message={content ?? ""}
      amount={zapAmount}
      {emojiTags}
      {resolveMentionLabel}
    />
  {:else}
    <MessageBubble
      {pictureUrl}
      {name}
      {pubkey}
      {timestamp}
      {profileUrl}
      {loading}
      {pending}
    >
      {#if content !== undefined && content !== null}
        <ShortTextRenderer
          content={content}
          emojiTags={emojiTags}
          resolveMentionLabel={resolveMentionLabel}
          class="root-comment-body"
        />
      {:else}
        {@render children?.()}
      {/if}
    </MessageBubble>
  {/if}

  {#if hasReplies}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="reply-indicator" role="button" tabindex="0" onclick={(e) => e.stopPropagation()} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && e.stopPropagation()}>
      <div class="connector-column">
        <div class="connector-vertical"></div>
        <div class="connector-corner">
          <svg viewBox="0 0 27 16" fill="none">
            <path
              d="M1 0 L1 0 Q1 15 16 15 L27 15"
              stroke="hsl(var(--white16))"
              stroke-width="1.5"
              fill="none"
            />
          </svg>
        </div>
      </div>

      <div class="repliers-row">
        <ProfilePicStack
          profiles={displayedRepliers.map((r) => ({
            pictureUrl: r.avatarUrl ?? undefined,
            name: r.displayName,
            pubkey: r.pubkey,
          }))}
          text={otherRepliersCount > 0
            ? `${featuredReplier?.displayName || "Someone"} & ${otherRepliersCount} ${otherRepliersCount === 1 ? "other" : "others"}`
            : featuredReplier?.displayName || "Someone"}
          size="sm"
          onclick={openThread}
        />
      </div>
    </div>
  {/if}
</div>

<Modal
  bind:open={modalOpen}
  ariaLabel="Comment thread"
  align="bottom"
  fillHeight={true}
  wide={true}
  class="thread-modal {childModalOpen ? 'thread-modal-child-open' : ''}"
>
  {#snippet children()}
    <div class="thread-content-wrap" class:child-modal-open={childModalOpen}>
      <div class="thread-modal-child-overlay" aria-hidden="true"></div>
      <div class="thread-content">
      <div class="thread-root">
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div
          class="thread-bubble-click-wrap"
          class:clickable={showThreadActions}
          onclick={(e) => onBubbleClick(e, "root")}
        >
          {#if isZapRoot}
            <ThreadZap
              {pictureUrl}
              {name}
              {pubkey}
              amount={zapAmount}
              {timestamp}
              {profileUrl}
              {version}
              content={content ?? ""}
              {emojiTags}
              {resolveMentionLabel}
            />
          {:else}
            <ThreadComment
              {appIconUrl}
              {appName}
              {appIdentifier}
              {version}
              {pictureUrl}
              {name}
              {pubkey}
              {timestamp}
              {profileUrl}
              {loading}
              {pending}
            >
              {#if content !== undefined && content !== null}
                <ShortTextRenderer
                  content={content}
                  emojiTags={emojiTags}
                  resolveMentionLabel={resolveMentionLabel}
                  class="root-comment-body"
                />
              {:else}
                {@render children?.()}
              {/if}
            </ThreadComment>
          {/if}
        </div>
      </div>

      <div class="thread-divider"></div>

      <div class="thread-replies">
        {#if feedReplies.length > 0}
          {#each feedReplies as reply (reply.id)}
            {@const quotedParent = reply.parentId && reply.parentId !== id ? threadById.get(reply.parentId) : null}
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div
              class="thread-bubble-click-wrap"
              class:clickable={showThreadActions}
              onclick={(e) => onBubbleClick(e, reply)}
            >
              <MessageBubble
                pictureUrl={reply.avatarUrl}
                name={reply.displayName}
                pubkey={reply.pubkey}
                timestamp={reply.createdAt}
                profileUrl={reply.profileUrl}
                loading={reply.profileLoading}
                light={true}
              >
                {#if quotedParent}
                <QuotedMessage
                  authorName={quotedParent.displayName || "Anonymous"}
                  authorPubkey={quotedParent.pubkey}
                  contentPreview={getContentPreview(quotedParent)}
                />
              {/if}
              {#if reply.content !== undefined && reply.content !== null}
                <ShortTextRenderer
                  content={reply.content}
                  emojiTags={reply.emojiTags ?? []}
                  resolveMentionLabel={resolveMentionLabel}
                  class="reply-comment-body"
                />
              {:else}
                {@html reply.contentHtml || "<p class='text-muted-foreground italic'>No content</p>"}
              {/if}
              </MessageBubble>
            </div>
          {/each}
        {:else}
          <div class="no-comments-text">No comments yet</div>
        {/if}
      </div>
    </div>
    </div>
  {/snippet}

  {#snippet footer()}
    {#if showThreadActions}
      <div class="thread-footer-wrap" class:child-modal-open={childModalOpen}>
        <div class="thread-modal-child-overlay" aria-hidden="true"></div>
      <div class="thread-bottom-bar" class:expanded={commentExpanded}>
        {#if !commentExpanded}
          <div class="thread-bottom-bar-content">
            <button type="button" class="btn-primary-large zap-button" onclick={handleZap}>
              <Zap variant="fill" size={18} color="hsl(var(--whiteEnforced))" />
              <span>Zap</span>
            </button>

            {#if getIsSignedIn()}
              <InputButton placeholder="Comment" onclick={handleReply}>
                {#snippet icon()}
                  <Reply variant="outline" size={18} strokeWidth={1.4} color="hsl(var(--white33))" />
                {/snippet}
              </InputButton>
            {:else}
              <button
                type="button"
                class="thread-get-started-comment-btn"
                onclick={() => onGetStarted?.()}
              >
                <span class="get-started-text">Get started with Zapstore to comment</span>
              </button>
            {/if}

            <button type="button" class="btn-secondary-large btn-secondary-dark options-button" onclick={handleOptions}>
              <Options variant="fill" size={20} color="hsl(var(--white33))" />
            </button>
          </div>
        {:else}
          <div class="thread-reply-form">
            <div class="thread-reply-input-wrap">
              <ShortTextInput
                bind:this={replyInput}
                placeholder="Comment on {replyingToComment?.displayName ?? name ?? 'this'}"
                size="medium"
                {searchProfiles}
                {searchEmojis}
                autoFocus={true}
                showActionRow={true}
                onClose={closeReply}
                onCameraTap={() => {}}
                onEmojiTap={() => {}}
                onGifTap={() => {}}
                onAddTap={() => {}}
                onChevronTap={() => {}}
                onsubmit={handleReplySubmit}
              >
                {#snippet aboveEditor()}
                  {#if replyingToComment}
                    <QuotedMessage
                      authorName={replyingToComment.displayName || "Anonymous"}
                      authorPubkey={replyingToComment.pubkey}
                      contentPreview={getContentPreview(replyingToComment)}
                    />
                  {/if}
                {/snippet}
              </ShortTextInput>
            </div>
          </div>
        {/if}
      </div>
      </div>
    {/if}
  {/snippet}
</Modal>

<CommentActionsModal
  bind:open={actionsModalOpen}
  authorName={actionsModalTarget === "root" ? (name || "Anonymous") : (actionsModalTarget ? actionsModalTarget.displayName || "Anonymous" : "Anonymous")}
  authorPubkey={actionsModalTarget === "root" ? pubkey : (actionsModalTarget ? actionsModalTarget.pubkey : null)}
  contentPreview={actionsModalTarget === "root" ? (content || "").trim() : (actionsModalTarget ? getContentPreview(actionsModalTarget) : "")}
  onComment={actionsModalOnComment}
  onZap={actionsModalOnZap}
/>

<ZapSliderModal
  bind:isOpen={zapModalOpen}
  target={zapTarget}
  publisherName={name || ''}
  otherZaps={[]}
  nestedModal={true}
  {searchProfiles}
  {searchEmojis}
  onclose={handleZapClose}
  onzapReceived={handleZapReceived}
/>

<style>
  .root-comment {
    display: flex;
    flex-direction: column;
    cursor: pointer;
  }

  .reply-indicator {
    display: flex;
    align-items: flex-end;
    margin-left: 19px;
    width: calc(100% - 19px);
  }

  .connector-column {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 27px;
    flex-shrink: 0;
    padding-bottom: 14px;
  }

  .connector-vertical {
    width: 1.5px;
    height: 12px;
    background: hsl(var(--white16));
    margin-left: 0.25px;
  }

  .connector-corner {
    width: 27px;
    height: 16px;
  }

  .connector-corner svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .repliers-row {
    display: flex;
    align-items: center;
    padding-top: 4px;
    flex: 1;
    min-width: 0;
  }

  .thread-content-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .thread-modal-child-overlay {
    position: absolute;
    inset: 0;
    background: hsl(var(--black33));
    z-index: 10;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s ease-out;
  }

  .thread-content-wrap.child-modal-open .thread-modal-child-overlay,
  .thread-footer-wrap.child-modal-open .thread-modal-child-overlay {
    opacity: 1;
  }

  /* Whole thread modal scales and moves down when Zap or options modal opens (class is on Modal’s container) */
  :global(.thread-modal.thread-modal-child-open) {
    transform: scale(0.97) translateY(8px);
    transform-origin: top center;
    transition: transform 0.25s cubic-bezier(0.33, 1, 0.68, 1);
  }

  .thread-footer-wrap {
    position: relative;
  }

  .thread-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .thread-root {
    padding: 16px;
    padding-bottom: 12px;
  }

  .thread-bubble-click-wrap {
    display: block;
    width: 100%;
  }
  .thread-bubble-click-wrap.clickable {
    cursor: pointer;
  }

  .thread-divider {
    height: 1.4px;
    background-color: hsl(var(--white11));
    margin: 0;
  }

  .thread-replies {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 12px 16px 16px;
  }

  .no-comments-text {
    font-size: 1.5rem;
    font-weight: 600;
    color: hsl(var(--white16));
    text-align: center;
    padding: 48px 0;
    margin: 0;
  }

  .thread-bottom-bar {
    background: hsl(var(--gray66));
    border-top: 0.33px solid hsl(var(--white16));
    padding: 16px 6px 16px 16px;
    max-height: 88px;
    overflow: hidden;
    transition: max-height 0.3s cubic-bezier(0.33, 1, 0.68, 1);
  }

  .thread-bottom-bar.expanded {
    max-height: 50vh;
    padding: 12px;
  }

  .thread-bottom-bar-content {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .thread-reply-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    flex: 1;
  }

  .thread-reply-input-wrap {
    background: hsl(var(--black33));
    border-radius: var(--radius-16);
    border: 0.33px solid hsl(var(--white33));
    min-height: 0;
    flex: 1;
  }

  .zap-button {
    gap: 8px;
    padding: 0 20px 0 14px;
    flex-shrink: 0;
  }

  /* Same look as Comment InputButton: border, bg, height, radius */
  .thread-get-started-comment-btn {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    height: 42px;
    padding: 0 16px;
    background-color: hsl(var(--black33));
    border-radius: 16px;
    border: 0.33px solid hsl(var(--white33));
    cursor: pointer;
    justify-content: flex-start;
  }
  .thread-get-started-comment-btn .get-started-text {
    color: hsl(var(--white33));
    font-size: 16px;
    font-weight: 500;
  }
  @media (max-width: 767px) {
    .thread-get-started-comment-btn {
      height: 38px;
    }
    .thread-get-started-comment-btn .get-started-text {
      font-size: 14px;
    }
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

    .thread-bottom-bar.expanded {
      padding: 16px;
    }
  }

  @media (min-width: 768px) {
    .thread-bottom-bar {
      padding: 12px 2px 12px 12px;
    }

    .thread-bottom-bar.expanded {
      padding: 12px;
    }
  }
</style>
