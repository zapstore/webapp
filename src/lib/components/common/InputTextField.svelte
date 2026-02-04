<script lang="ts">
  /**
   * InputTextField - Styled text input component
   *
   * Matches the zaplab_design LabInputTextField styling:
   * - black33 background with white33 border (0.33px)
   * - 16px border radius
   * - Height matches button heights (38px mobile, 42px desktop)
   * - Optional title above and warning below
   * - Warning has triangle pointer
   */
  import { Alert } from "$lib/components/icons";

  interface Props {
    value?: string;
    placeholder?: string;
    title?: string | null;
    warning?: string | null;
    size?: "small" | "medium" | "large";
    singleLine?: boolean;
    autoCapitalize?: boolean;
    obscureText?: boolean;
    id?: string;
    autocomplete?: string;
    inputElement?: HTMLInputElement | HTMLTextAreaElement | null;
    oninput?: (event: { value: string }) => void;
    onkeydown?: (event: { key: string; event: KeyboardEvent }) => void;
    onfocus?: (event: FocusEvent) => void;
    onblur?: (event: FocusEvent) => void;
  }

  let {
    value = $bindable(""),
    placeholder = "",
    title = null,
    warning = null,
    size = "small",
    singleLine = true,
    autoCapitalize = true,
    obscureText = false,
    id = "",
    autocomplete = "off",
    inputElement = $bindable(null),
    oninput,
    onkeydown,
    onfocus,
    onblur,
  }: Props = $props();

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    value = target.value;
    oninput?.({ value });
  }

  function handleKeydown(e: KeyboardEvent) {
    onkeydown?.({ key: e.key, event: e });
  }

  function handleFocus(e: FocusEvent) {
    onfocus?.(e);
  }

  function handleBlur(e: FocusEvent) {
    onblur?.(e);
  }
</script>

<div class="input-field-wrapper">
  {#if title}
    <label for={id} class="input-title">{title}</label>
  {/if}

  <div
    class="input-container"
    class:input-medium={size === "medium"}
    class:input-large={size === "large"}
  >
    {#if singleLine}
      <input
        bind:this={inputElement}
        {id}
        type={obscureText ? "password" : "text"}
        {value}
        {placeholder}
        autocomplete={autocomplete as "off" | "on"}
        autocapitalize={autoCapitalize ? "words" : "none"}
        class="input-element"
        oninput={handleInput}
        onkeydown={handleKeydown}
        onfocus={handleFocus}
        onblur={handleBlur}
      />
    {:else}
      <textarea
        bind:this={inputElement}
        {id}
        {value}
        {placeholder}
        autocomplete={autocomplete as "off" | "on"}
        autocapitalize={autoCapitalize ? "sentences" : "none"}
        class="input-element textarea"
        class:textarea-medium={size === "medium"}
        class:textarea-large={size === "large"}
        oninput={handleInput}
        onkeydown={handleKeydown}
        onfocus={handleFocus}
        onblur={handleBlur}
      ></textarea>
    {/if}
  </div>

  {#if warning}
    <div class="warning-wrapper">
      <div class="warning-triangle"></div>
      <div class="warning-container">
        <Alert variant="outline" color="hsl(var(--white66))" size={20} />
        <span class="warning-text">{warning}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .input-field-wrapper {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .input-title {
    display: block;
    font-size: 1rem;
    font-weight: 400;
    color: hsl(var(--white));
    margin-bottom: 8px;
    padding-left: 14px;
  }

  /* Input container - matches large button heights (42px desktop, 38px mobile) */
  .input-container {
    display: flex;
    align-items: center;
    height: 42px;
    padding: 0 14px;
    background-color: hsl(var(--black33));
    border: 0.33px solid hsl(var(--white33));
    border-radius: 16px;
    overflow: hidden;
    box-sizing: border-box;
  }

  /* Responsive: Scale down on mobile (matches btn-*-large behavior) */
  @media (max-width: 767px) {
    .input-container {
      height: 38px;
    }
  }

  /* Medium and large sizes for textareas */
  .input-container.input-medium {
    height: 80px;
    align-items: flex-start;
    padding: 12px 16px;
  }

  .input-container.input-large {
    height: 160px;
    align-items: flex-start;
    padding: 12px 16px;
  }

  .input-element {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: hsl(var(--white));
    font-family: "Inter", sans-serif;
    font-size: 1rem;
    line-height: 1.5;
    resize: none;
    padding: 0;
  }

  .input-element::placeholder {
    color: hsl(var(--white33));
  }

  .textarea {
    display: block;
    overflow-y: auto;
  }

  .textarea-medium {
    min-height: 56px;
  }

  .textarea-large {
    min-height: 136px;
  }

  /* Warning styles */
  .warning-wrapper {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding-left: 14px;
    margin-top: 0;
  }

  .warning-triangle {
    width: 0;
    height: 0;
    border-left: 12px solid transparent;
    border-right: 12px solid transparent;
    border-bottom: 10px solid hsl(var(--white16));
    margin-left: 10px;
  }

  .warning-container {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background-color: hsl(var(--white16));
    border-radius: 16px;
  }

  .warning-text {
    font-size: 0.875rem;
    color: hsl(var(--white66));
    line-height: 1.4;
  }
</style>
