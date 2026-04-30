<script>
	import { assets } from '$app/paths';
	import { ChevronRight } from '$lib/components/icons';

	/** @type {'insights' | 'inbox' | 'apps'} */
	let { context = 'insights' } = $props();

	const descriptions = {
		insights: 'Publish your first app to start tracking downloads, zaps and impressions.',
		inbox: 'Publish your first app to see comments and activity from your users.',
		apps: 'Publish your first app to manage it here.'
	};

	const desc = $derived(descriptions[context] ?? descriptions.insights);
</script>

<div class="empty-wrap">
	<div class="empty-panel">
		<h2 class="empty-title">No apps published yet</h2>
		<p class="empty-desc">{desc}</p>

		<div class="qs-cards">
			<!-- Install card -->
			<div class="qs-card">
				<div class="qs-inner">
					<div class="qs-head">
						<img src="{assets}/images/emoji/app.png" alt="" class="qs-emoji" />
						<h3 class="qs-card-title">Install</h3>
					</div>
					<a
						href="https://github.com/zapstore/zsp"
						class="qs-row qs-link"
						target="_blank"
						rel="noopener noreferrer"
					>
						<div class="qs-row-content">
							<span class="qs-row-name">ZSP</span>
							<span class="qs-row-desc">CLI for publishing and managing apps</span>
						</div>
						<span class="qs-chevron"><ChevronRight size={16} color="var(--white33)" /></span>
					</a>
					<div class="qs-row qs-static">
						<div class="qs-row-content">
							<span class="qs-row-name">Studio Apps</span>
							<span class="qs-coming-soon">
								<span class="qs-coming-dot"></span>
								Coming Soon
							</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Documentation card -->
			<div class="qs-card">
				<div class="qs-inner">
					<div class="qs-head">
						<img src="{assets}/images/emoji/documentation.png" alt="" class="qs-emoji" />
						<h3 class="qs-card-title">Documentation</h3>
					</div>
					<a href="/docs/publish" class="qs-row qs-link" rel="noopener">
						<div class="qs-row-content">
							<span class="qs-row-name">Quickstart</span>
							<span class="qs-row-desc">Get up and running with Zapstore</span>
						</div>
						<span class="qs-chevron"><ChevronRight size={16} color="var(--white33)" /></span>
					</a>
					<a href="/docs/faq" class="qs-row qs-link" rel="noopener">
						<div class="qs-row-content">
							<span class="qs-row-name">FAQ</span>
							<span class="qs-row-desc">Common questions and answers</span>
						</div>
						<span class="qs-chevron"><ChevronRight size={16} color="var(--white33)" /></span>
					</a>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.empty-wrap {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 20px;
		display: flex;
		flex-direction: column;
	}

	.empty-panel {
		flex: 1;
		width: 100%;
		background: var(--gray16);
		border-radius: 16px;
		padding: 56px 40px 48px;
	}

	.empty-title {
		font-size: 26px;
		font-weight: 650;
		color: var(--white);
		margin: 0 0 16px;
		letter-spacing: -0.02em;
		text-align: center;
	}

	.empty-desc {
		font-size: 16px;
		color: var(--white66);
		margin: 0 auto 44px;
		line-height: 1.6;
		text-align: center;
		max-width: 360px;
	}

	/* ── Quickstart-style cards ─────────────────────────────────────────── */
	.qs-cards {
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 480px;
		margin: 0 auto;
	}

	.qs-card {
		background: var(--gray33);
		border-radius: 20px;
		overflow: hidden;
	}

	.qs-inner {
		padding: 0 1.25rem;
	}

	.qs-head {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		margin: 0 -1.25rem;
		padding: 1.1rem 1.25rem 0.85rem;
		border-bottom: 1.4px solid var(--white11);
	}

	.qs-emoji {
		width: 30px;
		height: 30px;
		object-fit: contain;
	}

	.qs-card-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--white);
		margin: 0;
	}

	.qs-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin: 0 -1.25rem;
		padding: 0.8rem 1.25rem;
		border-bottom: 1.4px solid var(--white11);
		text-decoration: none;
		color: inherit;
	}

	.qs-row:last-child {
		border-bottom: none;
		padding-bottom: 1rem;
	}

	.qs-link {
		cursor: pointer;
		transition: background 0.12s;
	}

	.qs-link:hover {
		background: var(--white4);
	}

	.qs-static {
		cursor: default;
	}

	.qs-row-content {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		flex: 1;
		min-width: 0;
	}

	.qs-row-name {
		font-weight: 600;
		font-size: 0.875rem;
		color: var(--white);
		display: block;
	}

	.qs-row-desc {
		font-size: 0.8125rem;
		color: var(--white66);
		display: block;
	}

	.qs-chevron {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	.qs-coming-soon {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: color-mix(in srgb, var(--goldColor) 60%, transparent);
		margin-top: 0.15rem;
	}

	.qs-coming-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--goldColor);
		box-shadow: 0 0 8px color-mix(in srgb, var(--goldColor) 80%, transparent);
		animation: coming-pulse 1.5s ease-in-out infinite;
	}

	@keyframes coming-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}
</style>
