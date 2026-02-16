<script lang="js">
/**
 * InputButton - Fake input that opens a modal/action
 */
let { placeholder = "", className = "", onclick, icon, trailing, } = $props();
</script>

<button type="button" class="input-button {className}" onclick={onclick}>
  {@render icon?.()}
  <span class="input-placeholder">{placeholder}</span>
  {@render trailing?.()}
</button>

<style>
  .input-button {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    height: 42px;
    padding: 0 16px;
    background-color: hsl(var(--black33));
    border-radius: 16px;
    border: 0.33px solid hsl(var(--white33));
    cursor: pointer;
  }

  @media (max-width: 767px) {
    .input-button {
      height: 38px;
    }
  }

  .input-placeholder {
    font-size: 16px;
    font-weight: 500;
    color: hsl(var(--white33));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
