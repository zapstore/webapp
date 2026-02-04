<script>
  import BaseIcon from "./BaseIcon.svelte";
  export let variant = "fill";
  export let strokeWidth = 1.4;
  export let color = "hsl(var(--foreground))";
  export let size = 24;
  export let className = "";
</script>

<BaseIcon {variant} {strokeWidth} {color} {size} {className}>
  <svg
    width={size * 0.25}
    height={size}
    viewBox="0 0 5 20"
    fill={variant === "fill" ? color : "none"}
    stroke={variant === "outline" ? color : "none"}
    stroke-width={variant === "outline" ? strokeWidth : 0}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M2.5 15.5556C3.88071 15.5556 5 16.5505 5 17.7778C5 19.0051 3.88071 20 2.5 20C1.11929 20 5.77661e-08 19.0051 0 17.7778C6.03528e-08 16.5505 1.11929 15.5556 2.5 15.5556Z" />
    <path d="M2.5 7.77778C3.88071 7.77778 5 8.7727 5 10C5 11.2273 3.88071 12.2222 2.5 12.2222C1.11929 12.2222 5.77661e-08 11.2273 0 10C6.03528e-08 8.7727 1.11929 7.77778 2.5 7.77778Z" />
    <path d="M2.5 0C3.88071 5.3651e-08 5 0.994923 5 2.22222C5 3.44952 3.88071 4.44444 2.5 4.44444C1.11929 4.44444 5.77637e-08 3.44952 0 2.22222C6.03528e-08 0.994923 1.11929 -5.36429e-08 2.5 0Z" />
  </svg>
</BaseIcon>
