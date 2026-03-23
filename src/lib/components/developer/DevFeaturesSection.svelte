<script>
	import { onMount, onDestroy } from 'svelte';
	import Check from '$lib/components/icons/Check.svelte';
	import Zap from '$lib/components/icons/Zap.svelte';

	const cards = [
		{
			id: 'ship',
			title: 'Ship in seconds',
			description:
				'Sign and publish directly to users. No approval queue, no reviewer. Your release, your timeline.'
		},
		{
			id: 'earn',
			title: 'Own your earnings',
			description:
				'Keep everything you earn. Accept zaps directly from users, no platform cuts or middlemen.'
		},
		{
			id: 'users',
			title: 'Insights & interaction',
			description: 'Track downloads, earnings and interaction around your releases.'
		}
	];

	// Tab switching
	const INTERVAL = 11000;
	let activeIndex = 0;
	/** @type {ReturnType<typeof setInterval>|null} */ let timer = null;
	/** @type {IntersectionObserver|null} */ let observer = null;
	/** @type {HTMLElement|null} */ let sectionEl = null;

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
			(e) => {
				if (e[0].isIntersecting) startTimer();
				else stopTimer();
			},
			{ threshold: 0.2 }
		);
		if (sectionEl) observer.observe(sectionEl);
	});
	onDestroy(() => {
		stopTimer();
		if (observer) observer.disconnect();
	});
</script>

