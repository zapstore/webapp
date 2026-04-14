<script lang="js">
/**
 * Desktop-only horizontal action row beside comment/zap bubbles (hover to show).
 */
import { Reply, Zap, Options } from "$lib/components/icons";
const white33 = "hsl(var(--white33))";
let {
    onReply = () => {},
    onZap = () => {},
    onOptions = () => {},
} = $props();
function stop(e) {
    e.stopPropagation();
}
</script>

<div class="comment-bubble-action-rail" role="group" aria-label="Comment actions">
  <button type="button" class="rail-btn" aria-label="Reply" onclick={(e) => { stop(e); onReply(); }}>
    <Reply variant="outline" size={14} strokeWidth={1.4} color={white33} />
  </button>
  <button type="button" class="rail-btn" aria-label="Zap" onclick={(e) => { stop(e); onZap(); }}>
    <Zap variant="fill" size={14} color={white33} />
  </button>
  <button type="button" class="rail-btn" aria-label="More options" onclick={(e) => { stop(e); onOptions(); }}>
    <Options variant="fill" size={14} color={white33} />
  </button>
</div>

<style>
  .comment-bubble-action-rail {
    display: none;
    flex-shrink: 0;
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    height: 28px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;
  }

  @media (min-width: 768px) {
    .comment-bubble-action-rail {
      display: flex;
    }
  }

  :global(.desktop-bubble-actions-target:hover) .comment-bubble-action-rail {
    opacity: 1;
    pointer-events: auto;
  }

  .rail-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    margin: 0;
    border: none;
    border-radius: 50%;
    background: hsl(var(--white4));
    color: inherit;
    cursor: pointer;
    flex-shrink: 0;
  }

  .rail-btn:hover {
    background: hsl(var(--white8));
  }

  .rail-btn:focus-visible {
    outline: 2px solid hsl(var(--primary));
    outline-offset: 2px;
  }
</style>
