<script>
	import { onMount } from 'svelte';
	import { assets } from '$app/paths';

	let mounted = false;

	onMount(() => {
		requestAnimationFrame(() => {
			mounted = true;
		});
	});
</script>

<!-- Fixed height: lower on mobile; higher on desktop -->
<section
	class="studio-hero relative h-[440px] sm:h-[640px] md:h-[700px] lg:h-[720px] xl:h-[760px] overflow-hidden flex flex-col"
>
	<!-- Header + CTA (desktop only); centered on mobile, left on desktop -->
	<div
		class="studio-hero-header container mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-12 lg:pt-16 flex-shrink-0 flex flex-col sm:flex-row sm:items-start sm:justify-between sm:gap-8 text-center sm:text-left"
	>
		<div class="mx-auto sm:mx-0 max-w-lg">
			<h1
				class="text-display-lg text-4xl sm:text-4xl lg:text-5xl xl:text-6xl leading-tight mb-3 sm:mb-4 mx-auto sm:mx-0 max-w-lg"
			>
				<span
					style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;"
				>
					A purpose-built
				</span>
				<br />
				<span
					style="background: var(--gradient-blurple-light); -webkit-background-clip: text; background-clip: text; color: transparent;"
				>
					developer suite
				</span>
			</h1>
			<p
				class="text-lg sm:text-xl text-muted-foreground max-w-lg mb-6 sm:mb-8 lg:mb-10 leading-relaxed mx-auto sm:mx-0"
			>
				Reliable tools for shipping apps and interacting<br class="hidden sm:block" /> with communities
				of users.
			</p>
		</div>
	</div>

	<!-- Screenshots: fixed to bottom of section; only section clips (no overflow here) -->
	<div class="studio-screenshots-clip pt-2 sm:pt-4 lg:pt-8">
		<div
			class="container mx-auto px-4 sm:px-6 lg:px-8 relative studio-screenshots-container h-full"
		>
			<div class="studio-screenshots-wrapper">
				<!-- Desktop - full width, 3D tilt -->
				<div class="screenshot-desktop {mounted ? 'screenshot-visible' : ''}">
					<img
						src={`${assets}/images/studio-screenshot.png`}
						alt="Zapstore Studio desktop preview"
						class="studio-desktop-img"
						loading="lazy"
					/>
				</div>

				<!-- Mobile - phone image (drawn first so terminal can sit on top) -->
				<div class="screenshot-mobile {mounted ? 'screenshot-visible' : ''}">
					<img
						src={`${assets}/images/studio-mobile.png`}
						alt="Zapstore Studio on mobile"
						class="studio-mobile-img"
						loading="lazy"
					/>
				</div>

				<!-- CLI - custom terminal (after mobile in DOM + translateZ so it's in front in 3D) -->
				<div class="screenshot-cli {mounted ? 'screenshot-visible' : ''}">
					<div class="terminal-glow">
					<div class="terminal-window">
						<div class="terminal-header">
							<span class="terminal-dot terminal-dot-red"></span>
							<span class="terminal-dot terminal-dot-yellow"></span>
							<span class="terminal-dot terminal-dot-green"></span>
							<span class="terminal-title">zsp</span>
						</div>
						<div class="terminal-body">
							<div class="terminal-line">
								<span class="terminal-prompt">$</span>
								<span class="terminal-cmd">zsp publish ./my-app</span>
							</div>
							<div class="terminal-line terminal-output">
								<span class="terminal-success">✓</span> Building app...
							</div>
							<div class="terminal-line terminal-output">
								<span class="terminal-success">✓</span> Pushing to Zapstore...
							</div>
							<div class="terminal-line terminal-output">
								<span class="terminal-success">✓</span> Published
								<span class="terminal-muted">naddr1qq...</span>
							</div>
							<div class="terminal-line">
								<span class="terminal-prompt">$</span>
								<span class="terminal-cursor">_</span>
							</div>
						</div>
					</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	.studio-hero {
		padding-bottom: 0;
	}

	/* 3D area fixed to bottom of section; overflow only on section so nothing clips the slide-in */
	.studio-screenshots-clip {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 58%;
		overflow: visible;
	}

	@media (min-width: 640px) {
		.studio-screenshots-clip {
			height: 60%;
		}
	}

	@media (min-width: 1024px) {
		.studio-screenshots-clip {
			height: 62%;
		}
	}

	.studio-screenshots-container {
		perspective: 800px;
		overflow: visible;
	}

	/* Wrapper: tall so 3D content is not clipped at top; clip happens at section (.studio-screenshots-clip) bottom */
	.studio-screenshots-wrapper {
		position: relative;
		min-height: 380px;
		transform-style: preserve-3d;
		overflow: visible;
	}

	@media (min-width: 640px) {
		.studio-screenshots-wrapper {
			min-height: 480px;
		}
	}

	@media (min-width: 768px) {
		.studio-screenshots-wrapper {
			min-height: 560px;
		}
	}

	@media (min-width: 1024px) {
		.studio-screenshots-wrapper {
			min-height: 640px;
		}
	}

	@media (min-width: 1280px) {
		.studio-screenshots-wrapper {
			min-height: 720px;
		}
	}

	/* Base: absolute positioning + 3D; all fade in together */
	.screenshot-desktop,
	.screenshot-mobile,
	.screenshot-cli {
		position: absolute;
		opacity: 0;
		transition: opacity 1.25s cubic-bezier(0.33, 0, 0.2, 1);
		transform-style: preserve-3d;
	}

	.screenshot-visible {
		opacity: 1;
	}

	/* Desktop */
	.screenshot-desktop {
		left: -2%;
		right: 2%;
		top: 56px;
		z-index: 3;
		transform: rotateY(12deg) rotateX(4deg) rotateZ(-8deg) translateX(-1%);
		transform-origin: left center;
	}

	.studio-desktop-img {
		width: 100%;
		height: auto;
		max-height: none;
		display: block;
		aspect-ratio: 16 / 9;
		object-fit: contain;
	}

	/* Phone – push back in 3D; desktop: higher (small top offset) and wider */
	.screenshot-mobile {
		right: 8%;
		top: 56px;
		z-index: 2;
		width: 185px;
		transform: rotateY(8deg) rotateX(2deg) rotateZ(-8deg) translateZ(-40px);
		transform-origin: right center;
	}

	/* CLI – in front of phone: translateZ pulls it forward in 3D; solid “frosted” bg (backdrop-filter fails with transformed ancestors) */
	.screenshot-cli {
		right: 22%;
		top: 146px;
		z-index: 10;
		width: 295px;
		transform: rotateY(6deg) rotateX(3deg) rotateZ(-8deg) translateZ(80px);
		transform-origin: right center;
	}

	.terminal-glow {
		border-radius: 10px;
		overflow: visible;
		box-shadow:
			0 0 80px 6px rgb(90 88 254 / 0.07),
			0 0 160px 14px rgb(90 88 254 / 0.05),
			0 0 280px 20px rgb(90 88 254 / 0.03),
			0 12px 40px rgb(0 0 0 / 0.35);
	}

	.terminal-window {
		background: hsl(240 10% 11% / 0.94);
		border-radius: 10px;
		border: 0.33px solid hsl(var(--white16));
		overflow: hidden;
	}

	.terminal-header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		background: hsl(240 8% 14% / 0.9);
		border-bottom: 0.33px solid hsl(var(--white11));
	}

	.terminal-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		opacity: 0.66;
	}

	.terminal-dot-red {
		background: var(--gradient-rouge);
	}

	.terminal-dot-yellow {
		background: var(--gradient-gold);
	}

	.terminal-dot-green {
		background: var(--gradient-green);
	}

	.terminal-title {
		margin-left: 8px;
		font-size: 12px;
		color: hsl(var(--white33));
	}

	.terminal-body {
		padding: 12px 14px;
		font-family: ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, monospace;
		font-size: 13px;
		line-height: 1.6;
	}

	.terminal-line {
		margin-bottom: 2px;
	}

	/* Terminal scales down on smaller screens (font, padding, dots, radius) */
	@media (max-width: 639px) {
		.terminal-window {
			border-radius: 6px;
		}

		.terminal-header {
			gap: 3px;
			padding: 5px 6px;
			border-bottom-width: 0.25px;
		}

		.terminal-dot {
			width: 6px;
			height: 6px;
		}

		.terminal-title {
			margin-left: 4px;
			font-size: 9px;
		}

		.terminal-body {
			padding: 5px 6px;
			font-size: 9px;
			line-height: 1.45;
		}

		.terminal-line {
			margin-bottom: 1px;
		}
	}

	@media (max-width: 480px) {
		.terminal-window {
			border-radius: 5px;
		}

		.terminal-header {
			gap: 2px;
			padding: 4px 5px;
		}

		.terminal-dot {
			width: 5px;
			height: 5px;
		}

		.terminal-title {
			margin-left: 3px;
			font-size: 8px;
		}

		.terminal-body {
			padding: 4px 5px;
			font-size: 8px;
			line-height: 1.4;
		}
	}

	.terminal-prompt {
		color: hsl(var(--blurpleColor));
		margin-right: 6px;
	}

	.terminal-cmd {
		color: hsl(var(--white));
	}

	.terminal-output {
		color: hsl(var(--white66));
		padding-left: 1.2em;
	}

	.terminal-success {
		color: #27c93f;
		margin-right: 6px;
	}

	.terminal-muted {
		color: hsl(var(--white33));
	}

	.terminal-cursor {
		color: hsl(var(--white));
		animation: blink 1s step-end infinite;
	}

	@keyframes blink {
		50% {
			opacity: 0;
		}
	}

	.screenshot-placeholder {
		background: hsl(var(--gray33));
		border: 1px dashed hsl(var(--white22));
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.studio-mobile-img {
		width: 100%;
		height: auto;
		display: block;
		object-fit: contain;
		border-radius: 20px;
		filter: drop-shadow(0 0 24px rgb(90 88 254 / 0.1)) drop-shadow(0 8px 24px rgb(0 0 0 / 0.3));
	}

	.screenshot-placeholder-mobile {
		width: 100%;
		height: 240px;
		border-radius: 20px;
	}

	.placeholder-label {
		font-size: 11px;
		color: hsl(var(--white33));
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	/* Responsive - phone slightly bigger at larger breakpoints; more right */
	@media (min-width: 640px) {
		.screenshot-mobile {
			width: 198px;
			right: 0;
			top: 20px;
		}

		.screenshot-placeholder-mobile {
			height: 300px;
		}

		.screenshot-cli {
			width: 335px;
			right: 24%;
			top: 166px;
			transform: rotateY(6deg) rotateX(3deg) rotateZ(-8deg) translateZ(80px);
		}
	}

	@media (min-width: 1024px) {
		.screenshot-mobile {
			width: 268px;
			right: 0;
			top: 12px;
			transform: rotateY(8deg) rotateX(2deg) rotateZ(-8deg) translateZ(-40px);
		}

		.screenshot-placeholder-mobile {
			height: 360px;
		}

		.screenshot-cli {
			width: 348px;
			right: 22%;
			top: 146px;
			transform: rotateY(6deg) rotateX(3deg) rotateZ(-8deg) translateZ(80px);
		}
	}

	/* Mobile: show all three; phone more right and higher; terminal narrower and scales smaller */
	@media (max-width: 639px) {
		.screenshot-desktop {
			top: 52px;
			left: 0;
			right: 6%;
			transform: rotateY(10deg) rotateX(3deg) rotateZ(-8deg) translateX(1%);
		}

		.screenshot-mobile {
			width: 128px;
			right: 2%;
			top: calc(1% + 52px);
			transform: rotateY(6deg) rotateX(2deg) rotateZ(-8deg) translateZ(-40px);
		}

		.screenshot-placeholder-mobile {
			height: 180px;
		}

		.screenshot-cli {
			width: 162px;
			right: 22%;
			top: 156px;
			transform: rotateY(5deg) rotateX(2deg) rotateZ(-8deg) translateZ(80px);
		}
	}
</style>
