<script>
	import { onMount, onDestroy } from 'svelte';
	import Check from '$lib/components/icons/Check.svelte';

	const cards = [
		{
			img: '/images/direct-line.png',
			alt: 'Direct messaging between users and developers',
			title: 'A direct line to developers',
			description: 'Ask questions, pitch ideas, tip the builders directly. No middlemen between you and the people who made your tools.'
		},
		{
			img: null,
			securityPanel: true,
			alt: '',
			title: 'Every app is tamper-proof',
			description: 'Each release is cryptographically signed by its developer. What you install is exactly what they shipped. Anyone can verify it.'
		},
		{
			img: null,
			catalogPanel: true,
			alt: '',
			title: 'Built on open rails',
			description: 'Anyone can run a catalog. You pick which ones to trust — and switch anytime. No single entity can make an app disappear.'
		}
	];

	const INTERVAL = 11000;

	let activeIndex = 0;
	/** @type {ReturnType<typeof setInterval> | null} */
	let timer = null;
	/** @type {IntersectionObserver | null} */
	let observer = null;
	/** @type {HTMLElement | null} */
	let sectionEl = null;

	function selectTab(i) {
		if (i === activeIndex) return;
		activeIndex = i;
		restartTimer();
	}

	function advance() {
		activeIndex = (activeIndex + 1) % cards.length;
	}

	function startTimer() {
		if (timer) return;
		timer = setInterval(advance, INTERVAL);
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

	onMount(() => {
		observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) startTimer();
				else stopTimer();
			},
			{ threshold: 0.8 }
		);
		if (sectionEl) observer.observe(sectionEl);
	});

	onDestroy(() => {
		stopTimer();
		if (observer) observer.disconnect();
	});
</script>

