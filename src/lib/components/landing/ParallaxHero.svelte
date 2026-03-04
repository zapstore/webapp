<script>
	import { ChevronRight, Download } from '$lib/components/icons';

	/** @type {() => void} */
	export let showDownloadModal = () => {};

	/** @type {HTMLAnchorElement | null} */
	let heroButton = null;
	/** @type {HTMLButtonElement | null} */
	let devButton = null;

	/** @param {MouseEvent} event */
	function handleMouseMove(event) {
		if (!heroButton) return;
		const rect = heroButton.getBoundingClientRect();
		heroButton.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
		heroButton.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
	}

	/** @param {MouseEvent} event */
	function handleDevButtonMouseMove(event) {
		if (!devButton) return;
		const rect = devButton.getBoundingClientRect();
		devButton.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
		devButton.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
	}
</script>

<section
	class="relative h-[280px] sm:h-[300px] md:h-[330px] lg:h-[360px] flex items-center justify-center overflow-hidden"
>
	<!-- SVG signal-path background -->
	<div class="absolute inset-0 pointer-events-none" aria-hidden="true" style="opacity: 0.45;">
		<svg
			class="signal-svg"
			viewBox="0 0 1200 600"
			preserveAspectRatio="xMidYMid slice"
			xmlns="http://www.w3.org/2000/svg"
		>
			<defs>
				<!-- Blurple gradient for active paths -->
				<linearGradient id="sg-blurple" x1="0%" y1="0%" x2="100%" y2="0%">
					<stop offset="0%" stop-color="#777afe" stop-opacity="0" />
					<stop offset="40%" stop-color="#777afe" stop-opacity="0.9" />
					<stop offset="100%" stop-color="#5d5aff" stop-opacity="0.5" />
				</linearGradient>
				<linearGradient id="sg-blurple-r" x1="100%" y1="0%" x2="0%" y2="0%">
					<stop offset="0%" stop-color="#777afe" stop-opacity="0" />
					<stop offset="40%" stop-color="#777afe" stop-opacity="0.9" />
					<stop offset="100%" stop-color="#5d5aff" stop-opacity="0.5" />
				</linearGradient>
				<linearGradient id="sg-blurple-d" x1="0%" y1="0%" x2="0%" y2="100%">
					<stop offset="0%" stop-color="#777afe" stop-opacity="0" />
					<stop offset="50%" stop-color="#777afe" stop-opacity="0.8" />
					<stop offset="100%" stop-color="#5d5aff" stop-opacity="0.3" />
				</linearGradient>
				<!-- Dim grid gradient -->
				<linearGradient id="sg-grid-fade" x1="0%" y1="0%" x2="0%" y2="100%">
					<stop offset="0%" stop-color="white" stop-opacity="0.04" />
					<stop offset="60%" stop-color="white" stop-opacity="0.04" />
					<stop offset="100%" stop-color="white" stop-opacity="0" />
				</linearGradient>
				<!-- Glow filter for nodes -->
				<filter id="sg-glow" x="-50%" y="-50%" width="200%" height="200%">
					<feGaussianBlur stdDeviation="3" result="blur" />
					<feMerge>
						<feMergeNode in="blur" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
				<filter id="sg-glow-strong" x="-100%" y="-100%" width="300%" height="300%">
					<feGaussianBlur stdDeviation="6" result="blur" />
					<feMerge>
						<feMergeNode in="blur" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
				<!-- Radial fade mask so edges dissolve -->
				<radialGradient id="sg-mask-grad" cx="50%" cy="50%" r="55%">
					<stop offset="30%" stop-color="white" stop-opacity="1" />
					<stop offset="100%" stop-color="white" stop-opacity="0" />
				</radialGradient>
				<mask id="sg-mask">
					<rect width="1200" height="600" fill="url(#sg-mask-grad)" />
				</mask>
			</defs>

			<g mask="url(#sg-mask)">
				<!-- -- Background grid -- -->
				<!-- Vertical lines -->
				{#each Array.from({ length: 13 }, (_, i) => i) as i (i)}
					<line
						x1={i * 100}
						y1="0"
						x2={i * 100}
						y2="600"
						stroke="url(#sg-grid-fade)"
						stroke-width="0.5"
					/>
				{/each}
				<!-- Horizontal lines -->
				{#each Array.from({ length: 7 }, (_, i) => i) as i (i)}
					<line
						x1="0"
						y1={i * 100}
						x2="1200"
						y2={i * 100}
						stroke="white"
						stroke-opacity="0.03"
						stroke-width="0.5"
					/>
				{/each}

				<!-- -- Signal paths (circuit traces) -- -->
				<!-- Left cluster → center hub -->
				<path
					class="signal-path path-l1"
					d="M 80 180 H 260 V 300 H 520"
					fill="none"
					stroke="url(#sg-blurple)"
					stroke-width="1.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<path
					class="signal-path path-l2"
					d="M 80 420 H 200 V 300 H 520"
					fill="none"
					stroke="url(#sg-blurple)"
					stroke-width="1.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<path
					class="signal-path path-l3"
					d="M 0 300 H 520"
					fill="none"
					stroke="url(#sg-blurple)"
					stroke-width="1.5"
					stroke-linecap="round"
				/>

				<!-- Right cluster ← center hub -->
				<path
					class="signal-path path-r1"
					d="M 1120 180 H 940 V 300 H 680"
					fill="none"
					stroke="url(#sg-blurple-r)"
					stroke-width="1.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<path
					class="signal-path path-r2"
					d="M 1120 420 H 1000 V 300 H 680"
					fill="none"
					stroke="url(#sg-blurple-r)"
					stroke-width="1.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
				<path
					class="signal-path path-r3"
					d="M 1200 300 H 680"
					fill="none"
					stroke="url(#sg-blurple-r)"
					stroke-width="1.5"
					stroke-linecap="round"
				/>

				<!-- Top/bottom feeders into hub -->
				<path
					class="signal-path path-t1"
					d="M 600 0 V 260"
					fill="none"
					stroke="url(#sg-blurple-d)"
					stroke-width="1.2"
					stroke-linecap="round"
				/>
				<path
					class="signal-path path-b1"
					d="M 600 600 V 340"
					fill="none"
					stroke="url(#sg-blurple-d)"
					stroke-width="1.2"
					stroke-linecap="round"
				/>

				<!-- -- Animated signal pulses (travel along paths) -- -->
				<!-- Left pulses -->
				<circle class="pulse pulse-l1" r="3" fill="#8380ff" filter="url(#sg-glow)">
					<animateMotion dur="3.2s" repeatCount="indefinite" begin="0s">
						<mpath href="#mp-l1" />
					</animateMotion>
				</circle>
				<circle class="pulse pulse-l2" r="2.5" fill="#777afe" filter="url(#sg-glow)">
					<animateMotion dur="3.8s" repeatCount="indefinite" begin="-1.4s">
						<mpath href="#mp-l2" />
					</animateMotion>
				</circle>
				<circle class="pulse pulse-l3" r="3.5" fill="#9b99ff" filter="url(#sg-glow-strong)">
					<animateMotion dur="2.8s" repeatCount="indefinite" begin="-0.7s">
						<mpath href="#mp-l3" />
					</animateMotion>
				</circle>

				<!-- Right pulses -->
				<circle class="pulse pulse-r1" r="3" fill="#8380ff" filter="url(#sg-glow)">
					<animateMotion dur="3.4s" repeatCount="indefinite" begin="-0.5s">
						<mpath href="#mp-r1" />
					</animateMotion>
				</circle>
				<circle class="pulse pulse-r2" r="2.5" fill="#777afe" filter="url(#sg-glow)">
					<animateMotion dur="4s" repeatCount="indefinite" begin="-2s">
						<mpath href="#mp-r2" />
					</animateMotion>
				</circle>
				<circle class="pulse pulse-r3" r="3.5" fill="#9b99ff" filter="url(#sg-glow-strong)">
					<animateMotion dur="3s" repeatCount="indefinite" begin="-1.2s">
						<mpath href="#mp-r3" />
					</animateMotion>
				</circle>

				<!-- Top/bottom pulses -->
				<circle class="pulse" r="2.5" fill="#8380ff" filter="url(#sg-glow)">
					<animateMotion dur="2.4s" repeatCount="indefinite" begin="-0.3s">
						<mpath href="#mp-t1" />
					</animateMotion>
				</circle>
				<circle class="pulse" r="2.5" fill="#8380ff" filter="url(#sg-glow)">
					<animateMotion dur="2.6s" repeatCount="indefinite" begin="-1.8s">
						<mpath href="#mp-b1" />
					</animateMotion>
				</circle>

				<!-- Motion paths (invisible, referenced by animateMotion) -->
				<defs>
					<path id="mp-l1" d="M 80 180 H 260 V 300 H 520" />
					<path id="mp-l2" d="M 80 420 H 200 V 300 H 520" />
					<path id="mp-l3" d="M 0 300 H 520" />
					<path id="mp-r1" d="M 1120 180 H 940 V 300 H 680" />
					<path id="mp-r2" d="M 1120 420 H 1000 V 300 H 680" />
					<path id="mp-r3" d="M 1200 300 H 680" />
					<path id="mp-t1" d="M 600 0 V 260" />
					<path id="mp-b1" d="M 600 600 V 340" />
				</defs>

				<!-- -- Hub ring (center) -- -->
				<circle
					cx="600"
					cy="300"
					r="52"
					fill="none"
					stroke="#5d5aff"
					stroke-opacity="0.08"
					stroke-width="0.5"
				/>
				<circle
					cx="600"
					cy="300"
					r="38"
					fill="none"
					stroke="#5d5aff"
					stroke-opacity="0.1"
					stroke-width="0.5"
				/>
				<circle
					cx="600"
					cy="300"
					r="26"
					fill="none"
					stroke="#777afe"
					stroke-opacity="0.14"
					stroke-width="0.5"
				/>
				<circle
					cx="600"
					cy="300"
					r="16"
					fill="#5d5aff"
					fill-opacity="0.06"
					stroke="#8380ff"
					stroke-opacity="0.28"
					stroke-width="0.8"
					filter="url(#sg-glow)"
				/>
				<!-- Hub center dot — larger, more transparent -->
				<circle
					cx="600"
					cy="300"
					r="7"
					fill="#c4c2ff"
					fill-opacity="0.55"
					filter="url(#sg-glow-strong)"
				>
					<animate attributeName="r" values="6;9;6" dur="3s" repeatCount="indefinite" />
					<animate
						attributeName="fill-opacity"
						values="0.45;0.65;0.45"
						dur="3s"
						repeatCount="indefinite"
					/>
				</circle>

				<!-- -- Endpoint nodes -- -->
				<!-- Left endpoints -->
				<circle
					cx="80"
					cy="180"
					r="5"
					fill="#5d5aff"
					fill-opacity="0.15"
					stroke="#777afe"
					stroke-opacity="0.5"
					stroke-width="0.8"
					filter="url(#sg-glow)"
				/>
				<circle cx="80" cy="180" r="2" fill="#9b99ff" />
				<circle
					cx="80"
					cy="420"
					r="5"
					fill="#5d5aff"
					fill-opacity="0.15"
					stroke="#777afe"
					stroke-opacity="0.5"
					stroke-width="0.8"
					filter="url(#sg-glow)"
				/>
				<circle cx="80" cy="420" r="2" fill="#9b99ff" />

				<!-- Right endpoints -->
				<circle
					cx="1120"
					cy="180"
					r="5"
					fill="#5d5aff"
					fill-opacity="0.15"
					stroke="#777afe"
					stroke-opacity="0.5"
					stroke-width="0.8"
					filter="url(#sg-glow)"
				/>
				<circle cx="1120" cy="180" r="2" fill="#9b99ff" />
				<circle
					cx="1120"
					cy="420"
					r="5"
					fill="#5d5aff"
					fill-opacity="0.15"
					stroke="#777afe"
					stroke-opacity="0.5"
					stroke-width="0.8"
					filter="url(#sg-glow)"
				/>
				<circle cx="1120" cy="420" r="2" fill="#9b99ff" />

				<!-- Junction nodes (path bends) -->
				<circle
					cx="260"
					cy="180"
					r="3"
					fill="#5d5aff"
					fill-opacity="0.2"
					stroke="#777afe"
					stroke-opacity="0.4"
					stroke-width="0.6"
				/>
				<circle
					cx="260"
					cy="300"
					r="3"
					fill="#5d5aff"
					fill-opacity="0.2"
					stroke="#777afe"
					stroke-opacity="0.4"
					stroke-width="0.6"
				/>
				<circle
					cx="200"
					cy="420"
					r="3"
					fill="#5d5aff"
					fill-opacity="0.2"
					stroke="#777afe"
					stroke-opacity="0.4"
					stroke-width="0.6"
				/>
				<circle
					cx="200"
					cy="300"
					r="3"
					fill="#5d5aff"
					fill-opacity="0.2"
					stroke="#777afe"
					stroke-opacity="0.4"
					stroke-width="0.6"
				/>
				<circle
					cx="940"
					cy="180"
					r="3"
					fill="#5d5aff"
					fill-opacity="0.2"
					stroke="#777afe"
					stroke-opacity="0.4"
					stroke-width="0.6"
				/>
				<circle
					cx="940"
					cy="300"
					r="3"
					fill="#5d5aff"
					fill-opacity="0.2"
					stroke="#777afe"
					stroke-opacity="0.4"
					stroke-width="0.6"
				/>
				<circle
					cx="1000"
					cy="420"
					r="3"
					fill="#5d5aff"
					fill-opacity="0.2"
					stroke="#777afe"
					stroke-opacity="0.4"
					stroke-width="0.6"
				/>
				<circle
					cx="1000"
					cy="300"
					r="3"
					fill="#5d5aff"
					fill-opacity="0.2"
					stroke="#777afe"
					stroke-opacity="0.4"
					stroke-width="0.6"
				/>
			</g>
		</svg>
	</div>

	<!-- Soft radial glow behind text -->
	<div
		class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] pointer-events-none"
		style="background: radial-gradient(ellipse, hsl(var(--blurpleColor) / 0.07) 0%, transparent 70%); filter: blur(40px);"
	></div>

	<!-- Central text -->
	<div class="relative z-10 text-center px-4">
		<h1 class="text-display-lg text-4xl sm:text-5xl lg:text-6xl xl:text-7xl leading-tight mb-4">
			<span
				style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;"
			>
				You shouldn't need
			</span>
			<br />
			<span
				style="background: var(--gradient-white-blurple); -webkit-background-clip: text; background-clip: text; color: transparent;"
			>
				permission
			</span>
			<span
				style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;"
			>
				to use apps.
			</span>
		</h1>
		<p
			class="text-base sm:text-lg text-muted-foreground max-w-[360px] sm:max-w-[560px] mx-auto mb-7"
		>
			Self-published by developers, curated by communities.
		</p>
		<div class="flex items-center justify-center gap-2 sm:gap-3">
			<a
				href="/discover"
				bind:this={heroButton}
				class="btn-glass-large btn-glass-with-chevron flex items-center group"
				on:mousemove={handleMouseMove}
			>
				Browse 3,000+ apps
				<ChevronRight
					variant="outline"
					color="hsl(var(--white33))"
					size={18}
					className="transition-transform group-hover:translate-x-0.5"
				/>
			</a>
			<button
				type="button"
				bind:this={devButton}
				on:mousemove={handleDevButtonMouseMove}
				on:click={showDownloadModal}
				class="btn-glass-large btn-glass-blurple-hover flex items-center justify-center gap-2 group"
			>
				<Download variant="fill" color="hsl(var(--white33))" size={16} />
				<span class="btn-text-white">Download</span>
				<span class="platform-badge">Android</span>
			</button>
		</div>
	</div>
</section>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 

<style>
	.platform-badge {
		font-size: 0.625rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: hsl(var(--white33));
		background: hsl(var(--white8));
		border: 1px solid hsl(var(--white11));
		border-radius: 4px;
		padding: 1px 5px;
		line-height: 1.4;
		flex-shrink: 0;
	}

	@media (max-width: 400px) {
		.platform-badge {
			display: none;
		}
	}

	.signal-svg {
		width: 100%;
		height: 100%;
		display: block;
	}

	/* Subtle fade-in on mount */
	.signal-svg {
		animation: svg-fadein 1.2s ease both;
	}

	@keyframes svg-fadein {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* Reduce motion: freeze pulses */
	@media (prefers-reduced-motion: reduce) {
		.pulse {
			display: none;
		}
	}

	.btn-text-white {
		transition: color 0.3s ease;
		color: hsl(var(--white66));
	}

	.btn-glass-blurple-hover:hover .btn-text-white {
		color: hsl(var(--foreground));
	}

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
