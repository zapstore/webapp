<script>
  /**
   * Standardized Selector Component
   * Used for tab/option selection with primary/secondary button styling
   */

  /** @type {string[]} */
  export let options = [];
  export let selectedOption = "";
  /** @type {(option: string) => void} */
  export let onSelect = () => {};
  export let size = "default"; // "default" or "large"
</script>

<div
  class="flex gap-2 p-2 {size === 'large'
    ? 'rounded-xl w-full selector-container-large'
    : 'rounded-lg'}"
  style={size === "large"
    ? "background: linear-gradient(to right, var(--white4), hsl(0 0% 100% / 0.02));"
    : "background-color: var(--black33);"}
>
  {#each options as option (option)}
    {@const isSelected = selectedOption === option}
    {#if size === "large"}
      <button
        type="button"
        class="selector-button-large {isSelected
          ? 'selector-button-large-selected'
          : 'selector-button-large-unselected'}"
        on:click={() => onSelect(option)}
      >
        {option}
      </button>
    {:else}
      <button
        type="button"
        class="flex-1 selector-button {isSelected
          ? 'selector-button-selected'
          : 'selector-button-unselected'}"
        on:click={() => onSelect(option)}
      >
        {option}
      </button>
    {/if}
  {/each}
</div>

<style>
  .selector-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    padding: 0 14px;
    font-size: 14px;
    font-weight: 500;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: transform 0.2s ease;
    transform: scale(1);
  }

  .selector-button-selected {
    background-color: var(--white16);
    color: var(--white);
  }

  .selector-button-unselected {
    background-color: transparent;
    color: var(--white66);
  }

  .selector-button:hover {
    transform: scale(1.025);
  }

  .selector-button:active {
    transform: scale(0.98);
  }

  /* Large size buttons */
  .selector-button-large {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 38px;
    padding: 0 22px;
    font-size: 16px;
    font-weight: 500;
    border: none;
    border-radius: 16px;
    cursor: pointer;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;
    transform: scale(1);
  }

  .selector-button-large-selected {
    color: var(--whiteEnforced);
    background-image: var(--button-primary-bg);
    background-color: transparent;
  }

  .selector-button-large-selected:hover {
    transform: scale(1.015);
    box-shadow:
      0 0 20px color-mix(in srgb, var(--blurpleColor) 40%, transparent),
      0 10px 40px -20px color-mix(in srgb, var(--blurpleColor) 60%, transparent);
  }

  .selector-button-large-selected:active {
    transform: scale(0.98);
  }

  .selector-button-large-unselected {
    color: var(--white);
    background-color: var(--gray66); /* gray66 */
  }

  .selector-button-large-unselected:hover {
    transform: scale(1.025);
  }

  .selector-button-large-unselected:active {
    transform: scale(0.98);
  }

  .selector-container-large {
    position: relative;
    border: 0.33px solid var(--white16);
  }

  .selector-container-large::after {
    content: "";
    position: absolute;
    top: -0.33px;
    right: -0.33px;
    bottom: -0.33px;
    width: 300px;
    pointer-events: none;
    border-radius: 0 24px 24px 0;
    background: var(--black);
    border-top: 0.33px solid;
    border-right: 0.33px solid;
    border-bottom: 0.33px solid;
    border-image: linear-gradient(to right, var(--white16), transparent) 1;
    mask-image: linear-gradient(to right, transparent, black);
    -webkit-mask-image: linear-gradient(to right, transparent, black);
  }
</style>
