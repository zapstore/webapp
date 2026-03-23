<script lang="js">
/**
 * BubbleSkeleton - 12 placeholder rows: profile pic circle + bubble (varying widths/heights).
 * No text lines. Used while comments/zaps are loading.
 */
import SkeletonLoader from "$lib/components/common/SkeletonLoader.svelte";
/** Varying bubble widths (min-width %) and heights (px) – kept relatively narrow */
const ROWS = [
    { bubbleWidth: 48, bubbleHeight: 52 },
    { bubbleWidth: 38, bubbleHeight: 40 },
    { bubbleWidth: 55, bubbleHeight: 58 },
    { bubbleWidth: 42, bubbleHeight: 44 },
    { bubbleWidth: 52, bubbleHeight: 48 },
    { bubbleWidth: 45, bubbleHeight: 42 },
    { bubbleWidth: 58, bubbleHeight: 54 },
    { bubbleWidth: 40, bubbleHeight: 46 },
    { bubbleWidth: 50, bubbleHeight: 50 },
    { bubbleWidth: 48, bubbleHeight: 44 },
    { bubbleWidth: 44, bubbleHeight: 48 },
    { bubbleWidth: 54, bubbleHeight: 52 },
];
let { className = "" } = $props();
</script>

<div class="bubble-skeleton-list {className}" style="opacity: 0.33;">
  {#each ROWS as { bubbleWidth, bubbleHeight }, i (i)}
    <div class="bubble-skeleton-row">
      <div class="avatar-skeleton overflow-hidden rounded-full">
        <SkeletonLoader />
      </div>
      <div
        class="bubble-skeleton-bubble overflow-hidden rounded-2xl"
        style="min-width: {bubbleWidth}%; height: {bubbleHeight}px;"
      >
        <SkeletonLoader />
      </div>
    </div>
  {/each}
</div>

<style>
  .bubble-skeleton-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .bubble-skeleton-row {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }

  .avatar-skeleton {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
  }

  .bubble-skeleton-bubble {
    max-width: 100%;
    border-radius: 16px 16px 16px 4px;
  }
</style>
