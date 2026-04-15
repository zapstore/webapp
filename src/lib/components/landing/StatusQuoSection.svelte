<script>
	const cards = [
		{
			headline: 'Algorithms Have Replaced Word of Mouth',
			body: 'What you find in app stores is what paid to be found. Organic discovery is gone.'
		},
		{
			headline: 'Google Is Locking Down Android Sideloading',
			body: 'Starting September 2026, installing apps outside the Play Store will require Google approval. The last open mobile platform is closing.'
		},
		{
			headline: 'The Best Apps Will Never Reach the Play Store',
			body: 'AI is collapsing the cost of building software. A new generation of personal, niche apps built for friends and small communities was never meant to pass a store review.'
		},
		{
			headline: 'Trust in Big Tech Has Collapsed',
			body: 'A decade of scandals and broken promises has pushed confidence in major platforms to historic lows.'
		},
		{
			headline: 'Builders Surrender 30% to Exist',
			body: 'Platform commissions, shifting policies, arbitrary removals. Developers build on borrowed ground.'
		},
		{
			headline: 'Bitcoin Makes Direct Payments Instant',
			body: 'The Lightning Network enables frictionless micropayments between users and builders, no platform needed.'
		}
	];
</script>

<section class="border-t border-border/50 pt-10 sm:pt-14 lg:pt-16 pb-0">
	<div class="scroll-track">
		<div class="scroll-inner">
			{#each cards as card (card.headline)}
				<div class="card">
					<p class="card-headline">{card.headline}</p>
					<p class="card-body">{card.body}</p>
				</div>
			{/each}
			<div class="scroll-end-spacer" aria-hidden="true"></div>
		</div>
	</div>
</section>

<style>
	.scroll-track {
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
		scroll-snap-type: x mandatory;
		padding-left: 1rem;
	}
	@media (min-width: 640px) {
		.scroll-track {
			padding-left: 1.5rem;
		}
	}
	@media (min-width: 768px) {
		.scroll-track {
			padding-left: 2rem;
		}
	}
	@media (min-width: 1024px) {
		.scroll-track {
			padding-left: max(2rem, calc((100vw - 1280px) / 2 + 2rem));
		}
	}
	.scroll-track::-webkit-scrollbar {
		display: none;
	}

	.scroll-inner {
		display: flex;
		gap: 0.75rem;
		width: max-content;
		align-items: flex-end;
	}

	.card {
		width: 260px;
		flex-shrink: 0;
		scroll-snap-align: start;
		background-color: var(--gray33);
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		padding: 1.5rem 1.75rem 2rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	@media (min-width: 640px) {
		.card {
			width: 300px;
		}
	}
	@media (min-width: 1024px) {
		.card {
			width: 320px;
		}
	}

	.card-headline {
		font-size: 1.25rem;
		font-weight: 700;
		line-height: 1.2;
		color: var(--white);
		margin: 0;
	}
	@media (min-width: 1024px) {
		.card-headline {
			font-size: 1.375rem;
		}
	}

	.card-body {
		font-size: 0.9375rem;
		line-height: 1.55;
		color: var(--white66);
		margin: 0;
	}

	.scroll-end-spacer {
		width: 1rem;
		flex-shrink: 0;
	}
	@media (min-width: 640px) {
		.scroll-end-spacer {
			width: 1.5rem;
		}
	}
	@media (min-width: 768px) {
		.scroll-end-spacer {
			width: 2rem;
		}
	}
</style>
