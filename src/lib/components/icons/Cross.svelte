<script>
  import BaseIcon from "./BaseIcon.svelte";
  export let variant = "fill";
  export let strokeWidth = 1.4;
  export let color = "var(--white)";
  export let size = 24;
  export let className = "";
</script>
<BaseIcon {variant} {strokeWidth} {color} {size} {className}>
  <!-- Inline style: WebKit resolves hsl(var(...)) here; presentation attrs often do not. -->
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    stroke-linecap="round"
    stroke-linejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    style="fill:{variant === 'fill' ? color : 'none'};stroke:{variant === 'outline' ? color : 'none'};stroke-width:{variant === 'outline' ? strokeWidth : 0}px"
  >
    <path d="M12.7001 0.699299L6.70025 6.69916M6.70025 6.69916L0.700195 12.6992M6.70025 6.69916L12.7002 12.6991M6.70025 6.69916L0.700308 0.699219" stroke-miterlimit="10" stroke-linecap="round"/>
  </svg>
</BaseIcon>
