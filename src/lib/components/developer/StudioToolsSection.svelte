<script>
	import { ChevronRight } from '$lib/components/icons';
	import { assets } from '$app/paths';

</script>

<section id="quickstart" class="studio-tools-section border-b border-border/50">
  <div class="studio-tools-container">
		<h2 class="studio-quick-start-title section-title text-display-lg section-title-gradient hidden sm:block">Quickstart</h2>
		<p class="section-description studio-quick-start-desc hidden sm:block">Get started with the tools we currently have. Get excited about the ones that are coming.</p>

		<div class="studio-tools-grid">
			<!-- Left: Install panel (gray33) -->
			<div
				class="studio-panel"
				style="background-color: hsl(var(--gray33)); border-radius: var(--radius-32);"
			>
				<div class="studio-panel-inner">
					<div class="studio-panel-header">
						<img src={`${assets}/images/emoji/app.png`} alt="" class="studio-panel-header-img" />
						<h3 class="studio-panel-header-title">Install</h3>
					</div>
					<a href="https://github.com/zapstore/zsp" class="studio-panel-row studio-panel-row-link" target="_blank" rel="noopener noreferrer">
						<div class="studio-panel-row-content">
							<span class="studio-panel-row-name">ZSP</span>
							<span class="studio-panel-row-desc">CLI for publishing and managing apps</span>
						</div>
						<span class="studio-panel-row-chevron"
							><ChevronRight size={16} color="hsl(var(--white33))" /></span
						>
					</a>
					<div class="studio-panel-row studio-panel-row-static">
						<div class="studio-panel-row-content">
							<span class="studio-panel-row-name">Studio Apps</span>
							<span class="studio-coming-soon">
								<span class="studio-coming-soon-dot"></span>
								Coming Soon
							</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Right: Documentation panel (gray33) -->
			<div
				class="studio-panel"
				style="background-color: hsl(var(--gray33)); border-radius: var(--radius-32);"
			>
				<div class="studio-panel-inner">
					<div class="studio-panel-header">
						<img
							src={`${assets}/images/emoji/documentation.png`}
							alt=""
							class="studio-panel-header-img"
						/>
						<h3 class="studio-panel-header-title">Documentation</h3>
					</div>
					<a href="/docs/publish" class="studio-panel-row studio-panel-row-link" rel="noopener">
						<div class="studio-panel-row-content">
							<span class="studio-panel-row-name">Quickstart</span>
							<span class="studio-panel-row-desc">Get up and running with Zapstore</span>
						</div>
						<span class="studio-panel-row-chevron"
							><ChevronRight size={16} color="hsl(var(--white33))" /></span
						>
					</a>
					<a href="/docs/faq" class="studio-panel-row studio-panel-row-link" rel="noopener">
						<div class="studio-panel-row-content">
							<span class="studio-panel-row-name">FAQ</span>
							<span class="studio-panel-row-desc">Common questions and answers</span>
						</div>
						<span class="studio-panel-row-chevron"
							><ChevronRight size={16} color="hsl(var(--white33))" /></span
						>
					</a>
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	/* Match SignedSection: section padding defines inset, inner container 1000px max */
	.studio-tools-section {
		padding: 2rem 1rem 2.5rem;
	}

	@media (min-width: 768px) {
		.studio-tools-section {
			padding: 4.25rem 1.5rem 4.75rem;
		}
	}

	.studio-tools-container {
		max-width: 1000px;
		margin: 0 auto;
	}

	/* Landing-style section header */
	.studio-quick-start-title {
		font-size: 2rem;
		line-height: 1.1;
		margin: 0 0 1rem 0;
		text-align: center;
		letter-spacing: -0.025em;
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}

	@media (min-width: 640px) {
		.studio-quick-start-title {
			font-size: 2.5rem;
			margin-bottom: 1rem;
		}
	}

	@media (min-width: 768px) {
		.studio-quick-start-title {
			font-size: 3rem;
			margin-bottom: 1rem;
		}
	}

	@media (min-width: 1024px) {
		.studio-quick-start-title {
			font-size: 3.5rem;
		}
	}

	@media (min-width: 1280px) {
		.studio-quick-start-title {
			font-size: 4rem;
		}
	}

	.studio-quick-start-desc {
		margin: 0 auto 2.5rem;
		max-width: 28em;
		text-align: center;
	}

	/* Studio Apps: Coming Soon – gold theme (matches ReachKit gateway), text at gold6 */
	.studio-coming-soon {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--goldColor) / 0.6);
		margin-top: 0.15rem;
	}

	@media (min-width: 640px) {
		.studio-coming-soon {
			font-size: 0.875rem;
		}
	}

	.studio-coming-soon-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: hsl(var(--goldColor));
		box-shadow: 0 0 8px hsl(var(--goldColor) / 0.8);
		animation: studio-coming-soon-pulse 1.5s ease-in-out infinite;
	}

	@keyframes studio-coming-soon-pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.studio-tools-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
	}

	@media (min-width: 768px) {
		.studio-tools-grid {
			grid-template-columns: 1fr 1fr;
			gap: 2.75rem;
		}
	}

	.studio-panel-inner {
		padding: 0 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	/* Header: divider spans full width; more spacing emoji–title, more vertical padding */
	.studio-panel-header {
		display: flex;
		align-items: center;
		gap: 1.05rem;
		margin: 0 -1.5rem 0 -1.5rem;
		padding: 1.35rem 1.5rem 1rem 1.5rem;
		border-bottom: 1.4px solid hsl(var(--white11));
	}

	.studio-panel-header-img {
		width: 36px;
		height: 36px;
		object-fit: contain;
	}

	.studio-panel-header-title {
		font-size: 1.0625rem;
		font-weight: 600;
		color: hsl(var(--white));
		margin: 0;
	}

	@media (min-width: 640px) {
		.studio-panel-header-title {
			font-size: 1.2rem;
		}
	}

	@media (min-width: 768px) {
		.studio-panel-header-title {
			font-size: 1.35rem;
		}
	}

	/* Rows: divider spans full width; more horizontal padding */
	.studio-panel-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin: 0 -1.5rem 0 -1.5rem;
		padding: 0.9rem 1.5rem;
		text-decoration: none;
		color: inherit;
		border-bottom: 1.4px solid hsl(var(--white11));
	}

	.studio-panel-row:last-child {
		border-bottom: none;
		padding-bottom: 1.25rem;
	}

	.studio-panel-row-content {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
		flex: 1;
	}

	.studio-panel-row-name {
		font-weight: 600;
		font-size: 0.875rem;
		color: hsl(var(--white));
		display: block;
	}

	.studio-panel-row-desc {
		font-size: 0.8125rem;
		color: hsl(var(--white66));
		display: block;
	}

	@media (min-width: 640px) {
		.studio-panel-row-name {
			font-size: 0.9375rem;
		}

		.studio-panel-row-desc {
			font-size: 0.875rem;
		}
	}

	.studio-panel-row-chevron {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--white33));
	}

	.studio-panel-row-static {
		cursor: default;
	}
</style>
