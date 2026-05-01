<script>
	import { onMount, onDestroy } from 'svelte';
	import '$lib/styles/landing-display.css';

	/**
	 * Rotating phrases that complete "What if your app ___".
	 * Mixed pain/aspirational across censorship, speed, money, autonomy.
	 */
	const phrases = [
		"couldn't be deleted by Google?",
		'shipped the moment you signed it?',
		"didn't lose 30% to a middleman?",
		'answered only to you?'
	];

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
	class="what-if-hero relative overflow-hidden border-b border-border/50"
>
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
		<h1 class="display-hero what-if-h1">
			What if your app<br />
			<span class="what-if-stage" aria-live="polite">
				{#each phrases as phrase, i (phrase)}
					<span class="what-if-phrase" class:active={i === activeIndex}>{phrase}</span>
				{/each}
			</span>
		</h1>

		<p class="display-lead what-if-tagline">
			On Zapstore, that doesn't have to be a question.
		</p>
	</div>
</section>

<style>
	.what-if-hero {
		padding: 3rem 0 3.5rem;
	}

	@media (min-width: 768px) {
		.what-if-hero {
			padding: 4.5rem 0 5rem;
		}
	}

	@media (min-width: 1024px) {
		.what-if-hero {
			padding: 5.5rem 0 6rem;
		}
	}

	.what-if-h1 {
		margin: 0 auto;
		max-width: 24ch;
		line-height: 1.2;
		font-size: clamp(32px, 6vw, 52px);
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
		white-space: nowrap;
	}

	@media (max-width: 639px) {
		.what-if-tagline {
			white-space: normal;
		}
	}

	@media (min-width: 768px) {
		.what-if-tagline {
			margin-top: 2.5rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.what-if-phrase {
			transition: none;
		}
	}
</style>
