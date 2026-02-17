<script lang="js">
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
import { getIsSignedIn } from "$lib/stores/auth.svelte.js";
let { pictureUrl = null, name = "", pubkey = null, timestamp = null, profileUrl = "", loading = false, pending = false, replies = [], threadComments = [], threadZaps = [], authorPubkey = null, className = "", content = "", emojiTags = [], resolveMentionLabel, appIconUrl = null, appName = "", appIdentifier = null, version = "", children, id = null, isZapRoot = false, zapAmount = 0, searchProfiles = async () => [], searchEmojis = async () => [], onReplySubmit, onZapReceived, onGetStarted, } = $props();
let modalOpen = $state(false);
let zapModalOpen = $state(false);
let commentExpanded = $state(false);
/** When set, we're replying to this comment (show QuotedMessage above input) */
let replyingToComment = $state(null);
/** When set, Zap modal targets this comment instead of the root */
let zapTargetOverride = $state(null);
let replyInput = $state(null);
let submitting = $state(false);
/** Which item the actions modal is for: 'root', a comment reply, or a zap (zap on zap) */
let actionsModalTarget = $state(null);
let actionsModalOpen = $state(false);
/** True when any modal is open on top of the thread (Zap or Comment/Zap options) – drives overlay + scale animation */
const childModalOpen = $derived(zapModalOpen || actionsModalOpen);
// Unique people in the thread: comment repliers + zappers (by pubkey), same shape as ReplyComment for profile stack. App author first.
const uniqueRepliers = $derived.by(() => {
    const commentSource = isZapRoot ? threadComments : replies;
    const seen = new Set();
    const list = [];
    for (const r of commentSource) {
        if (seen.has(r.pubkey))
            continue;
        seen.add(r.pubkey);
        list.push({ pubkey: r.pubkey, displayName: r.displayName, avatarUrl: r.avatarUrl });
    }
    for (const z of threadZaps ?? []) {
        const pk = z.senderPubkey ?? z.pubkey ?? "";
        if (!pk || seen.has(pk))
            continue;
        seen.add(pk);
        list.push({ pubkey: pk, displayName: z.displayName, avatarUrl: z.avatarUrl ?? null });
    }
    if (authorPubkey) {
        list.sort((a, b) => {
            if (a.pubkey === authorPubkey)
                return -1;
            if (b.pubkey === authorPubkey)
                return 1;
            return 0;
        });
    }
    return list;
});
const hasReplies = $derived(uniqueRepliers.length > 0);
const featuredReplier = $derived(uniqueRepliers[0]);
const otherRepliersCount = $derived(uniqueRepliers.length - 1);
const displayedRepliers = $derived(uniqueRepliers.slice(0, 3));
const REPLY_NAME_MAX = 18;
function trimName(name) {
    if (!name || typeof name !== "string") return "";
    const s = name.trim();
    if (s.length <= REPLY_NAME_MAX) return s;
    return s.slice(0, REPLY_NAME_MAX) + "...";
}
/** Profile stack text: 1 = "Name", 2 = "Name & Name", 3+ = "Name & Others". Long names trimmed with "...". */
const replyIndicatorText = $derived.by(() => {
    if (uniqueRepliers.length === 0) return "";
    const n = uniqueRepliers.length;
    const a = trimName(uniqueRepliers[0]?.displayName) || "Someone";
    if (n === 1) return a;
    if (n === 2) return `${a} & ${trimName(uniqueRepliers[1]?.displayName) || "Someone"}`;
    return `${a} & Others`;
});
const replyCount = $derived(isZapRoot ? threadComments.length : (replies?.length ?? 0));
const sortedReplies = $derived([...replies].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeA - timeB;
}));
const feedItems = $derived.by(() => {
    const commentItems = (threadComments.length > 0
        ? threadComments.filter((c) => c.id !== id)
        : sortedReplies).map((c) => ({ type: 'comment', data: c }));
    const zapItems = (threadZaps ?? []).map((z) => ({
        type: 'zap',
        data: {
            ...z,
            pubkey: z.senderPubkey ?? z.pubkey,
            createdAt: z.timestamp ?? z.createdAt,
        },
    }));
    return [...commentItems, ...zapItems].sort((a, b) => (a.data.createdAt ?? 0) - (b.data.createdAt ?? 0));
});
const threadById = $derived.by(() => {
    const map = new Map();
    for (const c of threadComments) {
        map.set(c.id, c);
    }
    return map;
});
function getContentPreview(comment) {
    if (comment.content && comment.content.trim())
        return comment.content;
    if (comment.contentHtml) {
        return comment.contentHtml.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    }
    return "";
}
/** App a-tag so every zap from this page has it on the request → receipt has it → we find by #a only (no #p). */
const appATag = $derived(authorPubkey && appIdentifier ? `32267:${authorPubkey}:${appIdentifier}` : undefined);
/** Zap target: e-tag = event we're zapping, p-tag = that event's author; aTag = app so receipt is discoverable by #a. */
const rootZapTarget = $derived(pubkey
    ? {
        name: name || undefined,
        pubkey,
        id: id ?? undefined,
        pictureUrl: pictureUrl ?? undefined,
        aTag: appATag,
    }
    : null);
