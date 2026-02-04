<script lang="ts">
  import { stringToColor } from "$lib/utils/color.js";

  /**
   * Label Component
   * Triangle-shaped label with text
   */

  interface Props {
    text?: string;
    isSelected?: boolean;
    isEmphasized?: boolean;
    onTap?: () => void;
  }

  let { text = "", isSelected = false, isEmphasized = false, onTap = () => {} }: Props = $props();

  const baseColor = $derived(stringToColor(text));
  const bgColor = $derived(
    isSelected || isEmphasized
      ? `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, 0.40)`
      : `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, 0.16)`
  );
  const textColor = $derived(
    isSelected || isEmphasized ? "hsl(var(--white))" : "hsl(var(--white66))"
  );
</script>

<button
  type="button"
  class="label-container group"
  onclick={onTap}
  style="--bg-color: {bgColor}; --text-color: {textColor};"
>
  <div class="label-content">
    {#if isSelected}
      <svg
        class="check-icon"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8 2.5L4 6.5L2 4.5"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    {/if}
    <span class="label-text">{text}</span>
  </div>

  <svg
    class="label-triangle"
    width="24"
    height="32"
    viewBox="0 0 24 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M0 0 L4 0 Q9 2 14 6 Q19 10 23 14 Q23.5 16 23 18 Q19 22 14 26 Q9 30 4 32 L0 32 Z"
      fill="var(--bg-color)"
    />
  </svg>
</button>

<style>
  .label-container {
    display: inline-flex;
    align-items: center;
    height: 32px;
    cursor: pointer;
    transition: transform 0.2s ease;
    transform: scale(1);
    background: none;
    border: none;
    padding: 0;
  }

  .label-container:hover {
    transform: scale(1.01);
  }

  .label-container:active {
    transform: scale(0.99);
  }

  .label-content {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding-left: 12px;
    padding-right: 4px;
    background-color: var(--bg-color);
    border-radius: 12px 0 0 12px;
    max-width: 200px;
    overflow: hidden;
  }

  .check-icon {
    flex-shrink: 0;
    color: var(--text-color);
  }

  .label-text {
    font-size: 14px;
    font-weight: 400;
    color: var(--text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .label-triangle {
    flex-shrink: 0;
  }
</style>
