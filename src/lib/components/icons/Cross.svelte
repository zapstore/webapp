<script>
	import BaseIcon from './BaseIcon.svelte';

	export let variant = 'fill';
	export let strokeWidth = 1.4;
	export let color = 'var(--white)';
	export let size = 24;
	export let className = '';
</script>

<BaseIcon {variant} {strokeWidth} {color} {size} {className}>
	<!--
	  Two full diagonals so only two strokes cross at the center (not four radiating segments).
	  Keeps translucent colors from stacking into a muddy blob.
	  variant kept for API compat; rendering is stroke-based for both fill/outline callers.
	-->
	<svg
		width={size}
		height={size}
		viewBox="0 0 14 14"
		xmlns="http://www.w3.org/2000/svg"
		style="fill:none;stroke:{color};stroke-width:{strokeWidth}px;stroke-linecap:round;stroke-linejoin:round;"
	>
		<path d="M 2 2 L 12 12" />
		<path d="M 12 2 L 2 12" />
	</svg>
</BaseIcon>
