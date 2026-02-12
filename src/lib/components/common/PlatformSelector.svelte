<script>
  import Selector from "./Selector.svelte";

  /** @type {string[]} */
  export let platforms = [];
  export let selectedPlatform = "";
  /** @type {(option: string) => void} */
  export let onSelect = () => {};
</script>

<Selector options={platforms} selectedOption={selectedPlatform} {onSelect} />
