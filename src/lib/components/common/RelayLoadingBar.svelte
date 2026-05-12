<!--
  Indeterminate shimmer bar shown while a relay fetch is in flight.
  Drop it immediately below a panel header to indicate background sync
  without blocking the content beneath.
-->
<script>
	let { loading = false } = $props();
</script>

{#if loading}
	<div class="relay-bar" aria-hidden="true">
		<div class="relay-bar-sweep"></div>
	</div>
{/if}

<style>
	.relay-bar {
		position: relative;
		flex-shrink: 0;
		width: 100%;
		height: 2px;
		overflow: hidden;
		background: color-mix(in srgb, #7871ff 12%, transparent);
	}

	.relay-bar-sweep {
		position: absolute;
		top: 0;
		left: 0;
		width: 55%;
		height: 100%;
		background: linear-gradient(
			90deg,
			transparent 0%,
			color-mix(in srgb, #7871ff 66%, transparent) 50%,
			transparent 100%
		);
		animation: relay-sweep 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
		will-change: transform;
	}

	@keyframes relay-sweep {
		0%   { transform: translateX(-100%); }
		100% { transform: translateX(282%); }
	}
</style>