<section bind:this={sectionEl} class="border-t border-border/50 pt-0 pb-6 lg:pb-12">
	<!-- ── MOBILE: eyebrow badge ── -->
	<div class="lg:hidden">
		<div class="eyebrow-badge-wrap">
			<div class="eyebrow-badge">
				<Check variant="outline" color="hsl(var(--blurpleColor))" size={16} strokeWidth={1.4} />
				<p class="eyebrow-label" style="color: hsl(var(--white33)); font-size: 1rem;">A Better Way</p>
			</div>
		</div>
	</div>
	<div class="mobile-scroll lg:hidden">
		<div class="mobile-scroll-inner">
			{#each cards as card (card.title)}
				<div class="mob-card">
					<div
						class="mob-img-wrap"
						class:mob-sec-wrap={card.securityPanel}
						class:mob-cat-wrap={card.catalogPanel}
					>
						{#if card.img}
							<img src={card.img} alt={card.alt} class="mob-img" loading="lazy" />
						{:else if card.securityPanel}
							<div class="fake-scaler fake-scaler-mob">
								{@render fakeSecUI()}
							</div>
						{:else if card.catalogPanel}
							<div class="fake-scaler fake-scaler-cat-mob">
								{@render fakeCatUI()}
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

	<!-- ── DESKTOP: eyebrow badge above + tabs LEFT / image RIGHT ── -->
	<div class="hidden lg:block">
		<div class="container mx-auto px-4 sm:px-6 md:px-8 lg:px-8">
			<div class="eyebrow-badge-wrap">
				<div class="eyebrow-badge">
					<Check variant="outline" color="hsl(var(--blurpleColor))" size={16} strokeWidth={1.4} />
					<p class="eyebrow-label" style="color: hsl(var(--white33)); font-size: 1rem;">A Better Way</p>
				</div>
			</div>
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-stretch">
				<!-- Left: tab panels -->
				<div class="feature-tabs lg:py-8 lg:pl-7 lg:pr-8">
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

				<!-- Right: image / panel display -->
				<div class="feature-image-wrap">
					{#each cards as card, i (card.title)}
						{#if card.img}
							<img
								src={card.img}
								alt={card.alt}
								class="feature-img"
								class:visible={activeIndex === i}
							/>
						{:else if card.securityPanel}
							<div class="feature-sec-panel" class:visible={activeIndex === i}>
								<div class="fake-scaler fake-scaler-desktop">
									{@render fakeSecUI()}
								</div>
							</div>
						{:else if card.catalogPanel}
							<div class="feature-cat-panel" class:visible={activeIndex === i}>
								<div class="fake-scaler fake-scaler-cat-desktop">
									{@render fakeCatUI()}
								</div>
							</div>
						{/if}
					{/each}
				</div>
			</div>
		</div>
	</div>
</section>

{#snippet fakeSecUI()}
	<div class="fake-ui">
		<!-- Fake description text — fades in from top -->
		<div class="fake-desc-block">
			<p class="fake-desc fake-desc-dim">available for Android and more platforms soon.</p>
			<p class="fake-desc">exactly what the developer shipped.</p>
		</div>

		<!-- Info panels: Security + Releases (matches real app .info-panels-main layout) -->
		<div class="fake-panels">
			<div class="fake-panel fake-panel-sec">
				<div class="fake-panel-hdr">Security</div>
				<div class="fake-sec-item" style="opacity:1;transform:scale(1);">
					<svg class="fake-chk" viewBox="-1.5 -1.5 20 14" fill="none" aria-hidden="true">
						<path d="M6.2 11.2L0.7 5.7L6.2 10.95L16.7 0.7L6.2 11.2Z" />
					</svg>
					<span>Published by Developer</span>
				</div>
				<div
					class="fake-sec-item"
					style="opacity:0.78;transform:scale(0.96);transform-origin:left;"
				>
					<svg class="fake-chk" viewBox="-1.5 -1.5 20 14" fill="none" aria-hidden="true">
						<path d="M6.2 11.2L0.7 5.7L6.2 10.95L16.7 0.7L6.2 11.2Z" />
					</svg>
					<span>Open Source</span>
				</div>
				<div
					class="fake-sec-item"
					style="opacity:0.56;transform:scale(0.92);transform-origin:left;"
				>
					<svg class="fake-chk" viewBox="-1.5 -1.5 20 14" fill="none" aria-hidden="true">
						<path d="M6.2 11.2L0.7 5.7L6.2 10.95L16.7 0.7L6.2 11.2Z" />
					</svg>
					<span>Trusted Catalog</span>
				</div>
			</div>
			<div class="fake-panel fake-panel-rel">
				<div class="fake-panel-hdr">Releases</div>
			</div>
		</div>

		<!-- Fake SocialTabs pill row — matches the real tab-row exactly -->
		<div class="fake-tab-row">
			<div class="fake-tab-active">
				<span>Comments</span>
				<span class="fake-tab-count">121</span>
			</div>
			<div class="fake-tab-inactive">
				<span>Zaps</span>
				<span class="fake-tab-count">
					<svg width="10" height="10" viewBox="0 0 19 32" fill="none"
						><path
							d="M18.8379 13.9711L8.84956 0.356086C8.30464 -0.386684 7.10438 0.128479 7.30103 1.02073L9.04686 8.94232C9.16268 9.46783 8.74887 9.96266 8.19641 9.9593L0.871032 9.91477C0.194934 9.91066 -0.223975 10.6293 0.126748 11.1916L7.69743 23.3297C7.99957 23.8141 7.73264 24.4447 7.16744 24.5816L5.40958 25.0076C4.70199 25.179 4.51727 26.0734 5.10186 26.4974L12.4572 31.8326C12.9554 32.194 13.6711 31.9411 13.8147 31.3529L15.8505 23.0152C16.0137 22.3465 15.3281 21.7801 14.6762 22.0452L13.0661 22.7001C12.5619 22.9052 11.991 22.6092 11.8849 22.0877L10.7521 16.5224C10.6486 16.014 11.038 15.5365 11.5704 15.5188L18.1639 15.2998C18.8529 15.2769 19.2383 14.517 18.8379 13.9711Z"
							fill="currentColor"
						/></svg
					>
					4.2K
				</span>
			</div>
			<div class="fake-tab-inactive">Labels</div>
			<div class="fake-tab-inactive">Details</div>
		</div>
	</div>
{/snippet}

{#snippet fakeCatUI()}
	<div class="fake-ui fake-ui-cat">
		<div class="fake-cat-card">
			<div class="fake-cat-hdr">YOUR CATALOGS</div>
			<!-- Zapstore — checked -->
			<div class="fake-cat-row">
				<div class="fake-cat-pic fake-cp-zap">
					<img
						src="/images/logo.svg"
						width="17"
						height="17"
						class="fake-cat-logo"
						alt=""
						aria-hidden="true"
					/>
				</div>
				<div class="fake-cat-info">
					<span class="fake-cat-name">Zapstore</span>
					<span class="fake-cat-desc">Developer-signed apps.</span>
				</div>
				<div class="fake-chkbox fake-chkbox--on">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
						><path
							d="M3 8l4 4 6-8"
							stroke="white"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/></svg
					>
				</div>
			</div>
			<div class="fake-cat-div"></div>
			<!-- Alpha Mail — checked -->
			<div class="fake-cat-row">
				<div class="fake-cat-pic fake-cp-alpha">
					<span class="fake-cat-init">A</span>
				</div>
				<div class="fake-cat-info">
					<span class="fake-cat-name">Alpha Mail</span>
					<span class="fake-cat-desc">Alpha &amp; beta builds for testers.</span>
				</div>
				<div class="fake-chkbox fake-chkbox--on">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
						><path
							d="M3 8l4 4 6-8"
							stroke="white"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/></svg
					>
				</div>
			</div>
			<div class="fake-cat-div"></div>
			<!-- Graceful Tools — unchecked -->
			<div class="fake-cat-row">
				<div class="fake-cat-pic fake-cp-grace">
					<svg width="14" height="14" viewBox="0 0 14 14" fill="white" aria-hidden="true"
						><rect x="6" y="1" width="2" height="12" rx="1" /><rect
							x="1"
							y="5"
							width="12"
							height="2"
							rx="1"
						/></svg
					>
				</div>
				<div class="fake-cat-info">
					<span class="fake-cat-name">Graceful Tools</span>
					<span class="fake-cat-desc">Faith-based apps &amp; tools.</span>
				</div>
				<div class="fake-chkbox"></div>
			</div>
			<div class="fake-cat-div"></div>
			<!-- Nostr Native — unchecked (partially visible peek row) -->
			<div class="fake-cat-row">
				<div class="fake-cat-pic fake-cp-nostr">
					<svg width="13" height="13" viewBox="0 0 19 32" fill="white" aria-hidden="true"
						><path
							d="M18.8379 13.9711L8.84956 0.356086C8.30464 -0.386684 7.10438 0.128479 7.30103 1.02073L9.04686 8.94232C9.16268 9.46783 8.74887 9.96266 8.19641 9.9593L0.871032 9.91477C0.194934 9.91066 -0.223975 10.6293 0.126748 11.1916L7.69743 23.3297C7.99957 23.8141 7.73264 24.4447 7.16744 24.5816L5.40958 25.0076C4.70199 25.179 4.51727 26.0734 5.10186 26.4974L12.4572 31.8326C12.9554 32.194 13.6711 31.9411 13.8147 31.3529L15.8505 23.0152C16.0137 22.3465 15.3281 21.7801 14.6762 22.0452L13.0661 22.7001C12.5619 22.9052 11.991 22.6092 11.8849 22.0877L10.7521 16.5224C10.6486 16.014 11.038 15.5365 11.5704 15.5188L18.1639 15.2998C18.8529 15.2769 19.2383 14.517 18.8379 13.9711Z"
						/></svg
					>
				</div>
				<div class="fake-cat-info">
					<span class="fake-cat-name">Nostr Native</span>
					<span class="fake-cat-desc">Pure Nostr-native apps.</span>
				</div>
				<div class="fake-chkbox"></div>
			</div>
		</div>
	</div>
{/snippet}

<style>
	/* ════════════════════════════════════════════════════════════
	   MOBILE horizontal scroll
	   ════════════════════════════════════════════════════════════ */
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
		aspect-ratio: 1 / 1;
		border-radius: 1.125rem;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	/* Medium (tablet): fixed width + height so shader masks match mobile/desktop; block centered */
	@media (min-width: 640px) and (max-width: 767px) {
		.mob-img-wrap {
			width: 360px;
			height: 320px;
			aspect-ratio: auto;
			margin-left: auto;
			margin-right: auto;
		}
	}
	@media (min-width: 768px) and (max-width: 1023px) {
		.mob-img-wrap {
			width: 400px;
			height: 380px;
			aspect-ratio: auto;
			margin-left: auto;
			margin-right: auto;
		}
	}
	/* Center fake UI (security/catalog) on medium so it’s not left-aligned; shader still applies to wrap */
	@media (min-width: 640px) and (max-width: 767px) {
		.mob-sec-wrap .fake-scaler-mob,
		.mob-cat-wrap .fake-scaler-cat-mob {
			left: 50%;
			transform: translate(-50%, -50%) scale(0.86);
			transform-origin: center center;
		}
	}
	@media (min-width: 768px) and (max-width: 1023px) {
		.mob-sec-wrap .fake-scaler-mob,
		.mob-cat-wrap .fake-scaler-cat-mob {
			left: 50%;
			transform: translate(-50%, -50%) scale(0.95);
			transform-origin: center center;
		}
	}

	.mob-img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.mob-panel {
		padding: 1.25rem 1.5rem 1.5rem;
		background: hsl(var(--gray33));
		border-radius: 1.125rem;
	}

	.mob-title {
		font-size: 1.125rem;
		font-weight: 600;
		line-height: 1.3;
		margin: 0 0 0.4rem;
		color: hsl(var(--white));
	}

	.mob-desc {
		font-size: 1rem;
		line-height: 1.55;
		margin: 0;
		color: hsl(var(--white66));
	}

	/* ════════════════════════════════════════════════════════════
	   DESKTOP animated tabs
	   ════════════════════════════════════════════════════════════ */
	.feature-tabs {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		justify-content: flex-start;
	}

	@media (min-width: 1024px) {
		.feature-tabs {
			gap: 0;
		}
	}

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
		background-color: hsl(var(--white4));
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
		background-color: hsl(var(--gray33));
	}

	.tab-title {
		font-size: 1.125rem;
		font-weight: 600;
		line-height: 1.3;
		margin: 0 0 0.35rem;
		transition: color 0.4s ease;
		color: hsl(var(--white66));
	}

	@media (min-width: 640px) {
		.tab-title {
			font-size: 1.25rem;
		}
	}

	.feature-tab.active .tab-title {
		color: hsl(var(--white));
	}

	.tab-desc {
		font-size: 1rem;
		line-height: 1.55;
		margin: 0;
		transition: color 0.4s ease;
		color: hsl(var(--white33));
	}

	.feature-tab.active .tab-desc {
		color: hsl(var(--white66));
	}

	.feature-image-wrap {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 280px;
		padding: 1.25rem;
		overflow: hidden;
	}

	.feature-img {
		position: absolute;
		inset: 1.25rem;
		width: calc(100% - 2.5rem);
		height: calc(100% - 2.5rem);
		object-fit: contain;
		opacity: 0;
		filter: blur(10px);
		transform: scale(0.97);
		transition:
			opacity 0.6s ease,
			filter 0.6s ease,
			transform 0.6s ease;
		pointer-events: none;
	}

	.feature-img.visible {
		opacity: 1;
		filter: blur(0);
		transform: scale(1);
		pointer-events: auto;
	}

	/* ══════════════════════════════════════════════════════════════
	   FAKE APP UI SCREENSHOT
	   All elements sized at 1× (matching the real app).
	   .fake-scaler applies transform:scale() to blow it up.
	   Top + right + bottom edges are masked on the container.
	   ══════════════════════════════════════════════════════════════ */

	/* ── Mobile wrap override ─────────────────────────────────── */
	.mob-sec-wrap {
		padding: 0;
		position: relative;
		/* iOS WebKit: promote layer so dual-mask composite rasterizes reliably (no geometry change). */
		transform: translateZ(0);
		-webkit-backface-visibility: hidden;
		backface-visibility: hidden;
		-webkit-mask-image:
			linear-gradient(to bottom, transparent 0%, black 24%, black 68%, transparent 100%),
			linear-gradient(to right, black 0%, black 54%, transparent 89%);
		mask-image:
			linear-gradient(to bottom, transparent 0%, black 24%, black 68%, transparent 100%),
			linear-gradient(to right, black 0%, black 54%, transparent 89%);
		-webkit-mask-composite: destination-in;
		mask-composite: intersect;
	}

	/* ── Scale wrapper — anchored at vertical center ─────────── */
	.fake-scaler {
		position: absolute;
		top: 50%;
		left: 0;
		transform-origin: left center;
		pointer-events: none;
		user-select: none;
	}

	.fake-scaler-mob {
		transform: translateY(-50%) scale(1.32);
	}
	.fake-scaler-desktop {
		transform: translateY(-50%) scale(1.58);
	}

	/* ── Fake UI at natural (1×) size ────────────────────────── */
	.fake-ui {
		width: 420px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 16px 14px 18px;
	}

	.fake-desc {
		font-size: 0.9375rem;
		line-height: 1.1;
		color: hsl(var(--white66));
		margin: 0;
		white-space: nowrap;
	}

	.fake-desc-block {
		display: flex;
		flex-direction: column;
		gap: 5px;
		margin-bottom: 4px;
	}

	.fake-desc-dim {
		color: hsl(var(--white33));
	}

	.fake-panels {
		display: flex;
		gap: 12px;
	}

	/* matches .info-panel */
	.fake-panel {
		background-color: hsl(var(--white8));
		border-radius: 16px;
		padding: 8px 16px 10px;
		display: flex;
		flex-direction: column;
	}

	.fake-panel-sec {
		flex: 1.618;
		min-width: 0;
	}
	.fake-panel-rel {
		flex: 1;
		min-width: 0;
	}

	/* matches .panel-header */
	.fake-panel-hdr {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--white));
		margin-bottom: 4px;
	}

	/* matches .panel-list-item */
	.fake-sec-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 1px 0;
		font-size: 0.875rem;
		color: hsl(var(--white66));
	}

	.fake-chk {
		flex-shrink: 0;
		width: 20px;
		height: 14px;
		overflow: visible;
	}

	/* Stroke via CSS so hsl(var(--blurpleColor)) resolves on WebKit (presentation attrs often do not). */
	.fake-chk path {
		fill: none;
		stroke: hsl(var(--blurpleColor));
		stroke-width: 2.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* Fake SocialTabs pill row — matches .tab-row exactly */
	.fake-tab-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 2px;
		margin-top: 4px;
	}

	/* Active pill: btn-primary-small + tab-selected (gradient-blurple66) */
	.fake-tab-active {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 32px;
		padding: 0 14px;
		font-size: 14px;
		font-weight: 500;
		color: white;
		background-image: var(--gradient-blurple66);
		border-radius: 9999px;
		flex-shrink: 0;
	}

	/* Inactive pill: btn-secondary-small */
	.fake-tab-inactive {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 32px;
		padding: 0 14px;
		font-size: 14px;
		font-weight: 500;
		color: hsl(var(--white66));
		background-color: hsl(var(--gray66));
		border-radius: 9999px;
		flex-shrink: 0;
	}

	.fake-tab-count {
		display: inline-flex;
		align-items: center;
		gap: 1px;
		color: hsl(0 0% 100% / 0.44);
	}

	/* ── Desktop transition wrapper ───────────────────────────── */
	.feature-sec-panel {
		position: absolute;
		inset: 0;
		overflow: hidden;
		-webkit-backface-visibility: hidden;
		backface-visibility: hidden;
		opacity: 0;
		filter: blur(10px);
		transform: translateZ(0) scale(0.97);
		transition:
			opacity 0.6s ease,
			filter 0.6s ease,
			transform 0.6s ease;
		pointer-events: none;
		-webkit-mask-image:
			linear-gradient(to bottom, transparent 0%, black 22%, black 68%, transparent 100%),
			linear-gradient(to right, black 0%, black 54%, transparent 89%);
		mask-image:
			linear-gradient(to bottom, transparent 0%, black 22%, black 68%, transparent 100%),
			linear-gradient(to right, black 0%, black 54%, transparent 89%);
		-webkit-mask-composite: destination-in;
		mask-composite: intersect;
	}

	.feature-sec-panel.visible {
		opacity: 1;
		filter: blur(0);
		transform: translateZ(0) scale(1);
		pointer-events: auto;
	}

	/* ── Catalog-specific wrappers (more generous right mask) ─── */
	.mob-cat-wrap {
		padding: 0;
		position: relative;
		transform: translateZ(0);
		-webkit-backface-visibility: hidden;
		backface-visibility: hidden;
		-webkit-mask-image:
			linear-gradient(to bottom, transparent 0%, black 20%, black 68%, transparent 100%),
			linear-gradient(to right, black 0%, black 60%, transparent 88%);
		mask-image:
			linear-gradient(to bottom, transparent 0%, black 20%, black 68%, transparent 100%),
			linear-gradient(to right, black 0%, black 60%, transparent 88%);
		-webkit-mask-composite: destination-in;
		mask-composite: intersect;
	}

	.feature-cat-panel {
		position: absolute;
		inset: 0;
		overflow: hidden;
		-webkit-backface-visibility: hidden;
		backface-visibility: hidden;
		opacity: 0;
		filter: blur(10px);
		transform: translateZ(0) scale(0.97);
		transition:
			opacity 0.6s ease,
			filter 0.6s ease,
			transform 0.6s ease;
		pointer-events: none;
		-webkit-mask-image:
			linear-gradient(to bottom, transparent 0%, black 18%, black 68%, transparent 100%),
			linear-gradient(to right, black 0%, black 62%, transparent 90%);
		mask-image:
			linear-gradient(to bottom, transparent 0%, black 18%, black 68%, transparent 100%),
			linear-gradient(to right, black 0%, black 62%, transparent 90%);
		-webkit-mask-composite: destination-in;
		mask-composite: intersect;
	}
	.feature-cat-panel.visible {
		opacity: 1;
		filter: blur(0);
		transform: translateZ(0) scale(1);
		pointer-events: auto;
	}

	/* Catalog scalers — shifted down so top edge + 4th row peek visible */
	.fake-scaler-cat-mob {
		transform: translateY(-30%) scale(1.32);
	}
	.fake-scaler-cat-desktop {
		transform: translateY(-28%) scale(1.58);
	}

	/* Width controls how far right the checkboxes land in the frame */
	.fake-ui-cat {
		width: 295px;
		padding: 10px 0 14px;
	}

	/* ── Fake catalog list UI ─────────────────────────────────── */
	.fake-cat-card {
		background: hsl(var(--gray33));
		border-radius: 16px;
		overflow: hidden;
		border: 0.5px solid hsl(var(--white8));
	}

	/* Header: more breathing room above, tight gap below so it hugs first row */
	.fake-cat-hdr {
		padding: 14px 16px 3px;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: hsl(var(--white33));
	}

	.fake-cat-div {
		height: 1px;
		background: hsl(var(--white8));
	}

	.fake-cat-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 16px;
	}

	/* Round profile-pic-style circle */
	.fake-cat-pic {
		width: 42px;
		height: 42px;
		border-radius: 50%;
		border: 0.33px solid hsl(var(--white16));
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}
	.fake-cp-zap {
		background: hsl(var(--blurpleColor));
	}
	.fake-cp-alpha {
		background: linear-gradient(135deg, #4f35bb, #8866dd);
	}
	.fake-cp-grace {
		background: linear-gradient(135deg, #1e7a4a, #2fa86b);
	}
	.fake-cp-nostr {
		background: linear-gradient(135deg, #b85c00, #e07820);
	}

	.fake-cat-logo {
		filter: brightness(0) invert(1);
		object-fit: contain;
	}

	.fake-cat-init {
		font-size: 1.0625rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.92);
		line-height: 1;
		user-select: none;
	}

	.fake-cat-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.fake-cat-name {
		font-size: 0.9375rem;
		font-weight: 600;
		color: hsl(var(--white));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.fake-cat-desc {
		font-size: 0.8125rem;
		color: hsl(var(--white33));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Fake checkbox — mirrors Checkbox.svelte visuals */
	.fake-chkbox {
		width: 24px;
		height: 24px;
		border-radius: 8px;
		border: 1.5px solid hsl(var(--white33));
		background: hsl(var(--black33));
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.fake-chkbox--on {
		background: var(--gradient-blurple);
		border-color: transparent;
	}
</style>
