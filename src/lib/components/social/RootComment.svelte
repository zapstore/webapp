<script lang="ts">
  /**
   * RootComment - Wraps a MessageBubble with reply indicator
   */
  import MessageBubble from "./MessageBubble.svelte";
  import ThreadComment from "./ThreadComment.svelte";
  import ShortTextRenderer from "$lib/components/common/ShortTextRenderer.svelte";
  import ProfilePicStack from "$lib/components/common/ProfilePicStack.svelte";
  import Modal from "$lib/components/common/Modal.svelte";
  import InputButton from "$lib/components/common/InputButton.svelte";
  import { Zap, Reply, Options } from "$lib/components/icons";

  interface ReplyComment {
    id: string;
    pubkey: string;
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
  }: Props = $props();

  let modalOpen = $state(false);

  // Get unique repliers (by pubkey), prioritizing the app author
  const uniqueRepliers = $derived.by(() => {
    const seen = new Set<string>();
    const repliers = replies.filter((reply) => {
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

  function openThread() {
    modalOpen = true;
  }

  function handleZap() {
    // TODO: Implement zap functionality
  }

  function handleReply() {
    // TODO: Open reply input
  }

  function handleOptions() {
    // TODO: Show options menu
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="root-comment {className}" onclick={openThread}>
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

  {#if hasReplies}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="reply-indicator" onclick={(e) => e.stopPropagation()}>
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
  class="thread-modal"
>
  {#snippet children()}
    <div class="thread-content">
      <div class="thread-root">
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
      </div>

      <div class="thread-divider"></div>

      <div class="thread-replies">
        {#if sortedReplies.length > 0}
          {#each sortedReplies as reply (reply.id)}
            <MessageBubble
              pictureUrl={reply.avatarUrl}
              name={reply.displayName}
              pubkey={reply.pubkey}
              timestamp={reply.createdAt}
              profileUrl={reply.profileUrl}
              loading={reply.profileLoading}
              light={true}
            >
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
          {/each}
        {:else}
          <div class="no-comments-text">No comments yet</div>
        {/if}
      </div>
    </div>
  {/snippet}

  {#snippet footer()}
    <div class="thread-bottom-bar">
      <div class="thread-bottom-bar-content">
        <button type="button" class="btn-primary-large zap-button" onclick={handleZap}>
          <Zap variant="fill" size={18} color="hsl(var(--whiteEnforced))" />
          <span>Zap</span>
        </button>

        <InputButton placeholder="Comment" onclick={handleReply}>
          {#snippet icon()}
            <Reply variant="outline" size={18} strokeWidth={1.4} color="hsl(var(--white33))" />
          {/snippet}
        </InputButton>

        <button type="button" class="btn-secondary-large btn-secondary-dark options-button" onclick={handleOptions}>
          <Options variant="fill" size={20} color="hsl(var(--white33))" />
        </button>
      </div>
    </div>
  {/snippet}
</Modal>

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

  .thread-content {
    display: flex;
    flex-direction: column;
  }

  .thread-root {
    padding: 16px;
    padding-bottom: 12px;
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
  }

  .thread-bottom-bar-content {
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
    .thread-bottom-bar {
      padding: 12px 2px 12px 12px;
    }
  }
</style>
