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
    viewBox="0 0 17 16"
    fill="none"
    stroke={variant === "outline" ? color : "none"}
    stroke-width={variant === "outline" ? strokeWidth : 0}
    stroke-linecap="round"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M0.7 0.73H15.7" />
    <path d="M0.7 7.7H15.7" />
    <path d="M0.7 14.67H10.7" />
  </svg>
</BaseIcon>
