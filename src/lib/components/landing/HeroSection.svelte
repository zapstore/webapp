<script>
	import { onMount, onDestroy, tick } from 'svelte';
	import '$lib/styles/landing-display.css';
	import { ChevronRight } from '$lib/components/icons';

	/** @type {HTMLAnchorElement | null} */
	let heroButton = null;

	/** @type {HTMLHeadingElement | null} */
	let h1Ref = null;

	/** @type {HTMLSpanElement | null} */
	let permissionBorderRef = null;

	/** Whether the mouse is within the proximity zone around the permission border */
	let showProximityCursor = false;

	/** Tracks mobile breakpoint for SVG radius and image count */
	let isMobile = false;
	/** @type {() => void} */
	let mqlCleanup = () => {};

	/** Fixed height captured once after mount so the layout never shifts */
	let h1MinHeight = 0;

	/**
	 * State machine for the flip easter egg:
	 *   default → imploding → transformed → restoring → returning → default
	 * @type {'default' | 'imploding' | 'transformed' | 'restoring' | 'returning'}
	 */
	let permissionState = 'default';

	/** @type {ReturnType<typeof setTimeout>[]} */
	let flipTimers = [];

	const allApps = [
		{ src: '/images/parallax-apps/zapstore.png', name: 'Zapstore' },
		{ src: '/images/parallax-apps/organic-maps.png', name: 'Organic Maps' },
		{ src: '/images/parallax-apps/mulvad.png', name: 'Mullvad' },
		{ src: '/images/parallax-apps/newpipe.png', name: 'NewPipe' },
		{ src: '/images/parallax-apps/antennapod.png', name: 'AntennaPod' }
	];

	onMount(async () => {
		const mql = window.matchMedia('(max-width: 639px)');
		isMobile = mql.matches;
		const onMqlChange = (/** @type {MediaQueryListEvent} */ e) => {
			isMobile = e.matches;
		};
		mql.addEventListener('change', onMqlChange);
		mqlCleanup = () => mql.removeEventListener('change', onMqlChange);

		await tick();
		if (h1Ref) {
			h1MinHeight = h1Ref.getBoundingClientRect().height;
		}
	});

	$: visibleApps = isMobile ? allApps.slice(0, 4) : allApps;

	function clearFlipTimers() {
		flipTimers.forEach(clearTimeout);
		flipTimers = [];
	}

	function handlePermissionClick() {
		if (permissionState !== 'default') return;
		clearFlipTimers();

		// ── Forward flip ─────────────────────────────────────────
		permissionState = 'imploding';

		flipTimers.push(
			setTimeout(() => {
				// Midpoint: swap to new text, flip back in
				permissionState = 'transformed';

				// ── Auto-reverse after 3 s ────────────────────────────
				flipTimers.push(
					setTimeout(() => {
						permissionState = 'restoring';

						flipTimers.push(
							setTimeout(() => {
								// Midpoint: swap back to original, flip back in
								permissionState = 'returning';

								flipTimers.push(
									setTimeout(() => {
										permissionState = 'default';
									}, 300)
								);
							}, 220)
						);
					}, 3000)
				);
			}, 220)
		);
	}

	onDestroy(() => {
		clearFlipTimers();
		mqlCleanup();
	});

	/** @param {KeyboardEvent} e */
	function handlePermissionKeydown(e) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handlePermissionClick();
		}
	}

	/** @param {MouseEvent} event */
	function handleSectionMouseMove(event) {
		if (!permissionBorderRef || permissionState !== 'default') {
			showProximityCursor = false;
			return;
		}
		const rect = permissionBorderRef.getBoundingClientRect();
		const prox = 32;
		showProximityCursor =
			event.clientX >= rect.left - prox &&
			event.clientX <= rect.right + prox &&
			event.clientY >= rect.top - prox &&
			event.clientY <= rect.bottom + prox &&
			!(
				event.clientX >= rect.left &&
				event.clientX <= rect.right &&
				event.clientY >= rect.top &&
				event.clientY <= rect.bottom
			);
	}

	/** @param {MouseEvent} event */
	function handleMouseMove(event) {
		if (!heroButton) return;
		const rect = heroButton.getBoundingClientRect();
		heroButton.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
		heroButton.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
	}
