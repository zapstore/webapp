<script lang="ts">
  /**
   * CommentActionsModal - Modal showing a comment preview with Comment and Zap actions.
   */
  import Modal from "$lib/components/common/Modal.svelte";
  import QuotedMessage from "./QuotedMessage.svelte";
  import { Reply, Zap } from "$lib/components/icons";

  interface Props {
    open?: boolean;
    authorName?: string;
    authorPubkey?: string | null;
    contentPreview?: string;
    onComment?: () => void;
    onZap?: () => void;
  }

  let {
    open = $bindable(false),
    authorName = "Anonymous",
    authorPubkey = null,
    contentPreview = "",
    onComment,
    onZap,
  }: Props = $props();

  function chooseComment() {
    open = false;
    onComment?.();
  }

  function chooseZap() {
    open = false;
    onZap?.();
  }
</script>

<Modal bind:open ariaLabel="Comment actions" align="bottom" wide={true} noBackdrop={true} class="comment-actions-modal">
  <div class="actions-content">
    <div class="comment-preview">
      <QuotedMessage {authorName} {authorPubkey} {contentPreview} />
    </div>
    <div class="actions-row">
      <button type="button" class="action-btn comment-btn" onclick={chooseComment}>
        <Reply variant="outline" size={20} color="hsl(var(--white66))" />
        <span>Comment</span>
      </button>
      <button type="button" class="action-btn zap-btn" onclick={chooseZap}>
        <Zap variant="outline" size={20} color="hsl(var(--white66))" />
        <span>Zap</span>
      </button>
    </div>
  </div>
</Modal>

<style>
  .actions-content {
    padding: 20px;
  }

  .comment-preview {
    margin-bottom: 20px;
  }

  .actions-row {
    display: flex;
    gap: 12px;
    justify-content: stretch;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex: 1;
    padding: 14px 20px;
    border-radius: var(--radius-12);
    border: 0.33px solid hsl(var(--white16));
    background: hsl(var(--white11));
    color: hsl(var(--foreground));
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
  }
  .action-btn:hover {
    background: hsl(var(--white16));
  }
</style>
