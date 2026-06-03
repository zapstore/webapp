<script>
	import BaseIcon from './BaseIcon.svelte';

	export let variant = 'outline';
	export let strokeWidth = 1.6;
	export let color = 'var(--white)';
	export let size = 24;
	export let className = '';
</script>

<BaseIcon {variant} {strokeWidth} {color} {size} {className}>
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		stroke={color}
		stroke-width={strokeWidth}
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<circle cx="12" cy="12" r="10" />
		<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
		<path d="M12 17h.01" />
	</svg>
</BaseIcon>
