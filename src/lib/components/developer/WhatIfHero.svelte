<script>
	import { onMount, onDestroy } from 'svelte';
	import '$lib/styles/landing-display.css';
	import { ChevronRight } from '$lib/components/icons';

	/**
	 * Rotating phrases that complete "What if your app ___".
	 * Split into line1/line2 so the <br> between them can be hidden at xl
	 * (1280px+) where the full phrase fits on one line.
	 * Note: "30% to" stays on line1 so the break reads "didn't lose 30% to / a middleman?"
	 */
	const phrases = [
		{ line1: "couldn't be deleted", line2: 'by Google?' },
		{ line1: 'shipped the moment', line2: 'you signed it?' },
		{ line1: "didn't lose 30% to", line2: 'a middleman?' },
		{ line1: 'answered only', line2: 'to you?' }
	];

	/** @type {HTMLAnchorElement | null} */
	let publishBtn = null;

	/** @param {MouseEvent} event */
	function handlePublishMouseMove(event) {
		if (!publishBtn) return;
		const rect = publishBtn.getBoundingClientRect();
		publishBtn.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
		publishBtn.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
	}

	const ROTATE_MS = 3200;

	let activeIndex = $state(0);
	/** @type {ReturnType<typeof setInterval> | null} */
	let timer = null;
	/** @type {IntersectionObserver | null} */
	let observer = null;
	/** @type {HTMLElement | null} */
	let sectionEl;
	let reducedMotion = false;

	function advance() {
		activeIndex = (activeIndex + 1) % phrases.length;
	}

	function startTimer() {
		if (timer || reducedMotion) return;
		timer = setInterval(advance, ROTATE_MS);
	}

	function stopTimer() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	}

	onMount(() => {
		const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion = mql.matches;
		const onMqlChange = (/** @type {MediaQueryListEvent} */ e) => {
			reducedMotion = e.matches;
			if (reducedMotion) stopTimer();
		};
		mql.addEventListener('change', onMqlChange);

		observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) startTimer();
				else stopTimer();
			},
			{ threshold: 0.25 }
		);
		if (sectionEl) observer.observe(sectionEl);

		return () => {
			mql.removeEventListener('change', onMqlChange);
		};
	});

	onDestroy(() => {
		stopTimer();
		if (observer) observer.disconnect();
	});
</script>

<section
	bind:this={sectionEl}
	class="what-if-hero relative overflow-hidden"
>
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
		<h1 class="display-hero what-if-h1">
			What if your app<br />
			<span class="what-if-stage" aria-live="polite">
				{#each phrases as phrase, i (phrase.line1)}
					<span class="what-if-phrase" class:active={i === activeIndex}
						>{phrase.line1} <br class="what-if-br" />{phrase.line2}</span
					>
				{/each}
			</span>
		</h1>

		<p class="what-if-tagline">
			On Zapstore, that doesn't have<br class="sm:hidden" /> to be a question.
		</p>

		<div class="what-if-cta">
			<a
				href="/docs/publish"
				bind:this={publishBtn}
				onmousemove={handlePublishMouseMove}
				class="btn-glass-large btn-glass-with-chevron group inline-flex items-center justify-center gap-3"
			>
				Start Publishing
				<ChevronRight
					variant="outline"
					color="var(--white33)"
					size={18}
					className="transition-transform group-hover:translate-x-0.5"
				/>
			</a>
		</div>
	</div>
</section>

<style>
	.what-if-hero {
		padding: 3.5rem 0 4rem;
	}

	@media (min-width: 768px) {
		.what-if-hero {
			padding: 4.5rem 0 5rem;
		}
	}

	@media (min-width: 1024px) {
		.what-if-hero {
			padding: 4.5rem 0 4.5rem;
		}
	}

	/* At the widest content max-width (xl / 1280px+) the phrases fit on one line — hide the forced break */
	@media (min-width: 1280px) {
		.what-if-br {
			display: none;
		}
	}

	.what-if-h1 {
		margin: 0 auto;
		max-width: 24ch;
		line-height: 1.2;
		font-size: clamp(36px, 6vw, 52px);
	}

	@media (min-width: 1280px) {
		.what-if-h1 {
			font-size: 60px;
		}
	}

	/*
	 * Inline-grid stack: all phrases share one grid cell.
	 * The cell sizes to the longest phrase but can shrink on narrow viewports.
	 */
	.what-if-stage {
		display: inline-grid;
		grid-template-columns: minmax(0, max-content);
		vertical-align: baseline;
		max-width: 100%;
		white-space: nowrap;
	}

	.what-if-phrase {
		grid-column: 1;
		grid-row: 1;
		text-align: center;
		opacity: 0;
		transition: opacity 0.45s ease;
		background: var(--gradient-blurple-light);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		pointer-events: none;
		white-space: nowrap;
	}

	.what-if-phrase.active {
		opacity: 1;
	}

	.what-if-tagline {
		margin: 2rem auto 0;
		max-width: 40ch;
		color: var(--white66);
		font-weight: 400;
		font-size: 20px;
		line-height: 2.25rem;
		white-space: nowrap;
	}

	@media (max-width: 639px) {
		.what-if-tagline {
			white-space: normal;
		}
	}

	@media (min-width: 640px) {
		.what-if-tagline {
			font-size: 24px;
			line-height: 2.5rem;
			margin-top: 1.25rem; /* 16px + 4px = 20px */
		}
	}

	.what-if-cta {
		margin-top: 1.5rem; /* 8px less than before on mobile */
	}

	@media (min-width: 640px) {
		.what-if-cta {
			margin-top: 2.25rem; /* 40px - 4px = 36px */
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.what-if-phrase {
			transition: none;
		}
	}
</style>
