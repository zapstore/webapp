<script>
  /**
   * Base Icon Wrapper Component
   * Handles fill/outline variants and styling
   *
   * Individual icon components should extend this
   */

  export let variant = "fill"; // "fill" | "outline"
  export let strokeWidth = 1.4; // 1.4 | 2.8
  export let color = "hsl(var(--foreground))";
  export let size = 24;
  export let className = "";

  $: fillColor = variant === "fill" ? color : "none";
  $: strokeColor = variant === "outline" ? color : "none";
  $: currentStrokeWidth = variant === "outline" ? strokeWidth : 0;
</script>

<div
  class="inline-flex items-center justify-center {className}"
  style="width: {size}px; height: {size}px;"
>
  <slot {fillColor} {strokeColor} strokeWidth={currentStrokeWidth} {size} />
</div>
