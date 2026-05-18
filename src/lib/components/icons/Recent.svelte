<script>
	import BaseIcon from './BaseIcon.svelte';

	export let variant = 'outline';
	export let strokeWidth = 1.4;
	export let color = 'var(--white33)';
	export let size = 20;
	export let className = '';
</script>

<BaseIcon {variant} {strokeWidth} {color} {size} {className}>
	<svg
		width={size}
		height={size}
		viewBox="0 0 26 29"
		xmlns="http://www.w3.org/2000/svg"
		style="fill:none;stroke:{variant === 'outline' ? color : 'none'};stroke-width:{variant === 'outline' ? strokeWidth : 0}px;stroke-linecap:round;"
	>
		<path
			d="M12.7002 3.69922C19.3276 3.69922 24.7002 9.0718 24.7002 15.6992C24.7002 22.3266 19.3276 27.6992 12.7002 27.6992C6.07278 27.6992 0.700195 22.3266 0.700195 15.6992C0.700195 13.1992 1.2002 10.6992 3.7002 8.19922M17.7002 0.699219L12.7002 3.69922L15.7002 8.19922"
		/>
	</svg>
</BaseIcon>