/** Active zap target (override when Zap chosen from a reply's menu) */
const zapTarget = $derived(zapTargetOverride ?? rootZapTarget);
/** Show Zap + Comment (or "Get started to comment" for guests) in thread modal when we have handlers and a root id. */
const showThreadActions = $derived((onReplySubmit != null || onZapReceived != null || onGetStarted != null) && (id != null || pubkey != null));
function openActionsModal(target) {
    actionsModalTarget = target;
    actionsModalOpen = true;
}
function onBubbleClick(e, target) {
    if (!showThreadActions)
        return;
    const t = e.target;
    if (t instanceof Element && t.closest("a, button, input, [contenteditable='true']"))
        return;
    e.preventDefault();
    e.stopPropagation();
    openActionsModal(target);
}
function actionsModalOnComment() {
    if (actionsModalTarget === "root")
        handleReply();
    else if (actionsModalTarget && "parentId" in actionsModalTarget)
        openReplyToComment(actionsModalTarget);
    else if (actionsModalTarget && "id" in actionsModalTarget)
        openReplyToZap(actionsModalTarget);
}
function actionsModalOnZap() {
    if (actionsModalTarget === "root")
        handleZap();
    else if (actionsModalTarget)
        handleZapComment(actionsModalTarget);
}
function openReplyToZap(zap) {
    replyingToComment = {
        id: zap.id,
        pubkey: zap.senderPubkey ?? zap.pubkey ?? "",
        displayName: zap.displayName,
        avatarUrl: zap.avatarUrl ?? null,
        content: zap.comment,
        createdAt: zap.timestamp ?? zap.createdAt,
    };
    commentExpanded = true;
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
function openReplyToComment(comment) {
    replyingToComment = comment;
    commentExpanded = true;
}
function closeReply() {
    commentExpanded = false;
    replyingToComment = null;
}
/** Zap target: e-tag = comment or zap receipt id; p-tag = Lightning recipient (zapper when zapping a zap, comment author when zapping a comment). No a-tag so wallet sees a standard profile/event zap (p+e only). */
function handleZapComment(commentOrZap) {
    const isZap = "senderPubkey" in commentOrZap;
    const recipientPubkey = isZap
        ? (commentOrZap.senderPubkey ?? "")
        : (commentOrZap.pubkey ?? "");
    if (!recipientPubkey)
        return;
    zapTargetOverride = {
        name: commentOrZap.displayName || undefined,
        pubkey: recipientPubkey,
        id: commentOrZap.id,
        pictureUrl: commentOrZap.avatarUrl ?? undefined,
        aTag: undefined,
    };
    zapModalOpen = true;
}
function handleZapClose(event) {
    zapModalOpen = false;
    zapTargetOverride = null;
    if (event.success)
        onZapReceived?.({ zapReceipt: {} });
}
async function handleReplySubmit(event) {
    if (submitting || !id)
        return;
    const parentId = replyingToComment ? replyingToComment.id : id;
    submitting = true;
    try {
        onReplySubmit?.({
            ...event,
            parentId,
            ...(replyingToComment?.pubkey ? { replyToPubkey: replyingToComment.pubkey } : {}),
            ...(isZapRoot && (replyingToComment?.pubkey ?? pubkey) ? { rootPubkey: replyingToComment?.pubkey ?? pubkey ?? undefined, parentKind: 9735 } : {}),
        });
        replyInput?.clear?.();
        closeReply();
    }
    catch (err) {
        console.error("Failed to submit reply:", err);
    }
    finally {
        submitting = false;
    }
}
function handleReplyKeydown(e) {
    if (!modalOpen || !commentExpanded)
        return;
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
function handleZapReceived(event) {
    onZapReceived?.(event);
}
function getActionsModalContentPreview() {
    if (actionsModalTarget === "root")
        return (content || "").trim();
    if (!actionsModalTarget)
        return "";
    if ("comment" in actionsModalTarget)
        return actionsModalTarget.comment ?? "";
    return getContentPreview(actionsModalTarget);
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
          text={replyIndicatorText}
          suffix={replyCount != null ? String(replyCount) : ""}
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
        {#if feedItems.length > 0}
          {#each feedItems as item (item.type === 'zap' ? `zap-${item.data.id}` : item.data.id)}
            {#if item.type === 'comment'}
              {@const reply = item.data}
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
            {:else}
              {@const zap = item.data}
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div
                class="thread-bubble-click-wrap"
                class:clickable={showThreadActions}
                onclick={(e) => onBubbleClick(e, zap)}
              >
                <ZapBubble
                  pictureUrl={zap.avatarUrl}
                  name={zap.displayName}
                  pubkey={zap.senderPubkey ?? zap.pubkey}
                  amount={zap.amountSats ?? 0}
                  timestamp={zap.timestamp ?? zap.createdAt}
                  profileUrl={zap.profileUrl}
                  message={zap.comment ?? ""}
                  emojiTags={zap.emojiTags ?? []}
                  {resolveMentionLabel}
                />
              </div>
            {/if}
          {/each}
        {:else}
          <div class="no-comments-text">No comments yet</div>
        {/if}
      </div>
    </div>
    </div>
  {/snippet}

  {#snippet footer()}
    {#if showThreadActions && getIsSignedIn()}
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
  authorName={actionsModalTarget === "root" ? (name || "Anonymous") : (actionsModalTarget?.displayName ?? "Anonymous")}
  authorPubkey={actionsModalTarget === "root" ? pubkey : (actionsModalTarget ? ("senderPubkey" in actionsModalTarget ? actionsModalTarget.senderPubkey : actionsModalTarget.pubkey) ?? null : null)}
  contentPreview={getActionsModalContentPreview()}
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
