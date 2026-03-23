<script lang="js">
import { stringToColor } from "$lib/utils/color.js";
let { text = "", isSelected = false, isEmphasized = false, onTap = () => { }, size = "default", neutral = false } = $props();

/** @type {{ kind: string, value: string } | null} */
const structured = $derived.by(() => {
	const raw = String(text ?? "").trim();
	const m = /^(alternative|reads|writes):(.+)$/i.exec(raw);
	if (!m) return null;
	const value = m[2]?.trim();
	if (!value) return null;
	return { kind: m[1].toLowerCase(), value };
});

const showStructured = $derived(structured != null);

const prefixLabel = $derived(
	!structured
		? ""
		: structured.kind === "alternative"
			? "Alternative to "
			: structured.kind === "reads"
				? "Reads "
				: structured.kind === "writes"
					? "Writes "
					: ""
);

/** Structured: prefix softer than value. Selected uses white66+white (readable hierarchy; avoids white33 or flat white/white). Emphasized-only: white33+white. */
const prefixColor = $derived(
	isSelected ? "hsl(var(--white66))" : isEmphasized ? "hsl(var(--white33))" : "hsl(var(--white66))"
);
const valueColor = $derived(
	isSelected ? "hsl(var(--white))" : isEmphasized ? "hsl(var(--white))" : "hsl(var(--white66))"
);

const colorKey = $derived(structured?.value ?? text);
const baseColor = $derived(stringToColor(colorKey));
const bgColor = $derived(neutral
    ? (isSelected || isEmphasized ? "hsl(var(--gray66))" : "hsl(var(--white16))")
    : (isSelected || isEmphasized
        ? `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, 0.40)`
        : `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, 0.16)`));
const textColor = $derived(isSelected || isEmphasized ? "hsl(var(--white))" : "hsl(var(--white66))");
</script>

<button
  type="button"
  class="label-container group"
  class:size-small={size === "small"}
  class:size-xs={size === "xs"}
  onclick={onTap}
  style="--bg-color: {bgColor}; --text-color: {textColor};"
>
  <div class="label-content" class:is-selected={isSelected}>
    {#if isSelected}
      <svg
        class="check-icon"
        width="20"
        height="20"
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
    {#if showStructured && structured}
      <span class="label-text label-text-split">
        <span class="label-structured-prefix" style:color={prefixColor}>{prefixLabel}</span><span
          class="label-structured-value" style:color={valueColor}>{structured.value}</span>
      </span>
    {:else}
      <span class="label-text">{text}</span>
    {/if}
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

  .label-container.size-small {
    height: 24px;
  }

  .label-container.size-small .label-content {
    height: 24px;
    padding-left: 8px;
    padding-right: 2px;
    gap: 4px;
    border-radius: 8px 0 0 8px;
    max-width: 160px;
  }

  .label-container.size-small .label-text {
    font-size: 12px;
  }

  .label-container.size-small .label-triangle {
    width: 18px;
    height: 24px;
  }

  .label-container.size-small .check-icon {
    width: 14px;
    height: 14px;
  }

  .label-container.size-xs {
    height: 20px;
  }

  .label-container.size-xs .label-content {
    height: 20px;
    padding-left: 6px;
    padding-right: 1px;
    gap: 3px;
    border-radius: 5px 0 0 5px;
    max-width: 120px;
  }

  .label-container.size-xs .label-text {
    font-size: 11px;
  }

  .label-container.size-xs .label-triangle {
    width: 14px;
    height: 20px;
  }

  .label-container.size-xs .check-icon {
    width: 12px;
    height: 12px;
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

  .label-content.is-selected {
    padding-left: 8px;
    gap: 5px;
  }

  .label-container.size-small .label-content.is-selected {
    padding-left: 6px;
    gap: 3px;
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

  .label-text-split {
    display: inline-flex;
    align-items: baseline;
    min-width: 0;
    max-width: 100%;
  }

  .label-structured-prefix {
    flex-shrink: 0;
    font-weight: 500;
    white-space: pre;
  }

  .label-structured-value {
    min-width: 0;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .label-triangle {
    flex-shrink: 0;
  }
</style>
