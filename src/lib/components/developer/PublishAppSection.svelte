<script lang="ts">
	import { onMount } from 'svelte';
	import { assets } from '$app/paths';
	import { ChevronRight } from '$lib/components/icons';

	let sectionElement: HTMLElement | undefined;
	let scrollProgress = 0;
	let chainLeftOffset = 0;
	let chainRightOffset = 0;
	let textOpacity = 0;
	let textScale = 0.8;

	function handleScroll() {
		if (!sectionElement) return;

		const rect = sectionElement.getBoundingClientRect();
		const windowHeight = window.innerHeight;
		const sectionTop = rect.top;
		const sectionHeight = rect.height;

		// Calculate scroll progress (0 to 1) as section enters viewport
		// Start animation when section top reaches 80% of viewport
		// Complete animation when section top reaches 20% of viewport
		const startPoint = windowHeight * 0.8;
		const endPoint = windowHeight * 0.2;
		const scrollRange = startPoint - endPoint;
		const currentScroll = startPoint - sectionTop;

		if (currentScroll < 0) {
			// Before animation starts
			scrollProgress = 0;
		} else if (currentScroll > scrollRange) {
			// After animation completes
			scrollProgress = 1;
		} else {
			// During animation
			scrollProgress = currentScroll / scrollRange;
		}

		// Clamp between 0 and 1
		scrollProgress = Math.max(0, Math.min(1, scrollProgress));

		// Chains: on mobile keep anchors near center so chains stay visible (small offset = overlap in middle); desktop original
		const isMobile = window.innerWidth < 640;
		const maxOffset = isMobile ? window.innerWidth * 0.06 : window.innerWidth * 0.08;
		const initialOverlap = isMobile ? -window.innerWidth * 0.04 : -window.innerWidth * 0.05;
		chainLeftOffset = initialOverlap - scrollProgress * maxOffset;
		chainRightOffset = -initialOverlap + scrollProgress * maxOffset;

		// Calculate text animation (scale and opacity)
		textOpacity = scrollProgress;
		textScale = 0.8 + scrollProgress * 0.2; // Scale from 0.8 to 1.0
	}

	onMount(() => {
		window.addEventListener('scroll', handleScroll, { passive: true });
		handleScroll();
		return () => {
			window.removeEventListener('scroll', handleScroll);
		};
	});
</script>

<section
	bind:this={sectionElement}
	class="relative min-h-[50vh] flex items-center justify-center overflow-hidden border-b border-border/50 pt-20 pb-14 sm:py-24"
>
	<!-- Blurple gradient background -->
	<div class="absolute inset-0 z-0 flex items-center justify-center">
		<div
			class="w-[800px] h-[800px] gradient-orb bg-primary/15 shrink-0"
			style="filter: blur(120px);"
		></div>
	</div>

	<!-- Left chain -->
	<img
		src={`${assets}/images/chain-left.png`}
		alt=""
		class="publish-chain-img publish-chain-left"
		style="left: 50%; transform: translate(-100%, -50%) translateX({chainLeftOffset}px); transition: transform 0.1s ease-out;"
		loading="lazy"
	/>

	<!-- Right chain -->
	<img
		src={`${assets}/images/chain-right.png`}
		alt=""
		class="publish-chain-img publish-chain-right"
		style="left: 50%; transform: translate(0%, -50%) translateX({chainRightOffset}px); transition: transform 0.1s ease-out;"
		loading="lazy"
	/>

	<!-- Center text -->
	<div
		class="relative z-20 text-center px-4"
		style="opacity: {textOpacity}; transform: scale({textScale}); transition: opacity 0.2s ease-out, transform 0.2s ease-out;"
	>
		<!-- Mobile: three lines, Without + Permission smaller + blurple -->
		<h2 class="section-title text-display-lg sm:hidden publish-three-lines">
			<span
				class="block text-4xl"
				style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;"
				>Publish</span
			>
			<span
				class="block text-3xl"
				style="background: var(--gradient-blurple-light); -webkit-background-clip: text; background-clip: text; color: transparent;"
				>Without</span
			>
			<span
				class="block text-3xl"
				style="background: var(--gradient-blurple-light); -webkit-background-clip: text; background-clip: text; color: transparent;"
				>Permission</span
			>
		</h2>
		<!-- Desktop: original two lines -->
		<h2 class="section-title text-display-lg leading-tight hidden sm:block">
			<span
				class="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl"
				style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;"
				>Publish</span
			>
			<br class="mb-6" />
			<span
				class="text-3xl sm:text-4xl lg:text-4xl xl:text-5xl"
				style="background: var(--gradient-blurple-light); -webkit-background-clip: text; background-clip: text; color: transparent;"
				>Without Permission</span
			>
		</h2>
		<p class="section-description max-w-2xl mx-auto mt-7 publish-desc-desktop">
			No review process. No delay. No middlemen.
		</p>
		<p class="section-description max-w-2xl mx-auto mt-7 publish-desc-mobile">
			No review process. No delay.<br />
			No middlemen.
		</p>
		<a
			href="/docs/publish"
			class="btn-glass-large btn-glass-with-chevron group inline-flex items-center justify-center gap-3 mt-6 sm:mt-8"
		>
			Start Publishing
			<ChevronRight
				variant="outline"
				color="hsl(var(--white33))"
				size={18}
				className="transition-transform group-hover:translate-x-0.5"
			/>
		</a>
	</div>
</section>

<style>
	.publish-chain-img {
		position: absolute;
		top: 50%;
		height: 70vh;
		width: auto;
		object-fit: contain;
		z-index: 10;
	}

	@media (max-width: 639px) {
		.publish-chain-img {
			top: 40%;
			height: 50vh;
		}
	}

	.publish-desc-mobile {
		display: none;
	}
	.publish-desc-desktop {
		display: block;
	}
	@media (max-width: 639px) {
		.publish-desc-mobile {
			display: block;
		}
		.publish-desc-desktop {
			display: none;
		}
	}

	.publish-three-lines {
		line-height: 1.05;
	}
	.publish-three-lines span + span {
		margin-top: 0.05em;
	}

	.gradient-orb {
		border-radius: 50%;
		opacity: 0.6;
		animation: float 20s ease-in-out infinite;
	}

	@keyframes float {
		0%,
		100% {
			transform: translate(0, 0) scale(1);
		}
		50% {
			transform: translate(30px, -30px) scale(1.1);
		}
	}
</style>