</script>

<section
	class="relative flex items-center justify-center overflow-hidden pt-12 pb-10 sm:pt-16 sm:pb-16 lg:pt-20 lg:pb-24"
	class:proximity-cursor={showProximityCursor}
	role="presentation"
	on:mousemove={handleSectionMouseMove}
	on:mouseleave={() => (showProximityCursor = false)}
>
	<div class="relative z-10 text-center px-4 hero-content">
		<!-- Perspective wrapper gives depth to the rotateX flip -->
		<div class="hero-h1-stage">
			<!-- Blurple electric flash fires on both the forward and reverse flips -->
			<div
				class="hero-electric-flash"
				class:flashing={permissionState === 'imploding' || permissionState === 'restoring'}
			></div>

			<!-- h1: flip-out rotates to edge-on, flip-in snaps back revealing new text -->
			<h1
				bind:this={h1Ref}
				class="display-hero mb-4"
				class:hero-flip-out={permissionState === 'imploding' || permissionState === 'restoring'}
				class:hero-flip-in={permissionState === 'transformed' || permissionState === 'returning'}
				style="{h1MinHeight > 0 ? `min-height: ${h1MinHeight}px;` : ''} position: relative;"
			>
				<!-- Original text: hidden while new text is showing -->
				<span
					class:perm-invisible={permissionState === 'transformed' ||
						permissionState === 'restoring'}
				>
					<span
						style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;"
						>You shouldn't need<br /></span
					><span
						class="permission-border"
						role="button"
						tabindex="0"
						bind:this={permissionBorderRef}
						on:click={handlePermissionClick}
						on:keydown={handlePermissionKeydown}
					>
						<!-- SVG gradient dashed border -->
						<svg
							class="permission-svg"
							xmlns="http://www.w3.org/2000/svg"
							aria-hidden="true"
							focusable="false"
						>
							<defs>
								<linearGradient id="perm-grad" x1="0%" y1="0%" x2="100%" y2="100%">
									<stop offset="0%" stop-color="#CDCCFF" />
									<stop offset="100%" stop-color="#5C5FFF" />
								</linearGradient>
							</defs>
							<rect
								x="0.75"
								y="0.75"
								style="width: calc(100% - 1.5px); height: calc(100% - 1.5px);"
								rx={isMobile ? 11.25 : 15.25}
								ry={isMobile ? 11.25 : 15.25}
								fill="none"
								stroke="url(#perm-grad)"
								stroke-width="1.5"
								stroke-dasharray="9 5"
							/>
						</svg>
						<span
							style="background: var(--gradient-blurple-light); -webkit-background-clip: text; background-clip: text; color: transparent;"
							>permission</span
						></span
					><!-- Mobile: permission sits on its own line --><br class="sm:hidden" /><span
						style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;"
						>to use apps.</span
					>
				</span>

				<!-- New text: visible during 'transformed' and 'restoring' phases -->
				{#if permissionState === 'transformed' || permissionState === 'restoring'}
					<span class="hero-transformed-text">
						<span
							style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;"
							>You can just use apps.</span
						>
					</span>
				{/if}
			</h1>
		</div>
		<!-- /hero-h1-stage -->

		<hr class="hero-divider" />

		<p
			class="hero-description mx-auto mt-2 sm:mt-8 mb-10"
			style="color: var(--white66);"
		>
			<span class="sm:hidden">Published by their developers.<br /> Curated by communities.</span><span class="hidden sm:inline">Published by developers. Curated by communities.</span>
		</p>

		<!-- Browse CTA: stacked app pics + glass pill -->
		<div class="hero-cta-wrap flex justify-center mt-5">
			<div class="hero-browse-cta">
				<div class="hero-browse-pics">
					{#each visibleApps as app, i (app.src)}
						<div
							class="hero-browse-pic-wrap"
							class:hero-browse-pic-not-first={i > 0}
							style="z-index: {visibleApps.length + 1 - i};"
						>
							<img src={app.src} alt={app.name} class="hero-app-pic" />
						</div>
					{/each}
				</div>
				<a
					href="/apps"
					bind:this={heroButton}
					class="btn-glass-large btn-glass-with-chevron hero-browse-pill flex items-center gap-2 group"
					on:mousemove={handleMouseMove}
				>
					<span class="sm:hidden">3,000+ Apps</span><span class="hidden sm:inline"
						>Browse 3,000+ apps</span
					>
					<ChevronRight
						variant="outline"
						color="var(--white33)"
						size={18}
						className="transition-transform group-hover:translate-x-0.5"
					/>
				</a>
			</div>
		</div>
	</div>
</section>

<style>
	/* Mobile only: flex for reorder, full-width divider, description under CTA */
	@media (max-width: 639px) {
		.hero-content {
			display: flex;
			flex-direction: column;
		}
		.hero-divider {
			display: block;
			width: 100vw;
			margin-left: calc(-50vw + 50%);
			border: none;
			border-top: 1px solid var(--white16);
			margin-top: 1.5rem;
			margin-bottom: 0;
		}
		.hero-cta-wrap {
			order: 3;
			margin-top: 3.25rem !important;
		}
	.hero-description {
		order: 4;
		margin-top: 1.5rem !important;
		margin-bottom: 0 !important;
	}
	}

	.hero-description {
		font-size: 20px;
		line-height: 2.25rem;
	}

	/* Desktop: hide divider, natural order */
	@media (min-width: 640px) {
		.hero-divider {
			display: none;
		}
		.hero-description {
			font-size: 24px;
			line-height: 2.5rem;
			margin-bottom: 36px;
		}
	}

	/* ── Permission border ─────────────────────────────────────── */
	.permission-border {
		display: inline-block;
		position: relative;
		padding: 2px 18px 15px;
		margin-right: 8px;
		border-radius: 16px;
		vertical-align: baseline;
		transition: transform 0.2s ease-out;
		/*
		 * Cursor: 32×54 px bolt (viewBox 0 0 19 32, scaled up).
		 * Fill: white → very light lavender (#FFFFFF → #DDDCFF).
		 * Shadow: feGaussianBlur on alpha, flooded with black preset (#111111).
		 * Hotspot at (15, 0) — the tip of the bolt.
		 */
		cursor:
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='54' viewBox='0 0 19 32'%3E%3Cdefs%3E%3ClinearGradient id='lg' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23FFFFFF'/%3E%3Cstop offset='1' stop-color='%23DDDCFF'/%3E%3C/linearGradient%3E%3Cfilter id='gw' filterUnits='userSpaceOnUse' x='-5' y='-5' width='29' height='42'%3E%3CfeGaussianBlur in='SourceAlpha' stdDeviation='2.8' result='blur'/%3E%3CfeFlood flood-color='%23111111' flood-opacity='0.75' result='color'/%3E%3CfeComposite in='color' in2='blur' operator='in' result='shadow'/%3E%3CfeMerge%3E%3CfeMergeNode in='shadow'/%3E%3CfeMergeNode in='SourceGraphic'/%3E%3C/feMerge%3E%3C/filter%3E%3C/defs%3E%3Cpath filter='url(%23gw)' fill='url(%23lg)' d='M18.8379 13.9711L8.84956 0.356086C8.30464 -0.386684 7.10438 0.128479 7.30103 1.02073L9.04686 8.94232C9.16268 9.46783 8.74887 9.96266 8.19641 9.9593L0.871032 9.91477C0.194934 9.91066 -0.223975 10.6293 0.126748 11.1916L7.69743 23.3297C7.99957 23.8141 7.73264 24.4447 7.16744 24.5816L5.40958 25.0076C4.70199 25.179 4.51727 26.0734 5.10186 26.4974L12.4572 31.8326C12.9554 32.194 13.6711 31.9411 13.8147 31.3529L15.8505 23.0152C16.0137 22.3465 15.3281 21.7801 14.6762 22.0452L13.0661 22.7001C12.5619 22.9052 11.991 22.6092 11.8849 22.0877L10.7521 16.5224C10.6486 16.014 11.038 15.5365 11.5704 15.5188L18.1639 15.2998C18.8529 15.2769 19.2383 14.517 18.8379 13.9711Z'/%3E%3C/svg%3E")
				15 0,
			pointer;
	}

	/* ── Proximity cursor: activates ~32px before entering the element ── */
	.proximity-cursor {
		cursor:
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='54' viewBox='0 0 19 32'%3E%3Cdefs%3E%3ClinearGradient id='lg' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23FFFFFF'/%3E%3Cstop offset='1' stop-color='%23DDDCFF'/%3E%3C/linearGradient%3E%3Cfilter id='gw' filterUnits='userSpaceOnUse' x='-5' y='-5' width='29' height='42'%3E%3CfeGaussianBlur in='SourceAlpha' stdDeviation='2.8' result='blur'/%3E%3CfeFlood flood-color='%23111111' flood-opacity='0.75' result='color'/%3E%3CfeComposite in='color' in2='blur' operator='in' result='shadow'/%3E%3CfeMerge%3E%3CfeMergeNode in='shadow'/%3E%3CfeMergeNode in='SourceGraphic'/%3E%3C/feMerge%3E%3C/filter%3E%3C/defs%3E%3Cpath filter='url(%23gw)' fill='url(%23lg)' d='M18.8379 13.9711L8.84956 0.356086C8.30464 -0.386684 7.10438 0.128479 7.30103 1.02073L9.04686 8.94232C9.16268 9.46783 8.74887 9.96266 8.19641 9.9593L0.871032 9.91477C0.194934 9.91066 -0.223975 10.6293 0.126748 11.1916L7.69743 23.3297C7.99957 23.8141 7.73264 24.4447 7.16744 24.5816L5.40958 25.0076C4.70199 25.179 4.51727 26.0734 5.10186 26.4974L12.4572 31.8326C12.9554 32.194 13.6711 31.9411 13.8147 31.3529L15.8505 23.0152C16.0137 22.3465 15.3281 21.7801 14.6762 22.0452L13.0661 22.7001C12.5619 22.9052 11.991 22.6092 11.8849 22.0877L10.7521 16.5224C10.6486 16.014 11.038 15.5365 11.5704 15.5188L18.1639 15.2998C18.8529 15.2769 19.2383 14.517 18.8379 13.9711Z'/%3E%3C/svg%3E")
				15 0,
			pointer;
	}

	/* On mobile: own line, 12px radius, bigger text, breathing room above/below */
	@media (max-width: 639px) {
		.permission-border {
			padding: 4px 18px 10px;
			margin-right: 0;
			margin-top: 12px;
			margin-bottom: 6px;
			border-radius: 12px;
			font-size: 1.3em;
		}
	}

	.permission-border:hover {
		transform: scale(1.025);
	}

	.permission-svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		overflow: visible;
	}

	/* ── Stage: provides perspective depth for the 3D flip ─────── */
	.hero-h1-stage {
		position: relative;
		perspective: 900px;
		perspective-origin: center center;
		transform: translateZ(0);
		will-change: transform;
	}

	/* ── Flip out: h1 rotates backward to edge-on (invisible) ──── */
	@keyframes hero-flip-out {
		0% {
			transform: rotateX(0deg);
			filter: brightness(1) drop-shadow(0 0 0px hsl(241 99% 67% / 0));
		}
		70% {
			/* Electric surge just before vanishing */
			filter: brightness(2.5) drop-shadow(0 0 24px hsl(241 99% 67%))
				drop-shadow(0 0 48px hsl(241 99% 67% / 0.7));
		}
		100% {
			transform: rotateX(-90deg);
			filter: brightness(1.2) drop-shadow(0 0 8px hsl(241 99% 67% / 0.4));
		}
	}

	/* ── Flip in: new text arrives from the opposite side ──────── */
	@keyframes hero-flip-in {
		0% {
			transform: rotateX(90deg);
			filter: brightness(1.8) drop-shadow(0 0 20px hsl(241 99% 67% / 0.6));
		}
		60% {
			filter: brightness(1.1) drop-shadow(0 0 6px hsl(241 99% 67% / 0.2));
		}
		100% {
			transform: rotateX(0deg);
			filter: brightness(1) drop-shadow(0 0 0px hsl(241 99% 67% / 0));
		}
	}

	.hero-flip-out {
		animation: hero-flip-out 0.22s ease-in forwards;
		transform-origin: center center;
		will-change: transform, filter;
		backface-visibility: hidden;
	}

	.hero-flip-in {
		animation: hero-flip-in 0.28s ease-out forwards;
		transform-origin: center center;
		will-change: transform, filter;
		backface-visibility: hidden;
	}

	/* ── Radial blurple flash that expands from centre at midpoint ─ */
	.hero-electric-flash {
		position: absolute;
		inset: -40px;
		background: radial-gradient(
			ellipse at center,
			hsl(241 99% 67% / 0.55) 0%,
			hsl(241 99% 67% / 0.2) 40%,
			transparent 70%
		);
		pointer-events: none;
		opacity: 0;
		z-index: 10;
		border-radius: 50%;
	}

	@keyframes electric-flash {
		0% {
			opacity: 0;
			transform: scale(0.4);
		}
		30% {
			opacity: 1;
			transform: scale(1);
		}
		100% {
			opacity: 0;
			transform: scale(1.6);
		}
	}

	.hero-electric-flash.flashing {
		animation: electric-flash 0.22s ease-out forwards;
	}

	/* ── Original text hidden once transformed ──────────────────── */
	.perm-invisible {
		visibility: hidden;
		pointer-events: none;
		user-select: none;
	}

	/* ── New text materialises (already visible via flip-in glow) ── */
	.hero-transformed-text {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* ── Browse CTA ─────────────────────────────────────────────── */
	.hero-browse-cta {
		display: flex;
		align-items: center;
		height: 48px;
	}

	.hero-browse-pics {
		display: flex;
		align-items: center;
		height: 48px;
		position: relative;
		z-index: 2;
		flex-shrink: 0;
	}

	.hero-browse-pic-wrap {
		position: relative;
		display: flex;
		align-items: center;
		height: 48px;
	}

	/* 5-up desktop: modest overlap */
	@media (min-width: 640px) {
		.hero-browse-pic-wrap.hero-browse-pic-not-first {
			margin-left: -12px;
		}
	}

	/*
	 * 4-up mobile: default overlap when there is plenty of width (e.g. tablet portrait).
	 * Tighten only on narrow phones where the pill would wrap.
	 */
	@media (max-width: 639px) {
		.hero-browse-pic-wrap.hero-browse-pic-not-first {
			margin-left: -16px;
		}
		.hero-browse-pill {
			white-space: nowrap;
		}
	}

	@media (max-width: 400px) {
		.hero-browse-pic-wrap.hero-browse-pic-not-first {
			margin-left: -24px;
		}
	}

	@media (max-width: 360px) {
		.hero-browse-pic-wrap.hero-browse-pic-not-first {
			margin-left: -28px;
		}
	}

	.hero-browse-pic-wrap:not(:last-child) :global(.app-pic),
	.hero-browse-pic-wrap:not(:last-child) .hero-app-pic {
		filter: drop-shadow(3px 0 4px var(--black66));
	}

	.hero-app-pic {
		width: 48px;
		height: 48px;
		border-radius: 16px;
		object-fit: cover;
		flex-shrink: 0;
	}

	@keyframes skeleton-pulse {
		0%,
		100% {
			opacity: 0.4;
		}
		50% {
			opacity: 0.8;
		}
	}

	.hero-browse-pill {
		position: relative;
		z-index: 1;
		height: 48px !important;
		margin-left: -16px;
		padding-left: 32px !important;
	}
</style>
