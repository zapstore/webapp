<script>
  import BaseIcon from "./BaseIcon.svelte";

  export let variant = "outline";
  export let strokeWidth = 1.4;
  export let color = "hsl(var(--foreground))";
  export let size = 24;
  export let className = "";
</script>

<BaseIcon {variant} {strokeWidth} {color} {size} {className}>
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 19"
    fill={variant === "fill" ? color : "none"}
    stroke={variant === "outline" ? color : "none"}
    stroke-width={variant === "outline" ? strokeWidth : 0}
    stroke-linecap="round"
    stroke-linejoin="round"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M0.700195 0.699219L10.7002 7.19922L0.700195 13.6992M0.700195 17.6992H10.7002"
    />
  </svg>
</BaseIcon>
