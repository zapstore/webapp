<script>
	import { onMount, onDestroy } from 'svelte';
	import Cross from '$lib/components/icons/Cross.svelte';
	import ArrowUp from '$lib/components/icons/ArrowUp.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';

	const jane = {
		name: 'Jane Clement',
		pic: '/images/profiles/jane-clementt.png'
	};

	const cards = [
		{
			playstorePanel: true,
			alt: 'Play Store showing no results for Syncthing',
			title: 'A handful of companies decide',
			description:
				'They stand between you and the developer. What you can install is their call — no explanation, no appeal when an app disappears.'
		},
		{
			verifyPanel: true,
			alt: 'Unknown app installation chain',
			title: 'You just have to trust them',
			description:
				'The app on your device passed through hands you never see. You have no way to know it arrived unchanged.'
		}
	];

	// Card 1 (chat) stays visible for this long before auto-returning to card 0
	const CHAT_INTERVAL = 11000;

	let activeIndex = 0;
	/** @type {ReturnType<typeof setInterval> | null} */
	let timer = null;
	/** @type {IntersectionObserver | null} */
	let observer = null;
	/** @type {HTMLElement | null} */
	let sectionEl = null;
	let psAnimating = false;
	let isMobile = false;
	/** @type {() => void} */
	let mqlCleanup = () => {};

	// Card 0 switching is driven by the PS animation, not the interval timer.
	// The timer only runs while on card 1 to return to card 0.
	function selectTab(i) {
		if (i === activeIndex) return;
		activeIndex = i;
		if (i === 0) {
			stopTimer();
			startPsAnim();
		} else {
			stopPsAnim();
			restartTimer();
		}
	}

	function advance() {
		const next = (activeIndex + 1) % cards.length;
		activeIndex = next;
		if (next === 0) {
			stopTimer();
			startPsAnim();
		} else {
			stopPsAnim();
			restartTimer();
		}
	}

	function startTimer() {
		if (timer) return;
		timer = setInterval(advance, CHAT_INTERVAL);
	}

	function stopTimer() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	}

	function restartTimer() {
		stopTimer();
		startTimer();
	}

	// ── Play Store fake UI animation ─────────────────────────────
	// Sequence: Syncthing(noresults) → backspace → NewPipe → backspace → Raya Games
	//   Desktop: noresults 500ms → advance (no backspace)
	//   Mobile:  noresults 500ms → backspace → advance
	/** @type {'noresults' | 'typing' | 'deleting' | 'clearing'} */
	let psState = 'noresults';
	let psQuery = 'Syncthing';
	/** @type {ReturnType<typeof setTimeout> | null} */
	let psAnimTimer = null;

	function clearPsTimer() {
		if (psAnimTimer) { clearTimeout(psAnimTimer); psAnimTimer = null; }
	}

	function startPsAnim() {
		clearPsTimer();
		psQuery = 'Syncthing';
		psState = 'noresults';
		psAnimTimer = setTimeout(psDelete, 3000);
	}

	function stopPsAnim() {
		clearPsTimer();
	}

	/**
	 * Backspace current psQuery char by char, then call onCleared.
	 * @param {() => void} onCleared
	 */
	function psBackspace(onCleared) {
		psState = 'deleting';
		if (psQuery.length > 0) {
			psQuery = psQuery.slice(0, -1);
			psAnimTimer = setTimeout(() => psBackspace(onCleared), 90);
		} else {
			psState = 'clearing';
			psAnimTimer = setTimeout(onCleared, 650);
		}
	}

	/**
	 * Type name char by char, then call onDone.
	 * @param {string} name @param {number} i @param {() => void} onDone
	 */
	function psType(name, i, onDone) {
		if (i < name.length) {
			psState = 'typing';
			psQuery = name.slice(0, i + 1);
			psAnimTimer = setTimeout(() => psType(name, i + 1, onDone), 70 + (i % 3) * 28);
		} else {
			psState = 'noresults';
			onDone();
		}
	}

	// Step callbacks — each is a named function so stopPsAnim cleanly cancels mid-chain

	function psDelete() {
		psBackspace(() => psType('NewPipe', 0, psAfterNewPipe));
	}

	function psAfterNewPipe() {
		psAnimTimer = setTimeout(psDeleteNewPipe, 3000);
	}

	function psDeleteNewPipe() {
		psBackspace(() => psType('Raya Games', 0, psAfterRayaGames));
	}

	function psAfterRayaGames() {
		// Desktop: advance after 2200ms. Mobile: shorter delay, then backspace → type Syncthing → loop
		const rayaDisplayMs = isMobile ? 700 : 2200;
		psAnimTimer = setTimeout(() => {
			if (isMobile) {
				psBackspace(() => psType('Syncthing', 0, psLoopOnMobile));
			} else {
				advance();
			}
		}, rayaDisplayMs);
	}

	function psLoopOnMobile() {
		psState = 'noresults';
		psAnimTimer = setTimeout(psDelete, 3000);
	}

	onMount(() => {
		const mql = window.matchMedia('(max-width: 639px)');
		isMobile = mql.matches;
		mql.addEventListener('change', (e) => { isMobile = e.matches; });
		mqlCleanup = () => mql.removeEventListener('change', (e) => { isMobile = e.matches; });

		observer = new IntersectionObserver(
			(entries) => {
				const ratio = entries[0].intersectionRatio;
				if (ratio >= 0.8) {
					psAnimating = true;
					if (activeIndex === 0) startPsAnim();
					else startTimer();
				} else {
					psAnimating = false;
					stopTimer();
					stopPsAnim();
				}
			},
			{ threshold: [0, 0.8] }
		);
		if (sectionEl) observer.observe(sectionEl);
	});

	onDestroy(() => {
		mqlCleanup();
		stopTimer();
		stopPsAnim();
		if (observer) observer.disconnect();
	});