<section bind:this={sectionEl} class="border-t border-b border-white/[0.07] py-8 sm:py-10 lg:py-14">
	<!-- ── MOBILE ─────────────────────────────────────────────────────── -->
	<div class="mobile-scroll lg:hidden">
		<div class="mobile-scroll-inner">
		{#each cards as card (card.id)}
			<div class="mob-card">
				<div class="mob-img-wrap">
					{#if card.id === 'ship'}
							<div class="confirm-wrap">
								<div class="confirm-scaler">
									<div class="fake-success-screen">
										<div class="fsc-top">
											<Check
												size={40}
												color="hsl(var(--blurpleColor))"
												variant="outline"
												strokeWidth={2.1}
											/>
											<p class="fsc-title">Success!</p>
										</div>
										<div class="fsc-divider"></div>
										<div class="fsc-app-row">
											<div class="fsc-app-icon-wrap fsc-app-icon-dark">
												<svg
													viewBox="0 0 24 24"
													fill="none"
													width="24"
													height="24"
													aria-hidden="true"
												>
													<rect
														x="2"
														y="7"
														width="13"
														height="10"
														rx="2"
														stroke="rgba(255,255,255,0.66)"
														stroke-width="1.5"
													/>
													<path
														d="M15 10.5l5-3v9l-5-3V10.5z"
														stroke="rgba(255,255,255,0.66)"
														stroke-width="1.5"
														stroke-linejoin="round"
													/>
												</svg>
											</div>
											<div class="fsc-app-meta">
												<span class="fsc-app-name">Video Razor</span>
												<span class="fsc-app-ver">v1.2.0</span>
											</div>
										</div>
										<div class="fsc-divider"></div>
										<div class="fsc-checks">
											<div class="fsc-check-item">
												<div class="fsc-cat-pic">
													<img
														src="/images/logo.svg"
														class="fsc-cat-logo"
														alt=""
														aria-hidden="true"
													/>
												</div>
												<span>Accepted in Zapstore catalog</span>
											</div>
											<div class="fsc-check-item">
												<div class="fsc-relay-wrap">
													<img
														src="/images/emoji/relay.png"
														class="fsc-relay-emoji"
														width="18"
														height="18"
														alt=""
														aria-hidden="true"
													/>
												</div>
												<span>Stored on 21 relays</span>
											</div>
										</div>
									</div>
								</div>
							</div>
						{:else if card.id === 'earn'}
							<div class="zap-feed-wrap">
								<svg width="0" height="0" style="position:absolute" aria-hidden="true"
									><defs
										><linearGradient id="fzb-gold" x1="0" y1="0" x2="1" y2="1"
											><stop offset="0%" stop-color="#FFC736" /><stop
												offset="100%"
												stop-color="#FFA037"
											/></linearGradient
										></defs
									></svg
								>
								<div class="zap-feed">
									<div class="fake-zap">
										<img
											src="/images/profiles/the-axiom.png"
											class="fzb-pic"
											alt=""
											aria-hidden="true"
										/>
										<div class="fzb-bubble">
											<div class="fzb-hdr">
												<span class="fzb-name">The Axiom</span>
												<div class="fzb-amount">
					<Zap size={13} color="url(#fzb-gold)" /><span class="fzb-sats">100</span>
												</div>
											</div>
										</div>
									</div>
									<div class="fake-zap">
										<img
											src="/images/profiles/zach.png"
											class="fzb-pic"
											alt=""
											aria-hidden="true"
										/>
										<div class="fzb-bubble">
											<div class="fzb-hdr">
												<span class="fzb-name">Zach</span>
												<div class="fzb-amount">
					<Zap size={13} color="url(#fzb-gold)" /><span class="fzb-sats">21</span>
												</div>
											</div>
											<p class="fzb-msg">Great UX on this one!</p>
										</div>
									</div>
									<div class="fake-zap">
										<img
											src="/images/profiles/jane-clementt.png"
											class="fzb-pic"
											alt=""
											aria-hidden="true"
										/>
										<div class="fzb-bubble">
											<div class="fzb-hdr">
												<span class="fzb-name">Jane Clement</span>
												<div class="fzb-amount">
					<Zap size={13} color="url(#fzb-gold)" /><span class="fzb-sats">5K</span>
												</div>
											</div>
											<p class="fzb-msg">
												What a snappy app! Are you guys planning Community support any time?
											</p>
										</div>
									</div>
									<div class="fake-zap">
										<img
											src="/images/profiles/niel-liesmons.png"
											class="fzb-pic"
											alt=""
											aria-hidden="true"
										/>
										<div class="fzb-bubble">
											<div class="fzb-hdr">
												<span class="fzb-name">Niel Liesmons</span>
												<div class="fzb-amount">
					<Zap size={13} color="url(#fzb-gold)" /><span class="fzb-sats">2.1K</span>
												</div>
											</div>
											<p class="fzb-msg">Notifications work flawlessly now. Great job!</p>
										</div>
									</div>
									<div class="fake-zap">
										<img
											src="/images/profiles/verbiricha.png"
											class="fzb-pic"
											alt=""
											aria-hidden="true"
										/>
										<div class="fzb-bubble">
											<div class="fzb-hdr">
												<span class="fzb-name">Verbiricha</span>
												<div class="fzb-amount">
					<Zap size={13} color="url(#fzb-gold)" /><span class="fzb-sats">1K</span>
												</div>
											</div>
											<p class="fzb-msg">Keep it coming!</p>
										</div>
									</div>
									<div class="fake-zap">
										<img src="/images/profiles/pip.png" class="fzb-pic" alt="" aria-hidden="true" />
										<div class="fzb-bubble">
											<div class="fzb-hdr">
												<span class="fzb-name">Pip</span>
												<div class="fzb-amount">
					<Zap size={13} color="url(#fzb-gold)" /><span class="fzb-sats">500</span>
												</div>
											</div>
											<p class="fzb-msg">noice</p>
										</div>
									</div>
								</div>
							</div>
						{:else if card.id === 'users'}
							<div class="insights-stage">
								<img
									src="/images/insights-downloads.png"
									class="insights-img"
									alt=""
									aria-hidden="true"
								/>
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

	<!-- ── DESKTOP ────────────────────────────────────────────────────── -->
	<div class="hidden lg:block">
		<div class="container mx-auto px-4 sm:px-6 md:px-8 lg:px-8">
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-stretch">
				<div class="feature-tabs lg:py-8 lg:pl-7 lg:pr-8">
					{#each cards as card, i (card.id)}
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

				<div class="feature-visual-wrap">
					{#each cards as card, i (card.id)}
						<div class="feature-visual-panel" class:visible={activeIndex === i}>
							{#if card.id === 'ship'}
								<div class="confirm-wrap">
									<div class="confirm-scaler">
										<div class="fake-success-screen">
											<div class="fsc-top">
												<Check
													size={40}
													color="hsl(var(--blurpleColor))"
													variant="outline"
													strokeWidth={2.1}
												/>
												<p class="fsc-title">Success!</p>
											</div>
											<div class="fsc-divider"></div>
											<div class="fsc-app-row">
												<div class="fsc-app-icon-wrap fsc-app-icon-dark">
													<svg
														viewBox="0 0 24 24"
														fill="none"
														width="24"
														height="24"
														aria-hidden="true"
													>
														<rect
															x="2"
															y="7"
															width="13"
															height="10"
															rx="2"
															stroke="rgba(255,255,255,0.66)"
															stroke-width="1.5"
														/>
														<path
															d="M15 10.5l5-3v9l-5-3V10.5z"
															stroke="rgba(255,255,255,0.66)"
															stroke-width="1.5"
															stroke-linejoin="round"
														/>
													</svg>
												</div>
												<div class="fsc-app-meta">
													<span class="fsc-app-name">Video Razor</span>
													<span class="fsc-app-ver">v1.2.0</span>
												</div>
											</div>
											<div class="fsc-divider"></div>
											<div class="fsc-checks">
												<div class="fsc-check-item">
													<div class="fsc-cat-pic">
													<img
														src="/images/logo.svg"
														class="fsc-cat-logo"
														alt=""
														aria-hidden="true"
													/>
													</div>
													<span>Accepted in Zapstore catalog</span>
												</div>
												<div class="fsc-check-item">
													<div class="fsc-relay-wrap">
														<img
															src="/images/emoji/relay.png"
															class="fsc-relay-emoji"
															width="18"
															height="18"
															alt=""
															aria-hidden="true"
														/>
													</div>
													<span>Stored on 21 relays</span>
												</div>
											</div>
										</div>
									</div>
								</div>
							{:else if card.id === 'earn'}
								<div class="zap-feed-wrap">
									<svg width="0" height="0" style="position:absolute" aria-hidden="true"
										><defs
											><linearGradient id="fzb-gold-d" x1="0" y1="0" x2="1" y2="1"
												><stop offset="0%" stop-color="#FFC736" /><stop
													offset="100%"
													stop-color="#FFA037"
												/></linearGradient
											></defs
										></svg
									>
									<div class="zap-feed">
										<div class="fake-zap">
											<img src="/images/profiles/the-axiom.png" class="fzb-pic" alt="" aria-hidden="true"/>
											<div class="fzb-bubble">
												<div class="fzb-hdr">
													<span class="fzb-name">The Axiom</span>
													<div class="fzb-amount"><Zap size={13} color="url(#fzb-gold-d)" /><span class="fzb-sats">100</span></div>
												</div>
											</div>
										</div>
										<div class="fake-zap">
											<img src="/images/profiles/zach.png" class="fzb-pic" alt="" aria-hidden="true"/>
											<div class="fzb-bubble">
												<div class="fzb-hdr">
													<span class="fzb-name">Zach</span>
													<div class="fzb-amount"><Zap size={13} color="url(#fzb-gold-d)" /><span class="fzb-sats">21</span></div>
												</div>
												<p class="fzb-msg">Great UX on this one!</p>
											</div>
										</div>
										<div class="fake-zap">
											<img src="/images/profiles/jane-clementt.png" class="fzb-pic" alt="" aria-hidden="true"/>
											<div class="fzb-bubble">
												<div class="fzb-hdr">
													<span class="fzb-name">Jane Clement</span>
													<div class="fzb-amount"><Zap size={13} color="url(#fzb-gold-d)" /><span class="fzb-sats">5K</span></div>
												</div>
												<p class="fzb-msg">What a snappy app! Are you guys planning Community support any time?</p>
											</div>
										</div>
										<div class="fake-zap">
											<img
												src="/images/profiles/niel-liesmons.png"
												class="fzb-pic"
												alt=""
												aria-hidden="true"
											/>
											<div class="fzb-bubble">
												<div class="fzb-hdr">
													<span class="fzb-name">Niel Liesmons</span>
													<div class="fzb-amount">
					<Zap size={13} color="url(#fzb-gold-d)" /><span class="fzb-sats">2.1K</span>
													</div>
												</div>
												<p class="fzb-msg">Notifications work flawlessly now. Great job!</p>
											</div>
										</div>
										<div class="fake-zap">
											<img
												src="/images/profiles/verbiricha.png"
												class="fzb-pic"
												alt=""
												aria-hidden="true"
											/>
											<div class="fzb-bubble">
												<div class="fzb-hdr">
													<span class="fzb-name">Verbiricha</span>
													<div class="fzb-amount">
					<Zap size={13} color="url(#fzb-gold-d)" /><span class="fzb-sats">1K</span>
													</div>
												</div>
												<p class="fzb-msg">Keep it coming!</p>
											</div>
										</div>
										<div class="fake-zap">
											<img
												src="/images/profiles/pip.png"
												class="fzb-pic"
												alt=""
												aria-hidden="true"
											/>
											<div class="fzb-bubble">
												<div class="fzb-hdr">
													<span class="fzb-name">Pip</span>
													<div class="fzb-amount">
					<Zap size={13} color="url(#fzb-gold-d)" /><span class="fzb-sats">500</span>
													</div>
												</div>
												<p class="fzb-msg">noice</p>
											</div>
										</div>
									</div>
								</div>
							{:else if card.id === 'users'}
								<div class="insights-stage">
									<img
										src="/images/insights-downloads.png"
										class="insights-img"
										alt=""
										aria-hidden="true"
									/>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	/* ── Mobile scroll ───────────────────────────────────────────────── */
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
		aspect-ratio: 1/1;
		border-radius: 1.125rem;
		overflow: hidden;
		padding: 1rem;
	}
	/* Medium (tablet): fixed width + height so image areas don't grow unbounded; block centered */
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
		color: hsl(var(--foreground));
	}
	.mob-desc {
		font-size: 1rem;
		line-height: 1.55;
		margin: 0;
		color: hsl(var(--white66));
	}

	/* ── Desktop tabs ───────────────────────────────────────────────── */
	.feature-tabs {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		justify-content: center;
	}
	.feature-tab {
		position: relative;
		text-align: left;
		width: 100%;
		padding: 1.25rem 1.5rem 1.35rem;
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
		color: hsl(var(--foreground));
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

	/* ── Desktop visual panel ───────────────────────────────────────── */
	.feature-visual-wrap {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 320px;
		display: flex;
		align-items: stretch;
	}
	.feature-visual-panel {
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
	.feature-visual-panel.visible {
		opacity: 1;
		filter: blur(0);
		transform: scale(1);
		pointer-events: auto;
	}

	/* ── Insights image ─────────────────────────────────────────────── */
	.insights-stage {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
		padding: 1.5rem;
		-webkit-mask-image:
			linear-gradient(to bottom, black 0%, black 58%, transparent 94%),
			linear-gradient(to right, transparent 0%, black 18%, black 100%);
		mask-image:
			linear-gradient(to bottom, black 0%, black 58%, transparent 94%),
			linear-gradient(to right, transparent 0%, black 18%, black 100%);
		-webkit-mask-composite: destination-in;
		mask-composite: intersect;
	}
	.insights-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: top center;
		display: block;
		border-radius: 0.875rem;
	}

	/* ── Success confirmation fake-UI ───────────────────────────────── */
	.confirm-wrap {
		width: 100%;
		height: 100%;
		overflow: hidden;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 12px;
		-webkit-mask-image: linear-gradient(to bottom, black 0%, black 60%, transparent 92%);
		mask-image: linear-gradient(to bottom, black 0%, black 60%, transparent 92%);
	}
	.confirm-scaler {
		width: 100%;
	}
	.fake-success-screen {
		width: 100%;
		background: hsl(var(--gray33));
		border: 1px solid hsl(var(--white8));
		border-radius: 1.25rem;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}
	.fsc-top {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 20px 14px 22px;
		gap: 4px;
	}
	.fsc-title {
		font-size: 1.8rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		margin: 0;
		line-height: 1.2;
	}
	.fsc-divider {
		height: 1px;
		background: hsl(var(--white8));
		width: 100%;
	}
	.fsc-app-row {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		padding: 16px 14px;
		width: 100%;
		text-align: left;
	}
	.fsc-app-icon-wrap {
		width: 53px;
		height: 53px;
		border-radius: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		overflow: hidden;
	}
	.fsc-app-icon-dark {
		background: #000;
	}
	.fsc-app-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.fsc-app-name {
		font-size: 1.125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		line-height: 1.25;
	}
	.fsc-app-ver {
		font-size: 0.975rem;
		color: hsl(var(--white33));
	}
	.fsc-checks {
		width: 100%;
		display: flex;
		flex-direction: column;
		padding: 13px 14px 53px;
		gap: 7px;
	}
	.fsc-check-item {
		display: flex;
		align-items: center;
		gap: 11px;
		font-size: 1.05rem;
		color: hsl(var(--white66));
		text-align: left;
	}
	.fsc-cat-pic {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: hsl(var(--blurpleColor));
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		overflow: hidden;
	}
	.fsc-cat-logo {
		width: 62%;
		height: 62%;
		object-fit: contain;
		filter: brightness(0) invert(1);
	}
	.fsc-relay-wrap {
		width: 26px;
		height: 26px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.fsc-relay-emoji {
		width: 22px;
		height: 22px;
		object-fit: contain;
	}
	@media (min-width: 1024px) {
		.confirm-wrap {
			padding-top: 20px;
		}
		.fsc-top {
			padding: 26px 19px 29px;
			gap: 5px;
		}
		.fsc-top :global(.inline-flex) {
			width: 53px !important;
			height: 53px !important;
		}
		.fsc-top :global(.inline-flex svg) {
			width: 53px !important;
			height: 53px !important;
		}
		.fsc-title {
			font-size: 2.4rem;
		}
		.fsc-app-row {
			padding: 21px 19px;
			gap: 1.2rem;
		}
		.fsc-app-icon-wrap {
			width: 70px;
			height: 70px;
			border-radius: 19px;
		}
		.fsc-app-icon-wrap svg {
			width: 32px !important;
			height: 32px !important;
		}
		.fsc-app-name {
			font-size: 1.5rem;
		}
		.fsc-app-ver {
			font-size: 1.3rem;
		}
		.fsc-checks {
			padding: 18px 19px 70px;
			gap: 10px;
		}
		.fsc-check-item {
			font-size: 1.4rem;
			gap: 14px;
		}
		.fsc-cat-pic {
			width: 35px;
			height: 35px;
		}
		.fsc-relay-wrap {
			width: 35px;
			height: 35px;
		}
		.fsc-relay-emoji {
			width: 29px;
			height: 29px;
		}
	}

	/* ── Fake zap feed ──────────────────────────────────────────────── */
	.zap-feed-wrap {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
		padding: 0 1rem;
		display: flex;
		align-items: center;
		-webkit-mask-image: linear-gradient(
			to bottom,
			transparent 0%,
			black 16%,
			black 74%,
			transparent 100%
		);
		mask-image: linear-gradient(to bottom, transparent 0%, black 16%, black 74%, transparent 100%);
	}
	.zap-feed {
		display: flex;
		flex-direction: column;
		gap: 10px;
		width: 100%;
	}
	.fake-zap {
		display: flex;
		align-items: flex-end;
		gap: 8px;
	}
	.fzb-pic {
		width: 42px;
		height: 42px;
		border-radius: 50%;
		flex-shrink: 0;
		object-fit: cover;
		border: 1px solid hsl(var(--white8));
	}
	.fzb-bubble {
		background: radial-gradient(
			circle at top left,
			rgba(255, 199, 54, 0.1) 0%,
			rgba(255, 160, 55, 0.08) 100%
		);
		border-radius: 16px 16px 16px 4px;
		padding: 9px 14px;
		width: fit-content;
		max-width: calc(100% - 50px);
	}
	.fzb-hdr {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
	}
	.fzb-name {
		font-size: 0.9375rem;
		font-weight: 600;
		background: linear-gradient(135deg, #ffc736, #ffa037);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		white-space: nowrap;
	}
	.fzb-amount {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}
	.fzb-sats {
		font-size: 0.9375rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}
	.fzb-msg {
		font-size: 1rem;
		line-height: 1.5;
		color: hsl(var(--foreground) / 0.85);
		margin: 4px 0 0;
	}
</style>
