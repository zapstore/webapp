<script>
  import Selector from "./Selector.svelte";

  export let platforms = [];
  export let selectedPlatform = "";
  export let onSelect = () => {};
</script>

<Selector options={platforms} selectedOption={selectedPlatform} {onSelect} />
