<script>
  export let color = "hsl(var(--white))";
  export let strokeWidth = 1.4;
  export let size = 18;
</script>

<svg
  width={size}
  height={Math.round(size * 13 / 20)}
  viewBox="0 0 20 13"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
>
  <path
    vector-effect="non-scaling-stroke"
    d="M18.7002 6.39067C18.7002 6.40853 18.6867 6.42225 18.669 6.42225C18.6514 6.42225 18.6379 6.40853 18.6379 6.39067V0.801867L9.91826 8.84001L9.8949 8.86054L9.87465 8.83843L6.70642 5.62633L0.753152 11.6897C0.740695 11.7024 0.721997 11.7024 0.709539 11.6897C0.697081 11.6771 0.697081 11.6582 0.709539 11.6455L6.68462 5.56001L6.70642 5.53632L6.72823 5.56001L9.89646 8.77211L18.588 0.762387H13.0865C13.0689 0.762387 13.0553 0.748665 13.0553 0.730803C13.0553 0.712941 13.0689 0.699219 13.0865 0.699219H18.7002V6.39067Z"
    stroke={color}
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