</script>

<section bind:this={sectionEl} class="border-t border-border/50 pt-0 pb-6 lg:pb-12">
	<!-- ── MOBILE: eyebrow badge + horizontal scroll ── -->
	<div class="lg:hidden">
		<div class="eyebrow-badge-wrap">
			<div class="eyebrow-badge">
				<Cross
					variant="outline"
					color="color-mix(in srgb, var(--rougeColor) 66%, transparent)"
					size={12}
					strokeWidth={1.4}
				/>
				<p class="eyebrow-label" style="color: var(--white33); font-size: 1rem;">
					The Old Way
				</p>
			</div>
		</div>
		<div class="mobile-scroll">
			<div class="mobile-scroll-inner">
			{#each cards as card (card.title)}
				<div class="mob-card">
					<div class="mob-img-wrap" class:mob-verify-wrap={card.verifyPanel} class:mob-ps-wrap={card.playstorePanel}>
						{#if card.verifyPanel}
							{@render verifyChain()}
						{:else if card.playstorePanel}
							<div class="ps-wrap">
								<div class="ps-scaler">
									{@render fakePlaystoreUI()}
								</div>
							</div>
						{/if}
					</div>
						<div class="mob-panel">
							<h3 class="mob-title">{card.title}</h3>
							<p class="mob-desc">{card.description}</p>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- ── DESKTOP: eyebrow badge above + image LEFT / tabs RIGHT ── -->
	<div class="hidden lg:block">
		<div class="container mx-auto px-4 sm:px-6 md:px-8 lg:px-8">
			<div class="eyebrow-badge-wrap">
				<div class="eyebrow-badge">
					<Cross
						variant="outline"
						color="color-mix(in srgb, var(--rougeColor) 66%, transparent)"
						size={12}
						strokeWidth={1.4}
					/>
					<p class="eyebrow-label" style="color: var(--white33); font-size: 1rem;">
						The Old Way
					</p>
				</div>
			</div>
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-stretch">
				<!-- Left: image / panel display -->
				<div class="feature-image-wrap">
				{#each cards as card, i (card.title)}
				{#if card.verifyPanel}
					<div class="feature-verify-panel" class:visible={activeIndex === i}>
						{@render verifyChain()}
					</div>
				{:else if card.playstorePanel}
						<div class="feature-ps-panel" class:visible={activeIndex === i}>
							<div class="ps-wrap">
								<div class="ps-scaler">
									{@render fakePlaystoreUI()}
								</div>
							</div>
						</div>
					{:else}
						<div class="feature-empty-panel" class:visible={activeIndex === i}></div>
					{/if}
				{/each}
				</div>

				<!-- Right: tab panels -->
				<div class="feature-tabs-col lg:py-8 lg:pl-8 lg:pr-7">
					<div class="feature-tabs">
						{#each cards as card, i (card.title)}
							<button
								class="feature-tab"
								class:active={activeIndex === i}
								on:click={() => selectTab(i)}
								type="button"
							>
								<h3 class="tab-title">{card.title}</h3>
								<p class="tab-desc">{card.description}</p>
							</button>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
</section>

{#snippet verifyChain()}
	<div class="verify-chain">
		<div class="verify-icon-box verify-app-icon">
			<svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<rect x="3" y="3" width="7" height="7" rx="1.5" fill="rgba(255,255,255,0.75)" />
				<rect x="14" y="3" width="7" height="7" rx="1.5" fill="rgba(255,255,255,0.75)" />
				<rect x="3" y="14" width="7" height="7" rx="1.5" fill="rgba(255,255,255,0.5)" />
				<rect x="14" y="14" width="7" height="7" rx="1.5" fill="rgba(255,255,255,0.5)" />
			</svg>
		</div>
		<div class="verify-arrow" aria-hidden="true">
			<ArrowUp variant="outline" color="var(--white33)" size={20} strokeWidth={1.4} className="verify-arrow-icon" />
		</div>
		<div class="verify-icon-box verify-mystery">
			<span class="verify-question">?</span>
		</div>
		<div class="verify-arrow" aria-hidden="true">
			<ArrowUp variant="outline" color="var(--white33)" size={20} strokeWidth={1.4} className="verify-arrow-icon" />
		</div>
		<img src={jane.pic} alt="User" class="verify-user-pic" />
		<span class="verify-lbl verify-lbl-dev">Developer</span>
		<span class="verify-lbl verify-lbl-store">App Store</span>
		<span class="verify-lbl verify-lbl-user">User</span>
	</div>
{/snippet}

{#snippet fakePlaystoreUI()}
	<div class="fake-ps-ui">
		<div class="fake-ps-search">
			<img src="/images/playstore.svg" alt="" class="fake-ps-search-icon" aria-hidden="true" />
			<span class="fake-ps-query">
				{#if psQuery === ''}
					<span class="ps-cursor" class:ps-cursor-active={psAnimating}></span><span class="fake-ps-placeholder">Search Apps</span>
				{:else}
					{psQuery}<span class="ps-cursor" class:ps-cursor-active={psAnimating}></span>
				{/if}
			</span>
		</div>

		<div class="fake-ps-body">
			<div class="fake-ps-result-box">
				<div class="fake-ps-result-inner" class:ps-hidden={psState !== 'typing'}>
					<Spinner size={26} color="var(--white16)" strokeWidth={3.5} />
				</div>
				<div class="fake-ps-result-inner" class:ps-hidden={psState !== 'noresults' && psState !== 'deleting'}>
					<p class="fake-ps-no-results">No apps found</p>
				</div>
			</div>
		</div>
	</div>
{/snippet}

<style>
	/* ════════════════════════════════════════════════════════════
	   MOBILE
	   ════════════════════════════════════════════════════════════ */
	.eyebrow-badge-wrap {
		display: flex;
		justify-content: center;
		margin-bottom: 1.25rem;
	}

	.eyebrow-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1.375rem 0.625rem 1.375rem;
		border-radius: 0 0 0.875rem 0.875rem;
		background-color: var(--white4);
	}

	.mobile-scroll {
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
		scroll-snap-type: x mandatory;
		padding-left: 1rem;
		padding-right: 1rem;
	}

	.mobile-scroll::-webkit-scrollbar {
		display: none;
	}

	@media (min-width: 640px) {
		.mobile-scroll {
			padding-left: 1.5rem;
			padding-right: 1.5rem;
		}
	}

	.mobile-scroll-inner {
		display: flex;
		gap: 1rem;
		width: max-content;
		padding-bottom: 0.25rem;
	}

	.mob-card {
		width: calc(100vw - 7rem);
		flex-shrink: 0;
		scroll-snap-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	@media (min-width: 640px) {
		.mob-card {
			width: calc(100vw - 8rem);
		}
	}

	.mob-img-wrap {
		width: 100%;
		aspect-ratio: 1.618 / 1;
		border-radius: 1.125rem;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.25rem;
	}

	/* Medium (tablet): fixed height so image area doesn't get huge; cards keep consistent height */
	@media (min-width: 640px) and (max-width: 767px) {
		.mob-img-wrap {
			height: 260px;
			aspect-ratio: auto;
		}
	}
	@media (min-width: 768px) and (max-width: 1023px) {
		.mob-img-wrap {
			height: 300px;
			aspect-ratio: auto;
		}
	}

	@media (max-width: 639px) {
		.mob-verify-wrap .verify-chain {
			transform: scale(0.82);
			transform-origin: center;
		}
	}

	.mob-verify-wrap {
		align-items: center;
		justify-content: center;
		background-color: transparent;
		padding: 1.25rem 0.5rem;
	}

	.mob-panel {
		padding: 1.25rem 1.5rem 1.5rem;
		background: var(--gray33);
		border-radius: 1.125rem;
	}

	.mob-title {
		font-size: 1.125rem;
		font-weight: 600;
		line-height: 1.3;
		margin: 0 0 0.4rem;
		color: var(--white);
	}

	.mob-desc {
		font-size: 1rem;
		line-height: 1.55;
		margin: 0;
		color: var(--white66);
	}

	/* ════════════════════════════════════════════════════════════
	   DESKTOP
	   ════════════════════════════════════════════════════════════ */
	.feature-tabs-col {
		display: flex;
		flex-direction: column;
	}

	.feature-tabs {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	@media (min-width: 1024px) {
		.feature-tabs {
			gap: 0;
		}
	}

	.feature-tab {
		position: relative;
		text-align: left;
		width: 100%;
		padding: 1.25rem 1.5rem 1.125rem;
		border-radius: 1.125rem;
		border: none;
		cursor: pointer;
		background: transparent;
		transition: background-color 0.4s ease;
	}

	.feature-tab.active {
		background-color: var(--gray33);
	}

	.tab-title {
		font-size: 1.125rem;
		font-weight: 600;
		line-height: 1.3;
		margin: 0 0 0.35rem;
		transition: color 0.4s ease;
		color: var(--white66);
	}

	@media (min-width: 640px) {
		.tab-title {
			font-size: 1.25rem;
		}
	}

	.feature-tab.active .tab-title {
		color: var(--white);
	}

	.tab-desc {
		font-size: 1rem;
		line-height: 1.55;
		margin: 0;
		transition: color 0.4s ease;
		color: var(--white33);
	}

	.feature-tab.active .tab-desc {
		color: var(--white66);
	}

	/* ── Image / panel wrap ─────────────────────────────────── */
	.feature-image-wrap {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 280px;
		padding: 1.25rem;
		overflow: hidden;
	}

	/* ── Verify panel (desktop) ─────────────────────────────── */
	.feature-verify-panel {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		filter: blur(10px);
		transform: scale(0.97);
		transition:
			opacity 0.6s ease,
			filter 0.6s ease,
			transform 0.6s ease;
		pointer-events: none;
	}

	.feature-verify-panel.visible {
		opacity: 1;
		filter: blur(0);
		transform: scale(1);
		pointer-events: auto;
	}

	/* ════════════════════════════════════════════════════════════
	   VERIFY CHAIN
	   ════════════════════════════════════════════════════════════ */
	.verify-chain {
		display: inline-grid;
		grid-template-columns: 72px 44px 72px 44px 72px;
		grid-template-rows: 72px auto;
		row-gap: 16px;
		column-gap: 0;
		align-items: center;
	}

	.verify-icon-box {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 72px;
		height: 72px;
		border-radius: 18px;
	}

	.verify-app-icon {
		background: linear-gradient(135deg, color-mix(in srgb, var(--blurpleColor) 60%, transparent), var(--blurpleColor));
	}

	.verify-mystery {
		background: var(--gray33);
		border: 1.4px solid var(--white16);
	}

	.verify-question {
		font-size: 2rem;
		font-weight: 700;
		color: var(--white33);
		line-height: 1;
	}

	.verify-arrow {
		width: 44px;
		align-self: center;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	:global(.verify-arrow-icon) {
		transform: rotate(90deg);
		display: block;
	}

	.verify-user-pic {
		width: 72px;
		height: 72px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid var(--white8);
	}

	.verify-lbl {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--white33);
		text-align: center;
		line-height: 1;
	}

	.verify-lbl-dev   { grid-column: 1; grid-row: 2; }
	.verify-lbl-store { grid-column: 3; grid-row: 2; }
	.verify-lbl-user  { grid-column: 5; grid-row: 2; }

	@media (min-width: 1024px) {
		.verify-chain {
			grid-template-columns: 88px 56px 88px 56px 88px;
			grid-template-rows: 88px auto;
		}
		.verify-icon-box {
			width: 88px;
			height: 88px;
			border-radius: 22px;
		}
		.verify-user-pic {
			width: 88px;
			height: 88px;
		}
		.verify-arrow {
			width: 56px;
		}
.verify-question {
			font-size: 2.5rem;
		}
		.verify-lbl {
			font-size: 1.0625rem;
		}
	}

	/* ════════════════════════════════════════════════════════════
	   FAKE PLAY STORE UI
	   ════════════════════════════════════════════════════════════ */
	/* ── Desktop PS panel (mirrors .feature-visual-panel) ───────── */
	.feature-ps-panel {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		filter: blur(10px);
		transform: scale(0.97);
		transition:
			opacity 0.6s ease,
			filter 0.6s ease,
			transform 0.6s ease;
		pointer-events: none;
	}

	.feature-ps-panel.visible {
		opacity: 1;
		filter: blur(0);
		transform: scale(1);
		pointer-events: auto;
	}

	/* ── Shared inner wrap (mirrors .confirm-wrap) ─────────────── */
	.ps-wrap {
		width: 100%;
		height: 100%;
		overflow: hidden;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 40px 1rem 0;
		-webkit-mask-image: linear-gradient(to bottom, black 0%, black 55%, transparent 90%);
		mask-image: linear-gradient(to bottom, black 0%, black 55%, transparent 90%);
	}

	/* ── Scaler (mirrors .confirm-scaler) ────────────────────── */
	.ps-scaler {
		width: 100%;
	}

	/* ── Mobile ps wrap ─────────────────────────────────────── */
	.mob-ps-wrap {
		padding: 0;
	}

	@media (max-width: 639px) {
		.mob-ps-wrap .fake-ps-ui {
			height: 380px;
		}
		.mob-ps-wrap .fake-ps-search-icon {
			width: 28px;
			height: 28px;
		}
		.mob-ps-wrap .fake-ps-query {
			font-size: 1rem;
			min-height: 1.2rem;
		}
		.mob-ps-wrap .fake-ps-result-box {
			height: 88px;
		}
		.mob-ps-wrap .fake-ps-no-results {
			font-size: 1.25rem;
			position: relative;
			top: -4px;
		}
	}

	/* ── Fake Play Store card (gray33 panel): same padding on all screen sizes ── */
	.fake-ps-ui {
		width: 100%;
		height: 440px;
		background: var(--gray33);
		border: 1px solid var(--white8);
		border-radius: 2rem;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		padding: 0.75rem 0.75rem 0;
	}

	/* Desktop only: bigger padding inside the panel; 4px less above the panel; keep gap under search bar same as mobile */
	@media (min-width: 1024px) {
		.feature-ps-panel .ps-wrap {
			padding-top: 36px;
		}
		.feature-ps-panel .fake-ps-ui {
			padding: 1rem 1rem 0;
		}
	}

	.fake-ps-search {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: var(--black33);
		border: 1.4px solid var(--white16);
		border-radius: 1rem;
		padding: 0.6rem 1rem;
		margin-bottom: 0.75rem;
		flex-shrink: 0;
	}

	@media (min-width: 1024px) {
		.fake-ps-search {
			padding: 0.7rem 1rem;
		}
	}

	.fake-ps-search-icon {
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		filter: brightness(0) invert(1);
		opacity: 0.33;
	}

	.fake-ps-query {
		font-size: 1.25rem;
		font-weight: 500;
		color: var(--white);
		line-height: 1;
		flex: 1;
		display: flex;
		align-items: center;
		gap: 2px;
		min-height: 1.5rem;
	}

	.fake-ps-placeholder {
		color: var(--white33);
	}

	.ps-cursor {
		display: inline-block;
		width: 2px;
		height: 1.1em;
		background: var(--white);
		border-radius: 1px;
		opacity: 1;
		vertical-align: text-bottom;
		flex-shrink: 0;
	}

	.ps-cursor.ps-cursor-active {
		animation: ps-blink 0.9s step-end infinite;
	}

	@keyframes ps-blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0; }
	}

	.fake-ps-body {
		flex: 1;
		padding: 0;
	}

	/* ── Shared result container (spinner + no-results, same spot) ── */
	.fake-ps-result-box {
		background: hsl(0 0% 0% / 0.16);
		border-radius: 1rem;
		position: relative;
		height: 110px;
	}

	.fake-ps-result-inner {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: opacity 0.3s ease;
	}

	.fake-ps-no-results {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--white33);
		margin: 0;
		text-align: center;
		line-height: 1.15;
	}

	/* ── Visibility transitions ───────────────────────────────── */
	.ps-hidden {
		opacity: 0;
		pointer-events: none;
	}

	/* golden-ratio landscape for desktop image column */
	.feature-image-wrap {
		aspect-ratio: 1.618 / 1;
		min-height: unset;
	}
</style>
                                                                                                                                                                                                     