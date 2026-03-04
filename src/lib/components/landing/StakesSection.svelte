<script>
	const rows = [
		{
			old: "Big tech, closed source. No way to verify what you're actually installing.",
			zapstore:
				'Open source. The app you get is exactly what the developer published. Cryptographically verified.'
		},
		{
			old: 'Opaque review: legitimate apps rejected, harmful ones slip through.',
			zapstore: 'You choose which catalog to trust. Switch or add your own anytime.'
		},
		{
			old: 'Algorithms push promoted apps. Discovery is pay-to-play.',
			zapstore: "Communities surface what's worth using. Tip developers directly ⚡"
		}
	];
</script>

<section class="stakes-section relative overflow-hidden">
	<!-- Faint blurple wash behind the content -->
	<div class="absolute inset-0 pointer-events-none" aria-hidden="true">
		<div class="stakes-bg-wash"></div>
	</div>

	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-11 sm:py-14 relative z-10">
		<div class="stakes-wrap">
			<!-- Column headers -->
			<div class="col-head col-head-old">The old way</div>
			<div class="col-head col-head-new">With Zapstore</div>

			{#each rows as row (row.old)}
				<div class="row-cell row-cell-old">
					<span class="x-icon" aria-hidden="true">✕</span>
					<span class="row-text row-text-old">{row.old}</span>
				</div>
				<div class="row-cell row-cell-new">
					<span class="check-icon" aria-hidden="true">✓</span>
					<span class="row-text row-text-new">{row.zapstore}</span>
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	.stakes-section {
		border-top: 1px solid hsl(var(--white11));
		border-bottom: 1px solid hsl(var(--white11));
	}

	.stakes-bg-wash {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(
				ellipse 70% 100% at 50% 50%,
				hsl(var(--blurpleColor) / 0.055) 0%,
				transparent 70%
			),
			linear-gradient(180deg, hsl(var(--blurpleColor) / 0.025) 0%, transparent 100%);
	}

	.stakes-wrap {
		display: grid;
		grid-template-columns: 1fr 1fr;
		max-width: 680px;
		margin: 0 auto;
	}

	.col-head {
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding-bottom: 0.75rem;
		border-bottom: 1.4px solid hsl(var(--white11));
	}

	.col-head-old {
		color: hsl(var(--white33));
		padding-right: 2rem;
	}

	.col-head-new {
		background: var(--gradient-white-blurple);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		padding-left: 2rem;
		border-left: 1.4px solid hsl(var(--white11));
	}

	.row-cell {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.875rem 0;
		border-bottom: 1.4px solid hsl(var(--white7));
		font-size: 0.9375rem;
	}

	.row-cell:nth-last-child(-n + 2) {
		border-bottom: none;
	}

	.row-cell-old {
		padding-right: 2rem;
	}

	.row-cell-new {
		padding-left: 2rem;
		border-left: 1.4px solid hsl(var(--white11));
	}

	.x-icon {
		font-size: 0.625rem;
		color: hsl(var(--white22));
		flex-shrink: 0;
		line-height: 1.6;
	}

	.check-icon {
		font-size: 0.75rem;
		color: hsl(var(--blurpleLightColor));
		flex-shrink: 0;
		line-height: 1.6;
	}

	.row-text-old {
		color: hsl(var(--white33));
	}

	.row-text-new {
		color: hsl(var(--white66));
	}

	@media (max-width: 479px) {
		.stakes-wrap {
			grid-template-columns: 1fr;
		}

		.col-head-old,
		.row-cell-old {
			display: none;
		}

		.col-head-new,
		.row-cell-new {
			padding-left: 0;
			border-left: none;
		}
	}
</style>
