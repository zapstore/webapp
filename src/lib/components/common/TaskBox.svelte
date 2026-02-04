<script>
  /**
   * TaskBox component - displays task status indicator
   * States: open, closed (done), inProgress, inReview
   * Matches Flutter: zaplab_design/lib/src/widgets/tasks/task_box.dart
   */
  import { Check, Circle50, Circle75 } from "$lib/components/icons";
  
  export let state = "open"; // "open" | "closed" | "inProgress" | "inReview"
  export let size = 24;
</script>

<div
  class="task-box"
  class:state-open={state === "open"}
  class:state-closed={state === "closed"}
  class:state-in-progress={state === "inProgress"}
  class:state-in-review={state === "inReview"}
  style="width: {size}px; height: {size}px; border-radius: {size / 3}px;"
>
  {#if state === "closed"}
    <!-- LabIcon.s8 check with white outline -->
    <Check
      variant="outline"
      color="white"
      strokeWidth={2.4}
      size={size * 0.5}
    />
  {:else if state === "inProgress"}
    <!-- LabIcon.s14 circle50 with gold gradient, offset right -->
    <div class="progress-wrapper">
      <Circle50
        variant="fill"
        color="hsl(var(--goldColor))"
        size={size * 0.58}
      />
    </div>
  {:else if state === "inReview"}
    <!-- Stack: circle75 with blurple + circle75 with white16 overlay -->
    <div class="review-stack">
      <Circle75
        variant="fill"
        color="hsl(var(--blurpleColor))"
        size={size * 0.58}
      />
    </div>
  {/if}
  <!-- Open state shows empty box -->
</div>

<style>
  .task-box {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .state-open {
    background-color: hsl(var(--black33));
    border: 1.4px solid hsl(var(--white33));
  }

  .state-closed {
    background: var(--gradient-blurple);
    border: none;
  }

  .state-in-progress {
    background-color: hsl(var(--black33));
    border: 1.4px solid hsl(var(--goldColor66));
  }

  .state-in-review {
    background-color: hsl(var(--black33));
    border: 1.4px solid hsl(var(--blurpleColor66));
  }

  /* Offset circle50 to the right like Flutter: SizedBox(width: 7) */
  .progress-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    padding-left: 4px;
  }

  .review-stack {
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
