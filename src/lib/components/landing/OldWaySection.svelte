<script>
	const rows = [
		{
			bad: "Big tech, closed source. No way to verify what you're actually installing.",
			good: 'Open source. The app you get is exactly what the developer published. Cryptographically verified.'
		},
		{
			bad: 'Opaque review: legitimate apps rejected, harmful ones slip through.',
			good: 'You choose which catalog to trust. Switch or add your own anytime.'
		},
		{
			bad: 'Algorithms push promoted apps. Discovery is pay-to-play.',
			good: "Communities surface what's worth using. Tip developers directly."
		}
	];
</script>

<section class="border-t border-border/50 py-8 sm:py-10 lg:py-12">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8">
		<div class="table-wrap">
			<!-- Header row -->
			<div class="table-header">
				<div class="col-header col-bad">The old way</div>
				<div class="col-header col-good">With Zapstore</div>
			</div>

			<!-- Rows -->
			{#each rows as row}
				<div class="table-row">
					<div class="table-cell cell-bad">
						<span class="mark mark-bad">✕</span>
						<p class="cell-text">{row.bad}</p>
					</div>
					<div class="table-cell cell-good">
						<span class="mark mark-good">✓</span>
						<p class="cell-text">{row.good}</p>
					</div>
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	.table-wrap {
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: 1.25rem;
		overflow: hidden;
	}

	/* ── Header ── */
	.table-header {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
	}
	.col-header {
		padding: 0.5rem 1.25rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.09em;
	}
	@media (min-width: 640px) {
		.col-header {
			padding: 0.5rem 1.75rem;
			font-size: 0.8125rem;
		}
	}
	.col-bad {
		color: hsl(var(--white33));
		border-right: 1px solid hsl(var(--border) / 0.5);
	}
	.col-good {
		color: hsl(var(--white66));
	}

	/* ── Rows ── */
	.table-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
	}
	.table-row:last-child {
		border-bottom: none;
	}
	.table-cell {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		padding: 1rem 1.25rem;
	}
	@media (min-width: 640px) {
		.table-cell {
			padding: 1.125rem 1.75rem;
			gap: 0.75rem;
		}
	}
	.cell-bad {
		border-right: 1px solid hsl(var(--border) / 0.5);
	}
	.cell-good {
	}

	/* ── Mark ── */
	.mark {
		font-size: 0.875rem;
		font-weight: 700;
		flex-shrink: 0;
		margin-top: 0.1em;
	}
	.mark-bad {
		color: hsl(var(--white33));
	}
	.mark-good {
		color: hsl(var(--blurpleLightColor));
	}

	/* ── Text ── */
	.cell-text {
		font-size: 0.875rem;
		line-height: 1.6;
		margin: 0;
		color: hsl(var(--white66));
	}
	@media (min-width: 640px) {
		.cell-text {
			font-size: 0.9375rem;
		}
	}
	.cell-good .cell-text {
		color: hsl(var(--foreground));
	}
</style>
