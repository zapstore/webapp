<script>
	import { navigating } from '$app/stores';
	import { onMount } from 'svelte';
	
	let progress = 0;
	let visible = false;
	/** @type {ReturnType<typeof setInterval> | null} */
	let interval = null;
	let startTime = 0;
	const MIN_DISPLAY_TIME = 300; // Minimum time to show the bar (ms)
	
	$: if ($navigating) {
		// Navigation started
		visible = true;
		progress = 10;
		startTime = Date.now();
		
		// Simulate progress
		interval = setInterval(() => {
			if (progress < 90) {
				progress += Math.random() * 15;
			}
		}, 150);
	} else if (visible) {
		// Navigation completed
		progress = 100;
		
		// Clear interval
		if (interval) {
			clearInterval(interval);
			interval = null;
		}
		
		// Ensure minimum display time before hiding
		const elapsed = Date.now() - startTime;
		const remainingTime = Math.max(0, MIN_DISPLAY_TIME - elapsed);
		
		// Hide after animation completes + minimum display time
		setTimeout(() => {
			visible = false;
			progress = 0;
		}, remainingTime + 300);
	}
	
	onMount(() => {
		return () => {
			if (interval) clearInterval(interval);
		};
	});
</script>

{#if visible}
	<div 
		class="progress-bar-container"
		class:opacity-100={progress < 100}
		class:opacity-0={progress === 100}
	>
		<div 
			class="progress-bar"
			style="width: {progress}%"
		></div>
	</div>
{/if}

<style>
	.progress-bar-container {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		width: 100%;
		height: 3px;
		z-index: 9999;
		pointer-events: none;
		transition: opacity 400ms ease;
		background: transparent;
	}
	
	.progress-bar {
		height: 100%;
		background: linear-gradient(90deg, 
			#7871ff 0%, 
			#a29dff 50%, 
			#7871ff 100%
		);
		box-shadow: 0 2px 8px rgba(120, 113, 255, 0.6);
		transition: width 200ms ease-out;
		will-change: width;
	}
	
	.opacity-100 {
		opacity: 1;
	}
	
	.opacity-0 {
		opacity: 0;
	}
</style>

