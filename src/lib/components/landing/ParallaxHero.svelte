<script>
	import { onMount } from 'svelte';
	import { ChevronRight } from '$lib/components/icons';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';

	// Session memory: URLs we've already loaded (survives SPA back navigation so no skeletons on return)
	const parallaxHeroLoadedUrls = new Set();

	// Preload the main featured app icons for faster first paint (above-the-fold + primal)
	const preloadImages = [
		'/images/parallax-apps/zapstore-studio.svg',
		'/images/parallax-apps/yakihonne.png',
		'/images/parallax-apps/grimoire.svg',
		'/images/parallax-apps/bitwarden.png',
		'/images/parallax-apps/primal.png'
	];

	/** @type {HTMLAnchorElement | null} */
	let heroButton = null;

	// Track loaded state for each icon image (reassigned for reactivity)
	/** @type {{ [url: string]: boolean }} */
	let loadedImages = {};
	/** @type {HTMLAnchorElement | null} */
	let devButton = null;
	let mouseX = 0;
	let mouseY = 0;

	/** @param {MouseEvent} event */
	function handleMouseMove(event) {
		if (!heroButton) return;
		const rect = heroButton.getBoundingClientRect();
		mouseX = event.clientX - rect.left;
		mouseY = event.clientY - rect.top;
		heroButton.style.setProperty('--mouse-x', `${mouseX}px`);
		heroButton.style.setProperty('--mouse-y', `${mouseY}px`);
	}

	/** @param {MouseEvent} event */
	function handleDevButtonMouseMove(event) {
		if (!devButton) return;
		const rect = devButton.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		devButton.style.setProperty('--mouse-x', `${x}px`);
		devButton.style.setProperty('--mouse-y', `${y}px`);
	}

	let scrollY = 0;
	/** @type {HTMLElement | null} */
	let heroElement = null;
	let windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;

	// Icon configuration array - edit this to control each icon's properties
	// Position (x, y) is relative to the center of the section
	// Size is a scale multiplier (1.0 = base size, larger = bigger)
	// Rotation is in degrees
	// Parallax speed and opacity are automatically calculated based on size
	// Spread over full width and height, filling corners and center, extending beyond bottom edge
	//
	// Main featured apps (biggest, center): primal, bitwarden, yakihonne, wormhole, bitchat
	// Secondary apps: antennapod, blue-wallet, breezy, flare, grimoire, fountain, newpipe, organic-maps, ridestr, electrum, zapstream
	export let iconConfigs = [
		// === FEATURED APPS (large, prominent positions) ===
		// Zapstore Studio - upper left
		{
			imageUrl: `/images/parallax-apps/zapstore-studio.svg`,
			x: -400,
			y: -170,
			size: 1.9,
			rotationX: 12,
			rotationY: -15
		},
		// Yakihonne - upper right
		{
			imageUrl: `/images/parallax-apps/yakihonne.png`,
			x: 380,
			y: -190,
			size: 2.0,
			rotationX: 20,
			rotationY: 14
		},
		// Grimoire - lower left
		{
			imageUrl: `/images/parallax-apps/grimoire.svg`,
			x: -456,
			y: 155,
			size: 2.0,
			rotationX: -20,
			rotationY: -20
		},
		// Bitwarden - lower right
		{
			imageUrl: `/images/parallax-apps/bitwarden.png`,
			x: 470,
			y: 160,
			size: 1.9,
			rotationX: -16,
			rotationY: 16
		},
		// Primal - TOP CENTER (most prominent, directly under header)
		{
			imageUrl: `/images/parallax-apps/primal.png`,
			x: -105,
			y: -310,
			size: 1.9,
			rotationX: 25,
			rotationY: -22
		},
		// === MIDDLE ICONS (between big ones, easy to edit) ===
		// Wormhole - middle left (between upper-left and lower-left big icons)
		{
			imageUrl: `/images/parallax-apps/wormhole.png`,
			x: -360,
			y: 0,
			size: 1.3,
			rotationX: -18,
			rotationY: -20
		},
		// Bitchat - middle right (between upper-right and lower-right big icons)
		{
			imageUrl: `/images/parallax-apps/bitchat.png`,
			x: 360,
			y: -10,
			size: 1.2,
			rotationX: 16,
			rotationY: 18
		},
		// === SECONDARY APPS (medium-large, fill out the corners) ===
		// === GRID ICONS (outer edges, cycling through all apps) ===
		{
			imageUrl: `/images/parallax-apps/antennapod.png`,
			x: -840,
			y: -400,
			size: 1.6,
			rotationX: -20,
			rotationY: 25
		},
		{
			imageUrl: `/images/parallax-apps/blue-wallet.png`,
			x: 840,
			y: -400,
			size: 1.5,
			rotationX: -18,
			rotationY: -22
		},
		{
			imageUrl: `/images/parallax-apps/breezy.png`,
			x: -840,
			y: 600,
			size: 1.4,
			rotationX: 20,
			rotationY: 18
		},
		{
			imageUrl: `/images/parallax-apps/grimoire.svg`,
			x: 840,
			y: 600,
			size: 1.3,
			rotationX: 18,
			rotationY: -20
		},
		{
			imageUrl: `/images/parallax-apps/obsidian.png`,
			x: -720,
			y: -300,
			size: 1.8,
			rotationX: 20,
			rotationY: -15
		},
		{
			imageUrl: `/images/parallax-apps/vendata.svg`,
			x: 720,
			y: -300,
			size: 1.8,
			rotationX: 20,
			rotationY: 15
		},
		{
			imageUrl: `/images/parallax-apps/rocket.svg`,
			x: -720,
			y: 500,
			size: 1.7,
			rotationX: -20,
			rotationY: 25
		},
		{
			imageUrl: `/images/parallax-apps/lowent.svg`,
			x: 720,
			y: 500,
			size: 1.7,
			rotationX: -20,
			rotationY: -25
		},
		{
			imageUrl: `/images/parallax-apps/vendata.svg`,
			x: -600,
			y: -200,
			size: 1.6,
			rotationX: 18,
			rotationY: -18
		},
		{
			imageUrl: `/images/parallax-apps/electrum.png`,
			x: 600,
			y: -200,
			size: 1.6,
			rotationX: 18,
			rotationY: 18
		},
		// More grid positions - continuing outer grid
		{
			imageUrl: `/images/parallax-apps/grimoire.svg`,
			x: -840,
			y: 0,
			size: 1.2,
			rotationX: 16,
			rotationY: 22
		},
		{
			imageUrl: `/images/parallax-apps/rocket.svg`,
			x: 840,
			y: 300,
			size: 0.95,
			rotationX: -10,
			rotationY: -16
		},
		{
			imageUrl: `/images/parallax-apps/flare.svg`,
			x: -580,
			y: -20,
			size: 0.9,
			rotationX: 12,
			rotationY: 15
		},
		{
			imageUrl: `/images/parallax-apps/rocket.svg`,
			x: 580,
			y: -20,
			size: 0.85,
			rotationX: 10,
			rotationY: -14
		},
		{
			imageUrl: `/images/parallax-apps/lowent.svg`,
			x: -720,
			y: 100,
			size: 0.8,
			rotationX: -8,
			rotationY: 12
		},
		{
			imageUrl: `/images/parallax-apps/antennapod.png`,
			x: 720,
			y: 100,
			size: 0.75,
			rotationX: -6,
			rotationY: -10
		},
		{
			imageUrl: `/images/parallax-apps/zapstream.svg`,
			x: -600,
			y: -300,
			size: 0.7,
			rotationX: 8,
			rotationY: 8
		},
		{
			imageUrl: `/images/parallax-apps/flare.svg`,
			x: 600,
			y: -300,
			size: 0.65,
			rotationX: 6,
			rotationY: -6
		},
		{
			imageUrl: `/images/parallax-apps/antennapod.png`,
			x: -600,
			y: 500,
			size: 0.6,
			rotationX: -20,
			rotationY: 25
		},
		{
			imageUrl: `/images/parallax-apps/yakihonne.png`,
			x: 600,
			y: 500,
			size: 0.55,
			rotationX: -22,
			rotationY: -23
		},
		{
			imageUrl: `/images/parallax-apps/antennapod.png`,
			x: -560,
			y: 370,
			size: 1.1,
			rotationX: -14,
			rotationY: 16
		},
		{
			imageUrl: `/images/parallax-apps/blue-wallet.png`,
			x: 560,
			y: 370,
			size: 1.0,
			rotationX: -12,
			rotationY: -14
		},
		{
			imageUrl: `/images/parallax-apps/breezy.png`,
			x: -360,
			y: -400,
			size: 0.95,
			rotationX: 10,
			rotationY: 12
		},
		{
			imageUrl: `/images/parallax-apps/grimoire.svg`,
			x: 360,
			y: -400,
			size: 0.9,
			rotationX: 8,
			rotationY: -10
		},
		{
			imageUrl: `/images/parallax-apps/rocket.svg`,
			x: -360,
			y: 300,
			size: 0.85,
			rotationX: -6,
			rotationY: 8
		},
		{
			imageUrl: `/images/parallax-apps/antennapod.png`,
			x: 360,
			y: 300,
			size: 0.8,
			rotationX: -4,
			rotationY: -6
		},
		{
			imageUrl: `/images/parallax-apps/rocket.svg`,
			x: -240,
			y: -400,
			size: 0.75,
			rotationX: 4,
			rotationY: 4
		},
		{
			imageUrl: `/images/parallax-apps/lowent.svg`,
			x: 240,
			y: -400,
			size: 0.7,
			rotationX: 2,
			rotationY: -2
		},
		{
			imageUrl: `/images/parallax-apps/lowent.svg`,
			x: -240,
			y: 0,
			size: 0.65,
			rotationX: -2,
			rotationY: 2
		},
		{
			imageUrl: `/images/parallax-apps/zapstream.svg`,
			x: 240,
			y: 0,
			size: 0.6,
			rotationX: -1,
			rotationY: -1
		},
		{
			imageUrl: `/images/parallax-apps/flare.svg`,
			x: -240,
			y: 300,
			size: 0.55,
			rotationX: 1,
			rotationY: 1
		},
		// Additional icons in safe areas (far from featured apps)
		{
			imageUrl: `/images/parallax-apps/rocket.svg`,
			x: -840,
			y: -200,
			size: 0.6,
			rotationX: 5,
			rotationY: -5
		},
		{
			imageUrl: `/images/parallax-apps/yakihonne.png`,
			x: 840,
			y: -200,
			size: 0.6,
			rotationX: -5,
			rotationY: 5
		},
		{
			imageUrl: `/images/parallax-apps/wormhole.png`,
			x: -840,
			y: 200,
			size: 0.6,
			rotationX: 4,
			rotationY: -4
		},
		{
			imageUrl: `/images/parallax-apps/bitchat.png`,
			x: 840,
			y: 200,
			size: 0.6,
			rotationX: -4,
			rotationY: 4
		},
		{
			imageUrl: `/images/parallax-apps/primal.png`,
			x: -600,
			y: -400,
			size: 0.55,
			rotationX: 3,
			rotationY: -3
		},
		// Small icons in center zone - spread out from center
		{
			imageUrl: `/images/parallax-apps/antennapod.png`,
			x: -230,
			y: -180,
			size: 0.5,
			rotationX: 2,
			rotationY: -2
		},
		{
			imageUrl: `/images/parallax-apps/blue-wallet.png`,
			x: 230,
			y: -180,
			size: 0.5,
			rotationX: -2,
			rotationY: 2
		},
		{
			imageUrl: `/images/parallax-apps/breezy.png`,
			x: -230,
			y: 180,
			size: 0.5,
			rotationX: 1,
			rotationY: -1
		},
		{
			imageUrl: `/images/parallax-apps/grimoire.svg`,
			x: 230,
			y: 180,
			size: 0.5,
			rotationX: -1,
			rotationY: 1
		},
		{
			imageUrl: `/images/parallax-apps/vendata.svg`,
			x: 0,
			y: -190,
			size: 0.5,
			rotationX: 1,
			rotationY: -1
		}
	];

	// Calculate parallax speed based on size
	// Larger icons move faster (closer to viewer), smaller icons move slower (farther away)
	/** @param {number} size */
	function calculateParallaxSpeed(size) {
		// Map size (0.5-2.8) to parallax speed (0.15-0.9)
		// Linear interpolation: larger = faster parallax
		const minSize = 0.5;
		const maxSize = 2.8;
		const minSpeed = 0.15;
		const maxSpeed = 0.9;
		const normalizedSize = Math.max(minSize, Math.min(maxSize, size));
		const speed =
			minSpeed + ((normalizedSize - minSize) / (maxSize - minSize)) * (maxSpeed - minSpeed);
		return speed;
	}

	// Calculate opacity based on size
	// Smaller icons get less opacity (min 33%)
	/** @param {number} size */
	function calculateOpacity(size) {
		// Map size (0.5-2.8) to opacity (0.33-1.0)
		// Linear interpolation: smaller = less opacity
		const minSize = 0.5;
		const maxSize = 2.8;
		const minOpacity = 0.33;
		const maxOpacity = 1.0;
		const normalizedSize = Math.max(minSize, Math.min(maxSize, size));
		const opacity =
			minOpacity + ((normalizedSize - minSize) / (maxSize - minSize)) * (maxOpacity - minOpacity);
		return opacity;
	}

	// Calculate blur based on size
	// Base size is 1.9 (no blur)
	// Same blur factor for both larger and smaller sizes
	/** @param {number} size */
	function calculateBlur(size) {
		const baseSize = 1.9;
		const sizeDifference = Math.abs(size - baseSize);
		// Use same factor for both directions: 1.2px blur per unit difference
		return sizeDifference * 1.2;
	}

	$: iconPositions = iconConfigs.map((config) => {
		return {
			...config,
			parallaxSpeed: calculateParallaxSpeed(config.size),
			opacity: calculateOpacity(config.size),
			blur: calculateBlur(config.size)
		};
	});

	function handleResize() {
		windowWidth = window.innerWidth;
	}

	function handleScroll() {
		if (heroElement) {
			// When a modal is open, body scroll is locked and dataset.scrollY holds the saved position
			const bodyScrollY = document.body.dataset.scrollY;
			if (bodyScrollY !== undefined) {
				scrollY = parseInt(bodyScrollY, 10);
			} else {
				scrollY = window.scrollY;
			}
		}
	}

	function markImageLoaded(/** @type {string} */ url) {
		if (parallaxHeroLoadedUrls.has(url)) return;
		parallaxHeroLoadedUrls.add(url);
		loadedImages = { ...loadedImages, [url]: true };
	}

	onMount(() => {
		// Restore "already loaded" from session so back navigation shows no skeletons (local-first)
		const uniqueUrls = [...new Set(iconConfigs.map((c) => c.imageUrl))];
		/** @type {{ [url: string]: boolean }} */
		const initial = {};
		for (const url of uniqueUrls) {
			if (parallaxHeroLoadedUrls.has(url)) initial[url] = true;
		}
		if (Object.keys(initial).length > 0) {
			loadedImages = { ...loadedImages, ...initial };
		}

		// Probe cache: if image is already cached (e.g. SW or HTTP cache), mark loaded immediately
		for (const url of uniqueUrls) {
			if (parallaxHeroLoadedUrls.has(url)) continue;
			const img = new Image();
			img.onload = () => markImageLoaded(url);
			img.src = url;
			if (img.complete) markImageLoaded(url);
		}

		window.addEventListener('scroll', handleScroll, { passive: true });
		window.addEventListener('resize', handleResize, { passive: true });
		handleScroll();
		handleResize();
		return () => {
			window.removeEventListener('scroll', handleScroll);
			window.removeEventListener('resize', handleResize);
		};
	});
