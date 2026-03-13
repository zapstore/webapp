<script>
	import { onMount, onDestroy } from 'svelte';
	import Cross from '$lib/components/icons/Cross.svelte';

	const jane = {
		name: 'Jane Clement',
		pic: '/images/profiles/jane-clementt.png'
	};

	const cards = [
		{
			placeholder: true,
			alt: '',
			title: 'Big Tech is Closing Down',
			description: 'Great apps are getting rejected. While malware still slips through.'
		},
		{
			chatPanel: true,
			alt: 'Chat showing app rejected from Play Store',
			title: 'Creating Apps is Easy Now',
			description:
				'So why is getting them to users still stuck behind gatekeepers, fees, and months-long reviews?'
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
			{ threshold: 0.2 }
		);
		if (sectionEl) observer.observe(sectionEl);
	});

	onDestroy(() => {
		stopTimer();
		if (observer) observer.disconnect();
	});
</script>

<section bind:this={sectionEl} class="border-t border-border/50 pt-0 pb-6 lg:pb-12">
	<!-- ── MOBILE: eyebrow badge + horizontal scroll ── -->
	<div class="lg:hidden">
		<div class="eyebrow-badge-wrap">
			<div class="eyebrow-badge">
				<Cross variant="outline" color="hsl(var(--destructive) / 0.66)" size={12} strokeWidth={1.4} />
				<p class="eyebrow-label" style="color: hsl(var(--white33)); font-size: 1rem;">
					You're missing out
				</p>
			</div>
		</div>
		<div class="mobile-scroll">
			<div class="mobile-scroll-inner">
				{#each cards as card (card.title)}
					<div class="mob-card">
						<div class="mob-img-wrap" class:mob-chat-wrap={card.chatPanel}>
							{#if card.chatPanel}
								{@render chatBubbles()}
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
					<Cross variant="outline" color="hsl(var(--destructive) / 0.66)" size={12} strokeWidth={1.4} />
					<p class="eyebrow-label" style="color: hsl(var(--white33)); font-size: 1rem;">
						You're missing out
					</p>
				</div>
			</div>
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-stretch">
				<!-- Left: image / panel display -->
				<div class="feature-image-wrap">
					{#each cards as card, i (card.title)}
						{#if card.chatPanel}
							<div class="feature-chat-panel" class:visible={activeIndex === i}>
								{@render chatBubbles()}
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

{#snippet chatBubbles()}
	<div class="chat-inner">
		<div class="msg-row">
			<img src={jane.pic} alt={jane.name} class="chat-pic" />
			<div class="bubble bubble-in">
				<span class="chat-name">{jane.name}</span>
				<p class="chat-text">
					Where can I get that app you built for our running group? Couldn't find it on Play Store.
				</p>
			</div>
		</div>
		<div class="user-group">
			<div class="msg-row msg-out">
				<div class="bubble bubble-out bubble-out-mid">
					<p class="chat-text">
						They keep refusing the app. Takes ages too, and quite some money. Just to get rejected
						every time.
					</p>
				</div>
			</div>
			<div class="msg-row msg-out">
				<div class="bubble bubble-out bubble-out-last">
					<p class="chat-text">For no reason</p>
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
		gap: 0.625rem;
		padding: 0.5rem 1.5rem 0.625rem;
		border-radius: 0 0 0.875rem 0.875rem;
		background-color: hsl(var(--white4));
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
		aspect-ratio: 1 / 1;
		border-radius: 1.125rem;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.mob-chat-wrap {
		padding: 1.25rem 1rem;
		align-items: flex-start;
		justify-content: center;
		background-color: hsl(var(--gray33) / 0.5);
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

	/* ── Image / panel wrap ─────────────────────────────────── */
	.feature-image-wrap {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 280px;
		padding: 1.25rem;
		overflow: hidden;
	}

	/* ── Chat panel ─────────────────────────────────────────── */
	.feature-chat-panel {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		padding: 2rem 1.75rem;
		opacity: 0;
		filter: blur(10px);
		transform: scale(0.97);
		transition:
			opacity 0.6s ease,
			filter 0.6s ease,
			transform 0.6s ease;
		pointer-events: none;
	}

	.feature-chat-panel.visible {
		opacity: 1;
		filter: blur(0);
		transform: scale(1);
		pointer-events: auto;
	}

	/* ── Empty panel (placeholder for tabs 2 & 3) ─────────── */
	.feature-empty-panel {
		position: absolute;
		inset: 0;
		opacity: 0;
		pointer-events: none;
	}

	.feature-empty-panel.visible {
		opacity: 1;
	}

	/* ════════════════════════════════════════════════════════════
	   CHAT BUBBLES (shared between mobile + desktop)
	   ════════════════════════════════════════════════════════════ */
	.chat-inner {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		width: 100%;
	}

	.msg-row {
		display: flex;
		align-items: flex-end;
		gap: 10px;
		width: 100%;
	}

	.msg-out {
		justify-content: flex-end;
	}

	.user-group {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.chat-pic {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		flex-shrink: 0;
		object-fit: cover;
		border: 1px solid hsl(var(--white8));
	}

	@media (min-width: 1024px) {
		.chat-pic {
			width: 52px;
			height: 52px;
		}
	}

	.bubble {
		padding: 9px 12px 10px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	@media (min-width: 1024px) {
		.bubble {
			padding: 10px 14px 11px;
		}
	}

	.bubble-in {
		background-color: hsl(var(--gray33));
		border-radius: 18px 18px 18px 4px;
		max-width: calc(100% - 56px - 0.75rem);
	}

	.bubble-out {
		background-color: hsl(var(--blurpleColor66));
		max-width: 76%;
		margin-left: auto;
	}

	.bubble-out-mid {
		border-radius: 18px;
	}

	.bubble-out-last {
		border-radius: 18px 18px 4px 18px;
	}

	.chat-name {
		font-size: 0.9375rem;
		font-weight: 600;
		line-height: 1.2;
		display: block;
		color: #e8a840;
	}

	.chat-text {
		font-size: 0.9375rem;
		line-height: 1.5;
		margin: 0;
		color: hsl(var(--foreground));
	}

	.bubble-out .chat-text {
		color: hsl(var(--white));
	}
</style>