</script>

<svelte:head>
	{#each preloadImages as src}
		<link
			rel="preload"
			href={src}
			as="image"
			type={src.endsWith('.svg') ? 'image/svg+xml' : 'image/png'}
		/>
	{/each}
</svelte:head>

<section
	bind:this={heroElement}
	class="relative h-[500px] sm:h-[480px] md:h-[520px] lg:h-[560px] flex items-center justify-center overflow-hidden"
	style="perspective: 2000px; perspective-origin: center center;"
>
	<!-- Background gradient orbs -->
	<div
		class="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] gradient-orb"
		style="background-color: hsl(var(--primary) / 0.09); filter: blur(280px);"
	></div>
	<div
		class="absolute top-40 right-1/3 w-[400px] h-[400px] gradient-orb bg-primary/10"
		style="filter: blur(120px); animation-delay: -4s;"
	></div>
	<div
		class="absolute bottom-0 right-0 w-[500px] h-[500px] gradient-orb bg-primary/15"
		style="filter: blur(140px); animation-delay: -2s;"
	></div>

	<!-- Left gradient fade -->
	<div
		class="hidden md:block absolute left-0 top-0 bottom-0 w-24 sm:w-32 md:w-48 lg:w-64 xl:w-80 z-20 pointer-events-none"
		style="background: linear-gradient(to right, hsl(var(--background) / 0.7) 0%, hsl(var(--background) / 0.5) 20%, hsl(var(--background) / 0.25) 50%, transparent 100%);"
	></div>

	<!-- Right gradient fade -->
	<div
		class="hidden md:block absolute right-0 top-0 bottom-0 w-24 sm:w-32 md:w-48 lg:w-64 xl:w-80 z-20 pointer-events-none"
		style="background: linear-gradient(to left, hsl(var(--background) / 0.7) 0%, hsl(var(--background) / 0.5) 20%, hsl(var(--background) / 0.25) 50%, transparent 100%);"
	></div>

	<!-- App icons with parallax - positioned relative to center -->
	<!-- On mobile, fixed height container keeps icons in place when section grows -->
	<div
		class="absolute left-0 right-0 top-0 h-[490px] sm:h-full pointer-events-none"
		style="transform-style: preserve-3d;"
	>
		{#each iconPositions as iconData, index}
			{@const parallaxOffset = -scrollY * iconData.parallaxSpeed}
			{@const cappedWidth = Math.min(windowWidth, 1440)}
			{@const baseSize = Math.max(30, (cappedWidth / 100) * 3.5)}
			{@const scaledSize = baseSize * iconData.size}
			{@const borderRadius = baseSize * 0.24}
			<!-- Horizontal scaling: slight boost on mobile for centering -->
			{@const baseXFactor = 0.6}
			{@const mobileBoost = windowWidth < 768 ? (1 - windowWidth / 768) * 0.15 : 0}
			{@const xFactor = baseXFactor + mobileBoost}
			{@const positionScaleX = 1.0 + (cappedWidth / 1920 - 1) * xFactor}
			<!-- Vertical scaling: compression toward vertical center -->
			{@const yFactor = 0.5}
			{@const positionScaleY = 1.0 + (cappedWidth / 1920 - 1) * yFactor}
			<!-- Mobile adjustments for featured icons: top two closer, bottom two more centered -->
			{@const isTopFeatured = index === 0 || index === 1}
			{@const isBottomFeatured = index === 2 || index === 3}
			{@const isGrimoire = index === 2}
			{@const isPrimal = index === 4}
			{@const isMiddle = index === 5 || index === 6}
			{@const mobileOffsetX =
				windowWidth < 640
					? isTopFeatured
						? iconData.x > 0
							? -50
							: 50
						: isGrimoire
							? 75
							: isBottomFeatured
								? iconData.x > 0
									? -65
									: 65
								: isMiddle
									? iconData.x > 0
										? -20
										: 20
									: 0
					: 0}
			{@const mobileOffsetY =
				windowWidth < 640
					? isTopFeatured
						? -30
						: isPrimal
							? -30
							: isGrimoire
								? -15
								: isMiddle
									? -12
									: 0
					: 0}
			{@const scaledX = iconData.x * positionScaleX + mobileOffsetX}
			{@const scaledY = iconData.y * positionScaleY + mobileOffsetY}
			{@const thicknessSpread = 1}
			{@const thicknessOffsetMultiplier = Math.max(8, (windowWidth / 100) * 0.6)}
			{@const thicknessOffsetX =
				Math.sin((iconData.rotationY * Math.PI) / 180) * thicknessOffsetMultiplier}
			{@const thicknessOffsetY =
				-Math.sin((iconData.rotationX * Math.PI) / 180) * thicknessOffsetMultiplier}
			{@const translateZ =
				iconData.size > 2.0
					? 150
					: iconData.size > 1.5
						? 120
						: iconData.size > 1.0
							? 100
							: iconData.size > 0.8
								? 0
								: -100}
			<div
				class="absolute flex items-center justify-center"
				style="
          left: 50%;
          top: 50%;
          transform: 
            translate(-50%, -50%)
            translateX({scaledX}px)
            translateY({parallaxOffset + scaledY}px)
            translateZ({translateZ}px)
            rotateX({iconData.rotationX}deg)
            rotateY({iconData.rotationY}deg)
            scale({iconData.size});
          transform-style: preserve-3d;
          opacity: {iconData.opacity};
          filter: blur({iconData.blur}px);
        "
			>
				<!-- Icon image with thickness shadow - maintain 2D appearance -->
				<div
					class="relative overflow-hidden border-subtle"
					style="
            width: {baseSize}px;
            height: {baseSize}px;
            border-radius: {borderRadius}px;
            transform: translateZ(0);
            transform-style: preserve-3d;
            box-shadow: {thicknessOffsetX}px {thicknessOffsetY}px 0 {thicknessSpread}px hsl(var(--white8));
          "
				>
					<!-- Skeleton loader while image loads (skipped when cached or already loaded this session) -->
					{#if !loadedImages[iconData.imageUrl]}
						<div class="absolute inset-0 overflow-hidden">
							<SkeletonLoader />
						</div>
					{/if}
					<img
						src={iconData.imageUrl}
						alt="App icon"
						decoding="async"
						fetchpriority={index < 6 ? 'high' : 'low'}
						class="w-full h-full object-cover transition-opacity duration-300"
						class:opacity-0={!loadedImages[iconData.imageUrl]}
						style="
              backface-visibility: hidden;
              transform: translateZ(0);
            "
						on:load={() => markImageLoaded(iconData.imageUrl)}
					/>
				</div>
			</div>
		{/each}
	</div>

	<!-- Central text -->
	<div class="relative z-10 text-center px-4 -mt-2 sm:mt-0">
		<h1 class="text-display-lg text-5xl sm:text-6xl lg:text-7xl xl:text-8xl leading-tight mb-6">
			<span
				style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;"
			>
				Apps.
			</span>
			<br />
			<span
				style="background: var(--gradient-blurple-light); -webkit-background-clip: text; background-clip: text; color: transparent;"
			>
				Released.
			</span>
		</h1>
		<p class="text-lg sm:text-xl text-muted-foreground max-w-[260px] sm:max-w-none mx-auto mb-8">
			Zapstore is the first truly open app store
		</p>
		<a
			href="/discover"
			bind:this={heroButton}
			class="btn-glass-large btn-glass-with-chevron flex items-center group"
			on:mousemove={handleMouseMove}
		>
			Discover Apps
			<ChevronRight
				variant="outline"
				color="hsl(var(--white33))"
				size={18}
				className="transition-transform group-hover:translate-x-0.5"
			/>
		</a>
	</div>

	<!-- Studio button anchored to bottom -->
	<a
		href="/studio"
		bind:this={devButton}
		on:mousemove={handleDevButtonMouseMove}
		class="dev-button-bottom btn-glass-small btn-glass-blurple-hover flex items-center justify-center gap-2 group"
	>
		<span class="btn-text-white">For Developers</span>
		<ChevronRight
			variant="outline"
			color="hsl(var(--white33))"
			size={14}
			className="transition-transform group-hover:translate-x-0.5"
		/>
	</a>
</section>

<style>
	.gradient-orb {
		border-radius: 50%;
		filter: blur(80px);
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

	.dev-button-bottom {
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		z-index: 20;
		height: 48px !important;
		width: 360px !important;
		padding-bottom: 1px !important;
		font-size: 1rem;
		background-color: rgb(0 0 0 / 0.33) !important;
		border-top-left-radius: 24px !important;
		border-top-right-radius: 24px !important;
		border-bottom-left-radius: 0 !important;
		border-bottom-right-radius: 0 !important;
		border-bottom: none !important;
	}

	.dev-button-bottom:hover {
		transform: translateX(-50%) scale(1.04);
	}

	.dev-button-bottom:active {
		transform: translateX(-50%) scale(0.98);
	}

	@media (max-width: 639px) {
		.dev-button-bottom {
			width: 100% !important;
			left: 0;
			transform: none;
			border-radius: 0 !important;
			border-top-left-radius: 0 !important;
			border-top-right-radius: 0 !important;
			border-left: none !important;
			border-right: none !important;
			background-color: rgb(0 0 0 / 0.33) !important;
		}

		.dev-button-bottom:hover {
			transform: none;
		}

		.dev-button-bottom:active {
			transform: none;
		}
	}

	.btn-text-white {
		transition: color 0.3s ease;
		color: hsl(var(--white66));
	}

	.dev-button-bottom:hover .btn-text-white {
		color: hsl(var(--foreground));
	}

	/* Blurple glass button - hover only variant */
	.btn-glass-blurple-hover {
		background-color: rgb(0 0 0 / 0.33);
		border-radius: 10px;
		transition:
			transform 0.2s ease,
			border-color 0.3s ease,
			box-shadow 0.3s ease,
			background 0.3s ease,
			color 0.3s ease;
	}

	.btn-glass-blurple-hover:hover {
		background: radial-gradient(
			circle at top left,
			rgb(92 95 255 / 0.08) 0%,
			rgb(69 66 255 / 0.08) 100%
		);
		border-color: rgb(92 95 255 / 0.25);
		box-shadow:
			0 0 40px rgb(92 95 255 / 0.15),
			0 0 80px rgb(92 95 255 / 0.08);
		color: hsl(var(--foreground));
	}

	.btn-glass-blurple-hover::before {
		background: radial-gradient(circle, rgb(92 95 255 / 0.12) 0%, transparent 70%);
	}
</style>
